/**
 * 外壳身份，来自启动时的 `platform_probe`。
 *
 * Web 构建（含手机浏览器）保持默认值；只有跑在 Tauri 外壳里才会被
 * [initPlatform](./index.ts) 覆写。保存在独立模块里，是为了让
 * [system 槽位](./modules/system.ts) 读取时不必反向 import `index.ts`（会成环）。
 */
export type ShellPlatform = {
  /** 目标系统，例如 `android`、`windows`、`macos` */
  os: string
  arch: string
  /** 移动端（Android / iOS） */
  mobile: boolean
}

const defaults: ShellPlatform = { os: 'web', arch: 'unknown', mobile: false }

export const shellPlatform: ShellPlatform = { ...defaults }

export const setShellPlatform = (next: ShellPlatform) => {
  shellPlatform.os = next.os
  shellPlatform.arch = next.arch
  shellPlatform.mobile = next.mobile
}
