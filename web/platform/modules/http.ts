import * as client from '../../services/api/client.js'
import * as speech from '../../services/api/speech.js'
import type { HttpModule } from '../types.js'

/**
 * 默认实现：浏览器 fetch + 自研 SSE 解析。
 * Rust 版本就绪后，在这里旁边导出 nativeHttp，并在 index.ts 的装配表里登记，
 * 接口签名保持不变，调用方无需改动。
 */
export const webHttp: HttpModule = {
  origin: 'web',
  verifyApiKey: client.verifyApiKey,
  uploadFile: client.uploadFile,
  deleteFile: client.deleteFile,
  streamMessage: client.streamMessage,
  transcribe: speech.transcribe,
  synthesize: speech.synthesize,
}
