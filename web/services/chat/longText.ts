import { translate } from '../../i18n/index.js'
import { platform } from '../../platform/index.js'
import { createId } from '../../utils/id.js'
import { getContextRounds } from './reply.js'
import type { AssistantMessage, FileAttachment, Message, UserMessage } from './types.js'

/**
 * 请求预算。服务端对单次 user input 的限制是 32768 tokens；这里给系统提示、工具声明和
 * 输出预留留出余量，超过预算的长文本改成本地附件，并按当前问题检索片段。
 */
export const MAX_REQUEST_TOKENS = 26000
/** 单条消息估算超过这个值就直接转附件，不再尝试原样发送。 */
const MAX_INLINE_TEXT_TOKENS = 14000
/** 只有足够长的文本才值得附件化，避免把普通长问题也拆走。 */
const MIN_LONG_TEXT_CHARS = 4000
/** 附件切片大小与重叠字符数；按字符而不是 token 切，兼容没有精确 tokenizer 的 Web/Android。 */
const CHUNK_CHARS = 1400
const CHUNK_OVERLAP = 180
const MAX_CACHED_DOCUMENTS = 3
/** 单次请求最多检索几份长文本，避免多份附件把预算切得过碎。 */
const MAX_RETRIEVAL_FILES = 4
/** 分给单份文档的最低预算；低于这个值就不再追加新文档。 */
const MIN_EXCERPT_TOKENS = 400

type Chunk = { order: number; text: string }
type DocumentIndex = { chunks: Chunk[]; outline: string[] }
export type LongTextPlan = {
  /** 实际作为用户消息发送的短问题。 */
  content: string
  /** 只落本地、不会进入 Files API 的长文本附件。 */
  file: FileAttachment
  blob: Blob
}

/**
 * 当前提问的长文本附件读取失败：没有内容可检索，请求应当直接报错，
 * 而不是带着“内容已保存为附件”的说明去问一个模型看不到的问题。
 */
export class LongTextAttachmentError extends Error {
  constructor(readonly fileName: string) {
    super(`long text attachment unavailable: ${fileName}`)
    this.name = 'LongTextAttachmentError'
  }
}

/** 粗略 token 估算：CJK 按 1 token/字，ASCII 按 3 字符/token，再给结构化文本加一点余量。 */
export const estimateTokens = (text: string): number => {
  if (!text) {
    return 0
  }
  let cjk = 0
  let ascii = 0
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0
    if (code >= 0x2e80) {
      cjk += 1
    } else {
      ascii += 1
    }
  }
  return Math.ceil(cjk + ascii / 3 + text.length * 0.25)
}

const assistantText = (message: AssistantMessage): string =>
  message.blocks.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('\n')

/** 只估算真正会进入请求的轮次，避免把失败/被拒绝的历史算进来。 */
const estimateHistoryTokens = (history: Message[]): number =>
  getContextRounds(history).reduce((total, [user, reply]) => {
    // 长文本检索附件不会作为 document 块发送，按名称和检索提示估算即可。
    const fileNames = user.files.map((file) => file.name).join(' ')
    return total + estimateTokens(`${user.content}\n${fileNames}\n${assistantText(reply)}`) + 8
  }, 0)

const stripTitle = (value: string): string =>
  value
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60)

const htmlTitle = (text: string): string => {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(text)
  return match ? stripTitle(match[1]) : ''
}

const firstHeading = (text: string): string => {
  const match = /^\s{0,3}#{1,6}\s+(.+)$/m.exec(text)
  return match ? stripTitle(match[1]) : ''
}

const firstLine = (text: string): string =>
  stripTitle(
    text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean) ?? ''
  )

/** 把用户粘贴的内容拆成“问题/指令”和“文档正文”。 */
const splitInstruction = (text: string): { instruction: string; document: string } => {
  const htmlStart = text.search(/<!doctype\s+html|<html[\s>]/i)
  if (htmlStart > 0) {
    const instruction = text.slice(0, htmlStart).trim()
    if (instruction.length <= 2000) {
      return { instruction, document: text.slice(htmlStart) }
    }
    // 前缀本身就是很长的一段正文时，不要丢掉它，整段按文档处理。
    return { instruction: '', document: text }
  }
  const blank = text.indexOf('\n\n')
  if (blank > 0 && blank <= 2000 && text.length - blank > MIN_LONG_TEXT_CHARS) {
    return { instruction: text.slice(0, blank).trim(), document: text.slice(blank).trim() }
  }
  return { instruction: '', document: text }
}

