# Tauri 外壳：Windows 桌面 + Android

一套 Tauri 工程同时承载桌面与安卓，前端产物是 `dist/`，由 `pnpm build:tauri` 生成。

## 目录

```
dist/                  前端产物（pnpm build:tauri）
rust-toolchain.toml    锁定 Rust 工具链（与 Cargo.lock 一起保证可复现）
src-tauri/
  Cargo.toml           模块 feature 开关、依赖版本锁
  tauri.conf.json      窗口、CSP、打包目标、安卓 minSdk
  capabilities/        IPC 权限（只开 core:default）
  icons/               由 app-icon.png 生成，勿手改
  src/
    main.rs            桌面入口
    lib.rs             run()，桌面与安卓共用；单实例、启动失败兜底
    modules/           原生模块槽位，见 PLATFORM_MODULES.md
  gen/                 `tauri android init` 生成 android/；schemas/ 由 tauri-build 每次构建生成
```

## 前置

| 目标 | 需要 |
|---|---|
| Windows 桌面 | Rust 1.99.1（`rust-toolchain.toml` 自动安装）、WebView2（Win11 预装；Win10 多数已随更新安装，缺失时安装包会下载） |
| Android | JDK 17、Android SDK（API 34）、NDK 26、Rust 四个 android target |
| 通用 | Node 22.12+、pnpm 10 |

```sh
rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android
```

## 常用命令

```sh
pnpm tauri:dev        # 起 rspack(8090) + Tauri 窗口，热更新
pnpm tauri:build      # 出安装包（Windows: NSIS + MSI）
pnpm tauri:android:init      # 生成 src-tauri/gen/android
pnpm tauri:android:dev       # 真机/模拟器调试
pnpm tauri:android:build     # 出 APK
```

`tauri.conf.json` 已经把两个钩子接好：

- `beforeDevCommand: pnpm dev:tauri`（带 `APP_TARGET=tauri` 的开发服务器）
- `beforeBuildCommand: pnpm build:tauri`

## 运行时策略：不随包 WebView2

桌面端**不再打包固定版本 WebView2**（`bundle.windows.webviewInstallMode` 已移除），只依赖系统 Evergreen 运行时：

- Windows 11 预装 Edge WebView2；Windows 10 多数已随 Edge/Windows Update 安装，缺失时安装包会通过 Tauri 的 `downloadBootstrapper` 自动下载安装；
- 不再出现“随包运行时与系统架构/版本不匹配”的启动失败，安装包也不会多出数百 MB；
- 仓库里不再有 `src-tauri/webview2/`（约 680MB、且原先被 `.gitignore` 忽略），干净 clone 和 CI 可以直接构建。

只有确实需要离线/锁定内核时才考虑固定运行时，此场景请改用 `offlineInstaller`（把运行时做进安装器），而不是 `fixedRuntime`（运行时会强制 `WEBVIEW2_BROWSER_EXECUTABLE_FOLDER` 指向随包目录）。

桌面端已接入 `tauri-plugin-single-instance`：重复双击只唤起已有窗口，不会开出多个进程争用同一个 WebView2 用户数据目录。

**数据目录兜底**：WebView2 默认用户数据目录是 `%LOCALAPPDATA%\com.letmut.dskchat`。本机实测：当程序装在非系统盘（如 `D:\...`）而数据目录在 `C:` 时，WebView2 环境创建会挂起（窗口一直不出现）。`src-tauri/src/lib.rs` 的 `prepare_webview_data_folder()` 会在两者不同卷时，把数据目录改到 exe 同卷的 `.webview2-data/`；正常装在系统盘时仍使用 `%LOCALAPPDATA%`。

## 版本锁

| 组件 | 锁定版本 |
|---|---|
| Rust 工具链 | 1.99.1（`rust-toolchain.toml`） |
| `tauri` / `tauri-build` | 2.11.5 / 2.6.3 |
| `tauri-runtime` / `tauri-runtime-wry` | 2.11.3 / 2.11.4 |
| `tauri-codegen` / `tauri-macros` | 2.6.3 / 2.6.3 |
| `wry` / `tao` | 0.55.1 / 0.35.3 |
| `webview2-com` / `webview2-com-sys` | 0.38.x |
| JS `@tauri-apps/api` / `@tauri-apps/cli` | 2.11.1 / 2.11.3 |

