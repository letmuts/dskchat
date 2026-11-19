import { bridge } from '@native/bridge'
import type { ShellProbe } from './native/bridge.contract.js'
import type { ModuleId, ModuleOrigin, ModuleStatus, PlatformModules } from './types.js'
import { MODULE_DEFINITIONS } from './modules/registry.js'
import { requestedModules, TARGET } from './switches.js'
import { nativeSecrets, setSecretsModule, webSecrets } from './modules/secrets.js'
import { webHttp } from './modules/http.js'
import { webStorage } from './modules/storage.js'
import { webArchive } from './modules/archive.js'
import { nativeSystem, webSystem } from './modules/system.js'
import { webSearch } from './modules/search.js'

/** 全部槽位的默认实现，行为与改造前完全一致 */
const webModules: PlatformModules = {
  secrets: webSecrets,
  http: webHttp,
  storage: webStorage,
  archive: webArchive,
  system: webSystem,
  search: webSearch,
}

/**
 * 已具备 Rust 实现的槽位。新增一个原生实现时：
 * 1. 在本文件登记；2. 在 registry.ts 把 implemented 改成 true；
 * 3. 在 src-tauri 打开对应 Cargo feature。
 */
const nativeModules: Partial<PlatformModules> = {
  secrets: nativeSecrets,
  system: nativeSystem,
}

let active: PlatformModules = webModules

function buildStatus(probe: ShellProbe | null, requested: Set<ModuleId>): ModuleStatus[] {
  return MODULE_DEFINITIONS.map((definition) => {
    const available = probe?.modules[definition.id] === true
    const wanted = requested.has(definition.id)
    const hasNative = definition.implemented
    const origin: ModuleOrigin = hasNative && available && wanted ? 'native' : 'web'
    let fallbackReason: string | undefined
    if (hasNative && wanted && !available) {
      fallbackReason = probe
        ? '外壳未启用该模块（Cargo feature 未打开）'
        : '未检测到原生外壳，使用 Web 实现'
    } else if (hasNative && !wanted) {
      fallbackReason = '本次启动未请求该模块'
    }
    return {
      id: definition.id,
      title: definition.title,
      origin,
      wired: definition.wired,
      implemented: hasNative,
      fallbackReason,
    }
  })
}

let statuses: ModuleStatus[] = buildStatus(null, new Set())

/**
 * 启动时装配槽位：探测原生外壳，按构建期默认值 + 运行时覆盖选择实现。
 * Web 构建直接返回，不加载任何原生代码。
 */
export const initPlatform = async (): Promise<ModuleStatus[]> => {
  if (TARGET !== 'tauri') {
    return statuses
  }
  const requested = requestedModules()
  let probe: ShellProbe | null = null
  try {
    probe = await bridge.probe()
  } catch {
    probe = null
  }

  const wants = (id: ModuleId) => requested.has(id) && probe?.modules[id] === true
  const next: PlatformModules = {
    ...webModules,
    ...(wants('secrets') && nativeModules.secrets ? { secrets: nativeModules.secrets } : {}),
    ...(wants('system') && nativeModules.system ? { system: nativeModules.system } : {}),
  }

  if (next.secrets.origin === 'native') {
    try {
      const hydrated = await next.secrets.hydrate?.()
      // 钥匙串里没有值时，回落到 localStorage 里的历史值，避免升级后要求重新输入
      if (!hydrated) {
        const legacy = webSecrets.read()
        if (legacy) {
          next.secrets.write(legacy)
        }
      }
    } catch {
      next.secrets = webSecrets
    }
  }

  active = next
  setSecretsModule(next.secrets)
  statuses = buildStatus(probe, requested)
  return statuses
}

/** 平台门面：调用方只依赖这里，具体实现由 initPlatform 装配 */
export const platform = {
  get target(): 'web' | 'tauri' {
    return TARGET
  },
  get secrets() {
    return active.secrets
  },
  get http() {
    return active.http
  },
  get storage() {
    return active.storage
  },
  get archive() {
    return active.archive
  },
  get system() {
    return active.system
  },
  get search() {
    return active.search
  },
  /** 各槽位当前实现，用于诊断 */
  status: (): ModuleStatus[] => statuses,
  /** 本次启动请求启用的原生模块 */
  requested: (): ModuleId[] => [...requestedModules()],
}
