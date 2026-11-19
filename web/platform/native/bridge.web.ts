import type { ShellBridge, ShellProbe } from './bridge.contract.js'

const unavailable = (): never => {
  throw new Error('Native bridge is not available in the web build')
}

/** web 构建使用的桥接：不可用，保留同签名避免调用方分支 */
export const bridge: ShellBridge = {
  probe: async (): Promise<ShellProbe> => unavailable(),
  call: async <T>(): Promise<T> => unavailable(),
}
