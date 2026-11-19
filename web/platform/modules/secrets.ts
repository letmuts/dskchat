import { bridge } from '@native/bridge'
import type { SecretsModule } from '../types.js'

/** API Key 在 localStorage 中的键名，与历史版本保持一致 */
export const API_KEY_STORAGE_KEY = 'chat-demo:api-key'

const readLocal = (): string | null => {
  try {
    return localStorage.getItem(API_KEY_STORAGE_KEY)
  } catch {
    return null
  }
}

const writeLocal = (value: string | null) => {
  try {
    if (value === null) {
      localStorage.removeItem(API_KEY_STORAGE_KEY)
    } else {
      localStorage.setItem(API_KEY_STORAGE_KEY, value)
    }
  } catch {
    // 存储不可用时只在内存中生效
  }
}

export const webSecrets: SecretsModule = {
  origin: 'web',
  read: readLocal,
  write: writeLocal,
}

/** 原生实现的内存副本；hydrate 之前为空 */
let cached: string | null = null

export const nativeSecrets: SecretsModule = {
  origin: 'native',
  read: () => cached,
  write: (value) => {
    cached = value
    void bridge.call('secrets_set', { key: API_KEY_STORAGE_KEY, value }).catch(() => {
      // 写系统钥匙串失败时保留内存值，不打断对话
    })
  },
  hydrate: async () => {
    const stored = await bridge.call<string | null>('secrets_get', { key: API_KEY_STORAGE_KEY })
    cached = stored
    return stored
  },
}

/**
 * 当前生效的实现。settings.ts 只依赖这里的读写函数，
 * 不直接引用 platform 门面，避免 settings ↔ i18n ↔ api ↔ platform 的循环依赖。
 */
let active: SecretsModule = webSecrets

export const setSecretsModule = (next: SecretsModule) => {
  active = next
}

export const readApiKey = (): string | null => active.read()

export const writeApiKey = (value: string | null) => {
  active.write(value)
}
