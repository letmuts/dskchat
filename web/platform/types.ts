import type { CreateMessageRequest, FileObject, FilePurpose, MessageStreamEvent } from '../services/api/types.js'
import type { TtsVoice } from '../services/api/speech.js'
import type { StoredFile } from '../services/chat/db.js'
import type { Session, SessionSummary } from '../services/chat/types.js'

/**
 * 可被 Rust 重写的模块槽位。
 * 每个 id 同时对应 src-tauri 里的一个 Cargo feature（module-<id>），
 * 编译期启用后由 `platform_probe` 上报，前端即可切换到原生实现。
 */
export type ModuleId = 'secrets' | 'http' | 'storage' | 'archive' | 'system' | 'search'

/** 当前生效的实现来源 */
export type ModuleOrigin = 'web' | 'native'

/** 槽位的装配状态，供启动日志与设置页诊断使用 */
export type ModuleStatus = {
  id: ModuleId
  title: string
  /** 实际选中的实现 */
  origin: ModuleOrigin
  /** 调用方是否已经接入槽位；未接线的模块即使启用也不会改变行为 */
  wired: boolean
  /** Rust 侧是否提供了实现 */
  implemented: boolean
  /** 为什么回落到 Web 实现（仅 origin 为 web 且有原生实现时出现） */
  fallbackReason?: string
}

/** API Key 的存取。Web 用 localStorage，原生可换成系统钥匙串。 */
export type SecretsModule = {
  readonly origin: ModuleOrigin
  /** 同步读取；原生实现启动时由 hydrate 预载 */
  read(): string | null
  write(value: string | null): void
  /** 原生实现启动阶段调用一次，把钥匙串里的值载入内存 */
  hydrate?: () => Promise<string | null>
}

/** 全部联网请求：聊天流、文件、语音。 */
export type HttpModule = {
  readonly origin: ModuleOrigin
  verifyApiKey(apiKey: string, signal?: AbortSignal): Promise<void>
  uploadFile(
    apiKey: string,
    file: File,
    purpose: FilePurpose | null,
    signal?: AbortSignal
  ): Promise<FileObject>
  deleteFile(apiKey: string, fileId: string): Promise<void>
  streamMessage(
    apiKey: string,
    body: CreateMessageRequest,
    signal: AbortSignal
  ): AsyncGenerator<MessageStreamEvent>
  transcribe(apiKey: string, audio: Blob, signal?: AbortSignal): Promise<string>
  synthesize(
    apiKey: string,
    text: string,
    voice: TtsVoice,
    signal: AbortSignal
  ): Promise<ReadableStream<Uint8Array>>
}

/** 会话与附件的本地持久化，对应 services/chat/db.ts 的全部读写。 */
export type StorageModule = {
  readonly origin: ModuleOrigin
  loadSessionSummaries(): Promise<SessionSummary[]>
  loadSession(id: string): Promise<Session | undefined>
  saveSession(session: Session, files?: StoredFile[]): Promise<void>
  renameSession(id: string, title: string): Promise<void>
  deleteSession(sessionId: string): Promise<void>
  saveFiles(files: StoredFile[]): Promise<void>
  loadFile(id: string): Promise<Blob | undefined>
  clearStaging(): Promise<void>
  addStagingSession(session: Session): Promise<void>
  saveStagingFiles(files: StoredFile[]): Promise<void>
  updateStagingFileTypes(types: ReadonlyMap<string, string>): Promise<void>
  commitStaging(): Promise<SessionSummary[]>
  reportStorageError(action: string): (error: unknown) => void
}

export type ArchiveEntry = { name: string; blob: Blob }

/** 历史归档的 ZIP 读写；当前只接线了写出。 */
export type ArchiveModule = {
  readonly origin: ModuleOrigin
  writeZip(entries: ArchiveEntry[]): Promise<Blob>
}

/**
 * 保存结果。各平台能确认的信息不同，界面据此给出「文件去哪了」的提示。
 */
export type SaveOutcome =
  /** 交给浏览器下载（浏览器 / 桌面外壳）；`path` 是推断出的完整路径，取不到时为 null */
  | { readonly via: 'download'; readonly name: string; readonly path: string | null }
  /** 已写入系统「下载」目录（Android MediaStore），`name` 为文件名 */
  | { readonly via: 'downloads'; readonly name: string }
  /** 已写入应用专属目录（Android 9 及以下），`path` 为完整路径 */
  | { readonly via: 'file'; readonly path: string }

/** `system_save_file` 的返回：`downloads` 时 path 是文件名，`file` 时是完整路径。 */
export type SavedFile = { readonly kind: 'downloads' | 'file'; readonly path: string }

/** 平台相关动作：打开外链、把文件落到用户可访问的位置。 */
export type SystemModule = {
  readonly origin: ModuleOrigin
  /** 平台名，仅用于展示与排错 */
  readonly name: string
  openExternal(url: string): void
  /** 保存导出文件；返回值用于提示用户文件去了哪里 */
  saveFile(blob: Blob, name: string): Promise<SaveOutcome>
}

export type SearchHit = { sessionId: string; messageId: string; snippet: string }

/** 跨会话全文检索；当前未接线，仅登记槽位。 */
export type SearchModule = {
  readonly origin: ModuleOrigin
  query(text: string, limit?: number): Promise<SearchHit[]>
}

export type PlatformModules = {
  secrets: SecretsModule
  http: HttpModule
  storage: StorageModule
  archive: ArchiveModule
  system: SystemModule
  search: SearchModule
}