**为什么锁**：`tauri` 2.12.x 曾在本机（Windows 10 22H2 + WebView2 157）复现 `msedgewebview2.exe` 启动即崩——事件日志为 `msedge.dll` + 异常码 `0x80000003`（Chromium 的 `IMMEDIATE_CRASH`），Tauri 侧表现为 `WebView2 error: HRESULT(0x8000FFFF)`。后续定位到本机启动失败的根因是 **WebView2 用户数据目录与 exe 跨卷**（见上节「数据目录兜底」）；版本锁保留为保险，不应视为唯一根因。

需要说明的是：`wry` 0.55.1 与 0.57.3 的 WebView2 环境创建代码（`CreateCoreWebView2EnvironmentWithOptions`、默认 `--disable-features`）逐行一致，因此版本差异未必是唯一原因；**升级前必须跑 CI 的 Windows 启动测试**，不要把“锁版本”当成根因结论。

**注意**：

- `Cargo.lock` 必须提交，**不要随意 `cargo update`**；升级可能改动 `wry` / `tao` / `webview2-com` 等传递依赖，升级前请跑 CI 的 Windows 启动测试。
- JS 侧 `@tauri-apps/api`、`@tauri-apps/cli` 与 Rust `tauri` 保持同一 minor（2.11.x），避免 codegen/ACL 漂移。

## 启动失败诊断

启动失败不再静默退出：

- 失败信息写入 `%LOCALAPPDATA%\com.letmut.dskchat\startup.log`（release 也会写）；
- Windows 上同时弹出原生错误框，提示日志位置；
- panic 会被记录（release），主线程 panic 还会弹框；`[profile.release]` 已不再使用 `panic = "abort"`。

排查顺序：

1. 看 `startup.log` 的最后一条；
2. 若是 `WebView2 error`，先确认系统 WebView2 是否安装/可升级（`winget upgrade Microsoft.EdgeWebView2Runtime`）；
3. 事件查看器 → Windows 日志 → 应用程序，找 `msedgewebview2.exe` / `msedge.dll` 的 `0x80000003` 记录；
4. 需要更细的日志时，设置 `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--enable-logging --v=1` 再启动。

## CSP

`tauri.conf.json` 的 `app.security.csp` 已按本项目收敛：

- `connect-src` 只放行 `https://api.deepseek.com` 与 Tauri IPC；
- KaTeX / Mermaid 需要内联样式，所以 `style-src` 保留 `'unsafe-inline'`；
- 音频、图片走 `blob:`。

**改动前端请求域名时，必须同步改这里**，否则会被静默拦截（控制台报 CSP 违规）。

## 发布

| 平台 | 需要 |
|---|---|
| Windows | 默认 NSIS 按用户安装（`nsis.installMode = currentUser`，无需管理员）；可选 MSI；代码签名证书建议配置 |
| macOS | Apple Developer ID + 公证；CI 产出 universal dmg（arm64 + x86_64） |
| Android | keystore；`gen/android` 里配置 `signingConfigs` |

自动更新（`tauri-plugin-updater`）尚未接入：需要先确定发布端点并提供 `TAURI_SIGNING_PRIVATE_KEY`，再开启 `createUpdaterArtifacts`；当前通过安装包手动升级。

## CI

`.github/workflows/tauri-desktop.yml`：

- 矩阵：Windows（NSIS + MSI）、macOS universal（arm64 + x86_64 的 dmg）、Linux（deb + rpm）；
- `cargo metadata --locked` 校验锁文件，漂移直接失败；
- 先上传安装包，再做 Windows 启动测试：进程存活、主窗口标题为 `dskchat`、且没有新增 `startup.log` 才算通过；
- 测试结束时用 `taskkill /T` 清理整个进程树，避免残留进程影响下一次运行。

## 排错

| 现象 | 原因 |
|---|---|
| 窗口白屏 | 先看是不是 `pnpm build:tauri` 没跑；再确认 `frontendDist` 指向 `../dist` |
| 接口全部失败、控制台 CSP 报错 | `connect-src` 少了域名 |
| 语音按钮不可用 | 麦克风权限未授予；`isSecureContext` 为 false |
| `cargo check` 卡在下载 | 首次编译 Tauri 依赖较重，属于正常 |
| 启动即退出 | 看 `%LOCALAPPDATA%\com.letmut.dskchat\startup.log`；Windows 还会弹错误框 |
| 事件日志出现 `msedgewebview2.exe` / `msedge.dll` / `0x80000003` | WebView2 内核启动失败：先升级/重装系统 WebView2；仍复现则抓 dump，不要只靠换版本 |
| `tauri build` 报锁文件需要更新 | 说明 `Cargo.lock` 与 `Cargo.toml` 不一致；本地 `cargo update` 后提交锁文件，CI 用 `cargo metadata --locked` 校验 |
