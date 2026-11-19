import { writeArchive } from '../../services/chat/history/zipWriter.js'
import type { ArchiveModule } from '../types.js'

/** 默认实现：fflate 的 STORE 模式流式写入 */
export const webArchive: ArchiveModule = {
  origin: 'web',
  writeZip: (entries) => writeArchive(entries),
}
