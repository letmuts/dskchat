import type { SearchModule } from '../types.js'

/**
 * 未接线的槽位：前端还没有搜索入口，这里保留契约。
 * Rust 版本用 SQLite FTS5 实现后，把 createNativeSearch 登记到 index.ts 即可。
 */
export const webSearch: SearchModule = {
  origin: 'web',
  query: async () => {
    throw new Error('Cross-session search is not wired yet')
  },
}
