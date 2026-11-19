import type { ModuleId } from '../types.js'

/** `platform_probe` 的返回：外壳身份 + 每个模块的原生实现是否可用 */
export type ShellProbe = {
  shell: string
  version: string
  modules: Partial<Record<ModuleId, boolean>>
  platform: { os: string; arch: string; mobile: boolean }
}

/**
 * 原生桥接契约。实现由构建期别名切换：
 * - web 构建解析到 bridge.web.js（任何调用都抛错）
 * - tauri 构建解析到 bridge.tauri.js（@tauri-apps/api 的 invoke）
 */
export type ShellBridge = {
  probe(): Promise<ShellProbe>
  call<T>(command: string, args?: Record<string, unknown>): Promise<T>
}
