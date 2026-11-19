import { invoke } from '@tauri-apps/api/core'
import type { ShellBridge, ShellProbe } from './bridge.contract.js'

/** tauri 构建使用的桥接：直接走 @tauri-apps/api 的 invoke */
export const bridge: ShellBridge = {
  probe: () => invoke<ShellProbe>('platform_probe'),
  call: <T>(command: string, args?: Record<string, unknown>) => invoke<T>(command, args),
}
