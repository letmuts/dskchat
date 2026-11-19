import { bridge } from '@native/bridge'
import type { SavedFile, SaveOutcome, SystemModule } from '../types.js'
import { shellPlatform } from '../shell.js'

/** 浏览器默认行为：blob URL + a[download]（桌面外壳同样只走这条路径） */
const download = (blob: Blob, name: string) => {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.rel = 'noopener'
  link.style.display = 'none'
  // Safari/WKWebView 只处理挂在文档里的 anchor
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

const joinPath = (directory: string, name: string) =>
  `${directory.replace(/[\\/]+$/, '')}${directory.includes('\\') ? '\\' : '/'}${name}`

/**
 * 归档以 base64 传给原生：Android 的 IPC 走 `window.ipc.postMessage(String)`，
 * 不能像桌面那样传二进制 body（见 `scripts/ipc-protocol.js` 的 `canUseCustomProtocol`）。
 * `readAsDataURL` 由浏览器原生实现，比手写 chunk + btoa 快一个量级。
 */
const encodeArchive = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read the archive'))
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : ''
      const comma = result.indexOf(',')
      if (comma === -1) {
        reject(new Error('Failed to encode the archive'))
      } else {
        resolve(result.slice(comma + 1))
      }
    }
    reader.readAsDataURL(blob)
  })

/** Android：WebView 不支持 blob 下载，交给原生命令写系统「下载」目录。 */
const saveInApp = async (blob: Blob, name: string): Promise<SaveOutcome> => {
  const data = await encodeArchive(blob)
  const saved = await bridge.call<SavedFile>('system_save_file', { name, data })
  return saved.kind === 'file'
    ? { via: 'file', path: saved.path }
    : { via: 'downloads', name: saved.path }
}

export const webSystem: SystemModule = {
  origin: 'web',
  name: 'browser',
  openExternal: (url) => {
    window.open(url, '_blank', 'noopener,noreferrer')
  },
  saveFile: async (blob, name) => {
    download(blob, name)
    return { via: 'download', name, path: null }
  },
}

/**
 * 原生实现：外链交给系统浏览器（system_open_external）。
 * 保存文件按目标系统分流：
 * - 桌面壳沿用浏览器下载（落点由 WebView 决定），再用 system_download_dir 提示目录；
 * - Android 没有下载实现，改走 system_save_file 写入系统「下载」目录。
 */
export const nativeSystem: SystemModule = {
  origin: 'native',
  name: 'tauri',
  openExternal: (url) => {
    void bridge.call('system_open_external', { url }).catch(() => {
      window.open(url, '_blank', 'noopener,noreferrer')
    })
  },
  saveFile: async (blob, name) => {
    if (shellPlatform.mobile) {
      return saveInApp(blob, name)
    }
    download(blob, name)
    // 目录只用于提示，拿不到时退回「请到下载目录查看」的文案
    const directory = await bridge.call<string | null>('system_download_dir').catch(() => null)
    return { via: 'download', name, path: directory ? joinPath(directory, name) : null }
  },
}
