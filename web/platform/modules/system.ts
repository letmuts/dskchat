import { bridge } from '@native/bridge'
import type { SystemModule } from '../types.js'

/** 浏览器默认行为：blob URL + a[download] */
const download = (blob: Blob, name: string) => {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export const webSystem: SystemModule = {
  origin: 'web',
  name: 'browser',
  openExternal: (url) => {
    window.open(url, '_blank', 'noopener,noreferrer')
  },
  saveFile: async (blob, name) => {
    download(blob, name)
  },
}

/**
 * 原生实现：外链交给系统浏览器（system_open_external）。
 * 保存文件还没有对应命令，先复用浏览器下载，避免功能回退。
 */
export const nativeSystem: SystemModule = {
  origin: 'native',
  name: 'tauri',
  openExternal: (url) => {
    void bridge.call('system_open_external', { url }).catch(() => {
      window.open(url, '_blank', 'noopener,noreferrer')
    })
  },
  saveFile: (blob, name) => webSystem.saveFile(blob, name),
}
