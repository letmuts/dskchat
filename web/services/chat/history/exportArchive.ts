import { platform } from '../../../platform/index.js'
import type { Session } from '../types.js'
import { getLongTextBlob } from '../longText.js'
import { EXPORT_FORMAT_VERSION, type Manifest, type SessionIndexEntry } from './format.js'
import { INDEX_PATH, MANIFEST_PATH, attachmentPath, sessionPath } from './paths.js'
import { toIndexEntry, toSessionFile } from './toArchive.js'

const json = (value: unknown) => new Blob([JSON.stringify(value)], { type: 'application/json' })

/**
 * 按导出格式生成 ZIP：manifest → 全部会话 JSON → index → 全部附件原件（图片与长文本检索附件）。
 * 没有账号信息，不写 user.json；其他附件只有元数据。
 */
export const exportArchive = async (
  sessions: Iterable<Session> | AsyncIterable<Session>
): Promise<Blob> => {
  const manifest: Manifest = { export_format_version: EXPORT_FORMAT_VERSION }
  const entries = [{ name: MANIFEST_PATH, blob: json(manifest) }]
  const fileEntries: { name: string; blob: Blob }[] = []
  const index: SessionIndexEntry[] = []
  const originals = new Map<string, Blob | undefined>()
  for await (const session of sessions) {
    for (const message of session.messages) {
      if (message.role === 'user') {
        for (const file of message.files) {
          if ((file.isImage || file.retrieval) && !originals.has(file.id)) {
            // 刚发出的长文本可能还没完成 IndexedDB 落盘，先读内存缓存里的原件。
            originals.set(
              file.id,
              getLongTextBlob(file.id) ?? (await platform.storage.loadFile(file.id))
            )
          }
        }
      }
    }
    const files = new Map<string, Blob>()
    const data = toSessionFile(session, ({ id, name, isImage, retrieval }) => {
      const blob = originals.get(id)
      if (!blob || (!isImage && !retrieval)) {
        return null
      }
      const path = attachmentPath(session.id, id, name)
      files.set(path, blob)
      return path
    })
    entries.push({ name: sessionPath(session.id), blob: json(data) })
    for (const [name, blob] of files) {
      fileEntries.push({ name, blob })
    }
    index.push(toIndexEntry(data))
  }
  entries.push({ name: INDEX_PATH, blob: json(index) })
  return platform.archive.writeZip(entries.concat(fileEntries))
}