const isHtml = (text: string): boolean => /<html[\s>]|<!doctype\s+html/i.test(text)

const normalizeSpace = (text: string): string =>
  text
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()

/** 把 HTML 压成可检索的纯文本，同时保留标题作为目录。 */
const documentText = (source: string): { text: string; headings: string[] } => {
  if (!isHtml(source)) {
    const headings = [...source.matchAll(/^\s{0,3}#{1,6}\s+(.+)$/gm)].map((match) =>
      stripTitle(match[1])
    )
    return { text: normalizeSpace(source), headings }
  }

  try {
    const parsed = new DOMParser().parseFromString(source, 'text/html')
    parsed
      .querySelectorAll('script,style,noscript,template,svg,canvas,iframe,object,embed')
      .forEach((element) => element.remove())
    const headings = [...parsed.querySelectorAll('h1,h2,h3,h4,h5,h6')]
      .map((element) => stripTitle(element.textContent ?? ''))
      .filter(Boolean)
    return { text: normalizeSpace(parsed.body?.textContent ?? ''), headings }
  } catch {
    // WebView 不支持 DOMParser 时退化为标签剥离；Android 上仍能工作。
    return {
      text: normalizeSpace(
        source
          .replace(/<(script|style|noscript|template|svg)[\s\S]*?<\/\1>/gi, ' ')
          .replace(/<[^>]+>/g, ' ')
      ),
      headings: [],
    }
  }
}

const splitLongParagraph = (paragraph: string): string[] => {
  if (paragraph.length <= CHUNK_CHARS) {
    return [paragraph]
  }
  const sentences = paragraph.split(/(?<=[。！？.!?])\s+/)
  const parts: string[] = []
  let current = ''
  for (const sentence of sentences.length > 1 ? sentences : [paragraph]) {
    if (sentence.length > CHUNK_CHARS) {
      if (current) {
        parts.push(current)
        current = ''
      }
      for (let offset = 0; offset < sentence.length; offset += CHUNK_CHARS) {
        parts.push(sentence.slice(offset, offset + CHUNK_CHARS))
      }
      continue
    }
    if (current.length + sentence.length + 1 > CHUNK_CHARS && current) {
      parts.push(current)
      current = ''
    }
    current = current ? `${current} ${sentence}` : sentence
  }
  if (current) {
    parts.push(current)
  }
  return parts
}

const chunkText = (text: string): Chunk[] => {
  const paragraphs = text.split(/\n{2,}/).flatMap(splitLongParagraph)
  const chunks: Chunk[] = []
  let current = ''
  const push = () => {
    const value = current.trim()
    if (value) {
      chunks.push({ order: chunks.length, text: value })
    }
    // 短片段不复制整段作为下一块的重叠，否则检索会把同一内容返回两次。
    current = value.length > CHUNK_OVERLAP ? value.slice(-CHUNK_OVERLAP) : ''
  }
  for (const paragraph of paragraphs) {
    if (!paragraph) {
      continue
    }
    if (current && current.length + paragraph.length + 2 > CHUNK_CHARS) {
      push()
    }
    current = current ? `${current}\n\n${paragraph}` : paragraph
  }
  if (current.trim()) {
    chunks.push({ order: chunks.length, text: current.trim() })
  }
  return chunks
}

const buildIndex = (source: string): DocumentIndex => {
  const { text, headings } = documentText(source)
  const chunks = chunkText(text)
  if (headings.length === 0) {
    for (const chunk of chunks.slice(0, 12)) {
      const sentence = chunk.text
        .split(/[。！？.!?\n]/)
        .map((part) => part.trim())
        .find(Boolean)
      if (sentence) {
        headings.push(stripTitle(sentence))
      }
    }
  }
  return { chunks, outline: [...new Set(headings)].slice(0, 24) }
}

const STOP_WORDS = new Set([
  'the',
  'and',
  'for',
  'that',
  'this',
  'with',
  'from',
  'you',
  'are',
  'was',
  'were',
  'have',
  'has',
  'had',
  'not',
  '但是',
  '然后',
  '因为',
  '所以',
  '如果',
  '这个',
  '那个',
  '我们',
  '你们',
  '他们',
  '以及',
  '可以',
  '一个',
  '进行',
  '需要',
  '问题',
  '文档',
  '内容',
])

const queryTerms = (query: string): string[] => {
  const terms = new Set<string>()
  for (const match of query.toLowerCase().matchAll(/[a-z0-9_]{2,}/g)) {
    if (!STOP_WORDS.has(match[0])) {
      terms.add(match[0])
    }
  }
  for (const sequence of query.match(/[\u3400-\u9fff]+/g) ?? []) {
    if (sequence.length === 1) {
      terms.add(sequence)
      continue
    }
    for (let index = 0; index < sequence.length - 1; index += 1) {
      const term = sequence.slice(index, index + 2)
      if (!STOP_WORDS.has(term)) {
        terms.add(term)
      }
    }
  }
  return [...terms]
}

const count = (text: string, term: string): number => {
  let total = 0
  let offset = text.indexOf(term)
  while (offset >= 0) {
    total += 1
    offset = text.indexOf(term, offset + term.length)
  }
  return total
}

/** 轻量 BM25 近似：不依赖 embedding，PC 与 Android WebView 都能直接运行。 */
const selectChunks = (chunks: Chunk[], query: string, budgetTokens: number): Chunk[] => {
  const terms = queryTerms(query)
  if (terms.length === 0) {
    return takeFirstChunks(chunks, budgetTokens)
  }
  const lower = chunks.map((chunk) => chunk.text.toLowerCase())
  const documentFrequency = new Map<string, number>()
  for (const term of terms) {
    documentFrequency.set(term, lower.filter((text) => text.includes(term)).length)
  }
  const scored = chunks
    .map((chunk, index) => {
      const text = lower[index]
      let score = 0
      for (const term of terms) {
        const frequency = count(text, term)
        if (frequency === 0) {
          continue
        }
        const idf = Math.log(1 + chunks.length / (1 + (documentFrequency.get(term) ?? 0)))
        score += frequency * idf
      }
      // 长片段做长度归一化，避免单个大段落垄断结果。
      return { chunk, score: score / Math.sqrt(1 + chunk.text.length / 800) }
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score)
  if (scored.length === 0) {
    return takeFirstChunks(chunks, budgetTokens)
  }
  const selected: Chunk[] = []
  let used = 0
  for (const item of scored) {
    const cost = estimateTokens(item.chunk.text)
    // 高分片段可能很长；跳过放不下的，继续尝试后面更短的片段。
    if (used + cost > budgetTokens) {
      continue
    }
    selected.push(item.chunk)
    used += cost
  }
  if (selected.length === 0 && scored[0]) {
    selected.push({
      ...scored[0].chunk,
      text: truncateToTokens(scored[0].chunk.text, budgetTokens),
    })
  }
  return selected.sort((left, right) => left.order - right.order)
}

const takeFirstChunks = (chunks: Chunk[], budgetTokens: number): Chunk[] => {
  const selected: Chunk[] = []
  let used = 0
  for (const chunk of chunks) {
    const cost = estimateTokens(chunk.text)
    if (used + cost > budgetTokens) {
      continue
    }
    selected.push(chunk)
    used += cost
  }
  if (selected.length === 0 && chunks[0]) {
    selected.push({ ...chunks[0], text: truncateToTokens(chunks[0].text, budgetTokens) })
  }
  return selected
}

const truncateToTokens = (text: string, budgetTokens: number): string => {
  if (estimateTokens(text) <= budgetTokens) {
    return text
  }
  let end = Math.min(text.length, Math.max(0, budgetTokens * 2))
  while (end > 0 && estimateTokens(text.slice(0, end)) > budgetTokens) {
    end = Math.floor(end * 0.8)
  }
  return text.slice(0, end).trimEnd()
}

/** 长文本附件在内存里的原件；发送后的首次检索不必等 IndexedDB 落盘。 */
const blobCache = new Map<string, Blob>()
const indexCache = new Map<string, Promise<DocumentIndex | null>>()

/** 供消息卡片在 IndexedDB 落盘完成前读取刚创建的原件。 */
export const getLongTextBlob = (id: string): Blob | undefined => blobCache.get(id)

export const registerLongTextBlob = (id: string, blob: Blob) => {
  blobCache.set(id, blob)
  indexCache.delete(id)
  while (blobCache.size > MAX_CACHED_DOCUMENTS) {
    const oldest = blobCache.keys().next().value
    if (!oldest) {
      break
    }
    blobCache.delete(oldest)
    indexCache.delete(oldest)
  }
}

/** 老版本 Android WebView 可能没有 Blob.text()，用 FileReader 兜底。 */
const readBlobText = (blob: Blob): Promise<string> => {
  if (typeof blob.text === 'function') {
    return blob.text()
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
    reader.onerror = () => reject(reader.error ?? new Error('Cannot read blob'))
    reader.readAsText(blob)
  })
}

const loadIndex = (file: FileAttachment): Promise<DocumentIndex | null> => {
  const cached = indexCache.get(file.id)
  if (cached) {
    return cached
  }
  const load = (async (): Promise<DocumentIndex | null> => {
    try {
      const blob = blobCache.get(file.id) ?? (await platform.storage.loadFile(file.id))
      if (!blob) {
        return null
      }
      return buildIndex(await readBlobText(blob))
    } catch {
      return null
    }
  })()
  indexCache.set(file.id, load)
  while (indexCache.size > MAX_CACHED_DOCUMENTS) {
    const oldest = indexCache.keys().next().value
    if (!oldest || oldest === file.id) {
      break
    }
    indexCache.delete(oldest)
    blobCache.delete(oldest)
  }
  return load
}

const buildContext = async (
  file: FileAttachment,
  query: string,
  budgetTokens: number,
  signal: AbortSignal
): Promise<string | null> => {
  signal.throwIfAborted()
  const index = await loadIndex(file)
  signal.throwIfAborted()
  // 原件丢失或索引失败：返回 null，由调用方决定报错还是跳过。
  if (!index || index.chunks.length === 0) {
    return null
  }
  const outlineBudget = Math.min(1400, Math.max(0, Math.floor(budgetTokens * 0.25)))
  const outline = truncateToTokens(
    index.outline.map((heading, position) => `${position + 1}. ${heading}`).join('\n'),
    outlineBudget
  )
  // 正文只能落在剩余预算里，否则多份附件的开销会叠加超发。
  const remaining = budgetTokens - estimateTokens(outline) - 1
  const chunks = remaining > 0 ? selectChunks(index.chunks, query, remaining) : []
  if (chunks.length === 0 && !outline) {
    return null
  }
  const body = chunks
    .map(
      (chunk, position) =>
        `[${translate('longTextChunkLabel', { index: position + 1 })}] ${chunk.text}`
    )
    .join('\n\n')
  const sections = [
    `【${translate('longTextAttachmentLabel', { name: file.name })}】`,
    outline ? `${translate('longTextOutlineLabel')}：\n${outline}` : '',
    body ? `${translate('longTextExcerptsLabel')}：\n${body}` : '',
  ].filter(Boolean)
  return sections.join('\n\n')
}

/**
 * 把超预算的文本转成可检索附件。返回 null 表示原样发送即可。
 * 只改写“本次请求”的 question；会话里保存的是短问题 + 附件，不保存全文消息。
 */
export const planLongText = (text: string, history: Message[]): LongTextPlan | null => {
  const trimmed = text.trim()
  if (trimmed.length < MIN_LONG_TEXT_CHARS) {
    return null
  }
  const tokens = estimateTokens(trimmed)
  const historyTokens = estimateHistoryTokens(history)
  if (tokens <= MAX_INLINE_TEXT_TOKENS && tokens + historyTokens <= MAX_REQUEST_TOKENS) {
    return null
  }

  const { instruction, document } = splitInstruction(trimmed)
  if (document.length < MIN_LONG_TEXT_CHARS) {
    return null
  }
  const title =
    htmlTitle(document) ||
    firstHeading(document) ||
    firstLine(document) ||
    translate('longTextUntitled')
  const safeTitle = title.replace(/[\\/:*?"<>|\r\n]+/g, ' ').trim() || translate('longTextUntitled')
  // 统一按纯文本保存：打开附件时不会执行页面脚本，PC 和 Android 都能直接预览。
  const name = `${safeTitle.slice(0, 60)}.txt`
  const blob = new Blob([document], { type: 'text/plain;charset=utf-8' })
  const file: FileAttachment = {
    id: createId(),
    serverId: null,
    name,
    size: blob.size,
    isImage: false,
    mimeType: blob.type,
    retrieval: true,
  }
  registerLongTextBlob(file.id, blob)
  const prompt = instruction || translate('longTextDefaultPrompt')
  return {
    content: `${prompt}\n\n${translate('longTextOffloadNote', { name })}`,
    file,
    blob,
  }
}

/**
 * 为一次请求补充检索片段。历史中所有长文本附件都会参与检索，只把相关片段拼进当前问题，
 * 不把附件作为 document 块发送（服务端会完整保留文档内容，反而会再次超限）。
 */
export const prepareLongTextQuestion = async (
  question: UserMessage,
  history: Message[],
  signal: AbortSignal
): Promise<UserMessage> => {
  // 本轮提问自己的附件优先：它决定这次请求有没有内容可答。
  const current = question.files.filter((file) => file.retrieval)
  const currentIds = new Set(current.map((file) => file.id))
  // 即使用户上一轮回答失败，历史里的长文本附件仍应可检索，否则换一个问题就丢了上下文。
  const historical = history
    .flatMap((message) => (message.role === 'user' ? message.files : []))
    .filter((file) => file.retrieval && !currentIds.has(file.id))
  // 只检索最近几份长文本，避免多个附件把预算切得过碎。
  const historySlots = Math.max(0, MAX_RETRIEVAL_FILES - current.length)
  const files = [...current, ...(historySlots > 0 ? historical.slice(-historySlots) : [])]
  if (files.length === 0) {
    return question
  }
  signal.throwIfAborted()
  const historyTokens = estimateHistoryTokens(history)
  const questionTokens = estimateTokens(question.content)
  const available = Math.max(
    2000,
    Math.min(10000, MAX_REQUEST_TOKENS - historyTokens - questionTokens - 800)
  )
  const perFile = Math.max(MIN_EXCERPT_TOKENS, Math.floor(available / files.length))
  // 首轮的长文本消息带有“已保存为附件”的说明，检索时只用说明前的实际问题。
  const query =
    question.content
      .split(/\n{2,}/)
      .map((part) => part.trim())
      .find(Boolean) ?? question.content
  const contexts: string[] = []
  let used = 0
  for (const file of files) {
    signal.throwIfAborted()
    // 单份文档不超过平均份额，也不超过剩余预算；连最小片段都放不下时停止追加。
    const budget = Math.min(perFile, available - used)
    if (budget < MIN_EXCERPT_TOKENS && contexts.length > 0) {
      break
    }
    try {
      const context = await buildContext(file, query, budget, signal)
      if (context) {
        contexts.push(context)
        used += estimateTokens(context)
      } else if (currentIds.has(file.id)) {
        throw new LongTextAttachmentError(file.name)
      }
    } catch (error) {
      if (signal.aborted || error instanceof LongTextAttachmentError) {
        throw error
      }
      // 本轮提问的附件读不出来必须报错；历史附件缺失只影响参考片段，跳过并留痕。
      if (currentIds.has(file.id)) {
        throw new LongTextAttachmentError(file.name)
      }
      // eslint-disable-next-line no-console
      console.error('[longText] 历史长文本附件无法检索，已跳过', file.id, error)
    }
  }
  if (contexts.length === 0) {
    return question
  }
  return {
    ...question,
    content: `${question.content}\n\n${translate('longTextRetrievalHeader')}\n\n${contexts.join(
      '\n\n'
    )}`,
  }
}
