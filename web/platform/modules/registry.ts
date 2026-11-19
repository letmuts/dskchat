import type { ModuleId } from '../types.js'

/**
 * 槽位登记表。新增一个可被 Rust 重写的模块时，在这里加一行，
 * 并在 src-tauri/src/modules/registry.rs 的 `enabled()` 里加同名分支。
 */
export type ModuleDefinition = {
  id: ModuleId
  title: string
  /** 调用方是否已经改成走槽位；false 表示只登记、行为不变 */
  wired: boolean
  /** Rust 侧是否已经提供实现 */
  implemented: boolean
  description: string
}

export const MODULE_DEFINITIONS: readonly ModuleDefinition[] = [
  {
    id: 'secrets',
    title: 'API Key 存储',
    wired: true,
    implemented: false,
    description:
      'Web 用 localStorage；Rust 命令 secrets_get / secrets_set 已定义，钥匙串实现待补（启用后自动回落）',
  },
  {
    id: 'http',
    title: '联网请求',
    wired: true,
    implemented: false,
    description: '聊天流、文件上传、语音识别与合成；计划由 reqwest + ipc::Channel 承担',
  },
  {
    id: 'storage',
    title: '本地持久化',
    wired: true,
    implemented: false,
    description: '会话与附件；计划由 SQLite 承担',
  },
  {
    id: 'archive',
    title: '历史归档',
    wired: true,
    implemented: false,
    description: '导出已接线（writeZip）；导入仍直连 zipReader，切换 Rust 时需要一并改',
  },
  {
    id: 'system',
    title: '系统集成',
    wired: true,
    implemented: true,
    description: '外链交给系统浏览器（tauri-plugin-opener，桌面与安卓通用）；保存文件仍走浏览器下载',
  },
  {
    id: 'search',
    title: '全文检索',
    wired: false,
    implemented: false,
    description: '跨会话搜索；计划由 SQLite FTS5 承担，当前前端还没有入口',
  },
]

export const MODULE_IDS = MODULE_DEFINITIONS.map((definition) => definition.id)

export const isModuleId = (value: string): value is ModuleId =>
  (MODULE_IDS as string[]).includes(value)
