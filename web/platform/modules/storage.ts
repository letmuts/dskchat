import * as db from '../../services/chat/db.js'
import type { StorageModule } from '../types.js'

/**
 * 默认实现：IndexedDB（idb）。
 * 逐项列出而不是展开命名空间，保证槽位契约变化时能被类型检查发现。
 */
export const webStorage: StorageModule = {
  origin: 'web',
  loadSessionSummaries: db.loadSessionSummaries,
  loadSession: db.loadSession,
  saveSession: db.saveSession,
  renameSession: db.renameSession,
  deleteSession: db.deleteSession,
  saveFiles: db.saveFiles,
  loadFile: db.loadFile,
  clearStaging: db.clearStaging,
  addStagingSession: db.addStagingSession,
  saveStagingFiles: db.saveStagingFiles,
  updateStagingFileTypes: db.updateStagingFileTypes,
  commitStaging: db.commitStaging,
  reportStorageError: db.reportStorageError,
}
