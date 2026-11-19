import type { ModuleId } from './types.js'
import { isModuleId } from './modules/registry.js'

/** 打包目标，由 rspack 的 DefinePlugin 注入 */
export const TARGET: 'web' | 'tauri' = __APP_TARGET__

/** localStorage 中的运行时覆盖键，值是逗号分隔的模块 id */
export const NATIVE_MODULES_KEY = 'chat-demo:native-modules'

const parse = (value: string | null | undefined): ModuleId[] =>
  (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(isModuleId)

/**
 * 运行时覆盖优先于构建期默认值：
 * `?native=secrets,http` > localStorage 中的同名键 > `NATIVE_MODULES` 环境变量。
 */
const readOverride = (): string | null => {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('native')
    if (fromUrl !== null) {
      return fromUrl
    }
    return localStorage.getItem(NATIVE_MODULES_KEY)
  } catch {
    return null
  }
}

/** 本次启动希望启用的原生模块 */
export const requestedModules = (): Set<ModuleId> => {
  const override = readOverride()
  if (override !== null) {
    return new Set(parse(override))
  }
  return new Set(parse(__NATIVE_MODULES__.join(',')))
}

/** 把某个模块固定到原生/Web 实现，便于排查问题 */
export const setRequestedModules = (ids: ModuleId[] | null) => {
  try {
    if (ids === null) {
      localStorage.removeItem(NATIVE_MODULES_KEY)
    } else {
      localStorage.setItem(NATIVE_MODULES_KEY, ids.join(','))
    }
  } catch {
    // 存储不可用时只影响本次启动
  }
}
