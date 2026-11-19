# dskchat
dskchat是一款基于 Rust + Tauri 2 的非官方 DeepSeek 客户端。Windows 安装包与 Android APK 开箱即用，无需后端、无需构建，填入 API Key 即可对话。拥有与原版deepseek app/网页版对话几乎一样的本地存储、Markdown / KaTeX / Mermaid、语音输入与朗读、历史导入导出等功能。

[English](README.en.md) | 简体中文

基于 Rust + Tauri 对 DeepSeek API 静态聊天示例（[deepseek-ai/deepseek-chat-demo](https://github.com/deepseek-ai/deepseek-chat-demo)）的Windows / Android 封装。无需自行构建或改配置，下载安装后在设置中填入 API Key 即可使用。

## 下载安装

Release 提供 Windows 安装包（NSIS / MSI）与 Android APK：

- **Windows**：下载 NSIS / MSI 安装包并双击安装。需要 Windows 10/11；WebView2 在 Win11 预装，Win10 多数已随 Edge / Windows Update 安装，缺失时安装包会自动下载。
- **Android**：下载 APK 安装，最低 Android 8.0（API 26）；首次安装需允许“未知来源”。
- **首次使用**：打开设置填入 DeepSeek API Key。Key 只保存在本机 WebView 的 localStorage（明文，未接系统钥匙串），发起对话时会随请求发送给配置的 API 服务；详见[数据](#数据)。

> Windows 安装包未做代码签名，SmartScreen 可能提示风险；Android 首次安装需允许“未知来源”。

## 项目结构

#### 目录

```text
package.json / pnpm-lock.yaml   前端依赖与脚本
rust-toolchain.toml             锁定的 Rust 工具链
web/                            前端（React + TypeScript）
  app/                          应用布局、主题与视口
  components/                   聊天、设置、Markdown 等界面组件
  platform/                     原生模块槽位：契约、默认实现、构建期切换
  i18n/                         中英文文案
  services/
    api/                        API 请求、SSE 与协议类型
    chat/                       会话、消息分支、本地存储与历史导入导出
    markdown/                   Markdown 解析、代码高亮与图表
    speech/                     录音与朗读
  utils/                        通用工具

src-tauri/                      原生外壳（桌面 + Android）
  Cargo.toml / Cargo.lock       Rust 依赖与模块 feature
  src/modules/                  Rust 模块槽位，一个模块一个 Cargo feature
  tauri.conf.json               窗口、CSP、打包目标
  capabilities/                 IPC 权限
  icons/                        各平台应用图标

docs/                           Tauri、平台模块与 Android 文档
scripts/                        Android 权限补丁与 CI 辅助脚本
.github/workflows/              桌面、Android 与 GitHub Pages CI
```

#### 技术栈细节

- **前端**：React 18 + TypeScript，rspack 打包；状态管理 zustand；Markdown 使用 micromark / mdast，代码高亮 Prism，公式 KaTeX，图表 Mermaid；本地存储 IndexedDB（idb），历史导入导出用 fflate 处理 ZIP。
- **桌面 / Android**：Tauri 2（Rust）；桌面使用系统 WebView2，不随包运行时；单实例，启动失败写 `startup.log` 并弹原生错误框；程序装在非系统盘时 WebView2 数据目录落到同卷目录。
- **原生模块**：只有 `system`（打开外链）已实现；`secrets`、`http`、`storage`、`archive`、`search` 目前是契约 / 占位，已接线的模块会自动回落到 Web 实现，未接线的模块保持 Web 实现。完整表格见[原生模块槽位](docs/PLATFORM_MODULES.md)。
- **版本**：Rust 1.99.1（`rust-toolchain.toml` 固定）、`tauri` 2.11.5、`@tauri-apps/api` 2.11.1、`@tauri-apps/cli` 2.11.3；`Cargo.lock` 与 `pnpm-lock.yaml` 用于锁定依赖。

#### 功能

- 多会话、自动标题、重命名与删除；编辑提问、重新生成和切换消息分支。
- 流式回答、深度思考、智能搜索、链接阅读与来源引用；支持停止和符合条件的继续生成。
- 附件上传、粘贴与拖拽，语音输入和回复朗读；移动端录音时输入框首行显示实时频谱。
- Markdown、代码高亮、KaTeX 公式和 Mermaid 图表。
- 简体中文与英文、浅色与深色主题、移动端布局、位置设置、历史导入导出。

#### 数据

API Key 和设置保存在 WebView 的 localStorage（Web 构建是浏览器 profile，桌面端是 WebView2 profile）。原生系统钥匙串槽位尚未实现，因此 Key 以明文保存。会话及附件原件保存在 IndexedDB，本地数据按浏览器用户配置和站点源（origin）隔离。发送对话、上传附件和使用语音功能时，相应内容会提交给配置的 API 服务。

桌面端（Windows）的落盘位置由 `identifier` 推导，目录名即 `com.letmuts.dskchat`：

| 路径 | 内容 | 何时出现 |
|---|---|---|
| `%LOCALAPPDATA%\com.letmuts.dskchat\` | WebView2 用户数据目录：`localStorage`（API Key、语言、主题等设置）、`IndexedDB`（会话与附件原件）、缓存与 cookie | 首次启动。Tauri 在创建窗口前就建好该目录，不等 WebView2 写入，所以刚建好时可能是空目录；正常跑起来后里面会出现 `EBWebView` 子目录 |
| `%LOCALAPPDATA%\com.letmuts.dskchat\startup.log` | 启动失败 / panic 记录 | 仅在启动失败时写入 |

- 目录名来自 [tauri.conf.json](src-tauri/tauri.conf.json) 的 `identifier`；改 `identifier` 会换到新目录，旧数据不会自动迁移（迁移步骤见 [docs/BRANDING.md](docs/BRANDING.md)）。
- exe 与 `%LOCALAPPDATA%` 不在同一卷时，[lib.rs](src-tauri/src/lib.rs) 会把 WebView2 数据目录兜底到 exe 同卷的 `.webview2-data/`（设计说明见 [docs/TAURI.md](docs/TAURI.md)）；实际生效位置以该目录内是否出现 `EBWebView` 子目录为准。
- 退出程序后删除该目录等于清空本地设置、会话与附件缓存，下次启动会重新创建；只想清会话请用设置 → 数据管理 → 删除所有对话。
- Android 端数据在应用私有目录内（由系统沙箱隔离），不适用上表。

设置中的历史导入导出使用 ZIP 格式。导入会在确认并校验成功后替换全部本地会话和附件；导出包含会话与本地可用的图片原件，不包含 API Key、设置或非图片附件原件。格式与保留范围见[历史导入导出](web/services/chat/history/README.md)。

设置 → 数据管理 → 删除所有对话，会在确认后清空全部本地会话、附件原件和未发送的草稿，停止正在生成的回复并回到新对话。API Key 和其他设置保留，已上传到 API 服务的文件不受影响。

## 构建与编译

| 目标 | 需要 |
|---|---|
| 通用 | Node.js 22.12+、pnpm 10 |
| Windows | Rust 1.99.1（`rust-toolchain.toml` 固定）、MSVC C++ 工具链、WebView2 |
| Linux | Rust、`libwebkit2gtk-4.1-dev`、`librsvg2-dev`、`libdbus-1-dev`、`patchelf` |
| Android | JDK 17、Android SDK 34、NDK 26、四个 Rust Android target |

#### Windows

```sh
pnpm install
pnpm tauri:build
```

产物在 `src-tauri/target/release/bundle/`：`nsis/*.exe` 与 `msi/*.msi`。首次构建会联网下载 NSIS / WiX；桌面调试用 `pnpm tauri:dev`。

#### Linux

```sh
sudo apt-get update
sudo apt-get install -y libwebkit2gtk-4.1-dev librsvg2-dev libdbus-1-dev patchelf
pnpm install
pnpm exec tauri build --bundles deb,rpm
```

产物在 `src-tauri/target/release/bundle/deb/` 与 `rpm/`。不指定 `--bundles` 时还会尝试 AppImage，需要额外的打包工具，建议显式指定。

#### Android

```sh
rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android
pnpm tauri:android:init
pnpm tauri:android:build
```

`tauri:android:init` 会自动执行 `scripts/patch-android.mjs` 补 `RECORD_AUDIO` / `INTERNET`；APK 在 `src-tauri/gen/android/app/build/outputs/apk/universal/release/`。上架 Google Play 用 `pnpm tauri android build --aab`，签名配置见 [Android 打包](docs/ANDROID.md)。

## 下一步计划
0.1.2
- 修复安卓端录音功能bug
- 修复app端界面显示不正常
- 修复历史记录无法导出

0.0.3
- 美化图标
- 优化应用内提示
.....



## CI

- `.github/workflows/tauri-desktop.yml`：Windows NSIS/MSI（含启动测试）、macOS universal DMG、Linux deb/rpm。
- `.github/workflows/tauri-android.yml`：Android APK。
- `.github/workflows/pages.yml`：静态站点发布到 GitHub Pages。

## 许可证

[MIT](LICENSE)。构建会将许可证复制到 `dist/LICENSE`，分发时请一并保留；第三方依赖遵循各自的许可证。
