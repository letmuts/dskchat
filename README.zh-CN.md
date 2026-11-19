# chat-demo

[English](README.md) | 简体中文

基于 DeepSeek API 的静态聊天示例。无需应用后端，浏览器直接请求配置的 API 服务。

点击 [在线体验](https://deepseek-ai.github.io/chat-demo/) 即可使用，也可以前往 [Releases](https://github.com/deepseek-ai/deepseek-chat-demo/releases) 下载压缩包，解压后双击 `index.html` 在本地使用，无需安装或构建。首次使用时，请在设置中填写 API Key。

## 环境要求

| 目标 | 需要 |
|---|---|
| Web | Node.js 22.12+、pnpm 10 |
| Windows 桌面 | Rust 1.99.1（由 `rust-toolchain.toml` 固定）、WebView2（Win11 预装；Win10 随 Edge/更新安装，缺失时安装包自动补装） |
| Android | JDK 17、Android SDK 34、NDK 26，以及 [Android 打包](docs/ANDROID.md) 里的四个 Rust target |

## 运行

准备 Node.js 22.12+ 和 pnpm：

```sh
git clone https://github.com/deepseek-ai/chat-demo.git
cd chat-demo
pnpm install
pnpm dev
```

打开 http://localhost:8090 。

生成静态产物：

```sh
pnpm build
```

产物位于 `dist/`，可部署到静态服务器，也可直接打开 `dist/index.html`。直接打开时，浏览器和 API 服务需允许 `file://` 页面的存储与跨域请求。

## 桌面与安卓

同一份前端代码可以打三个平台，原生外壳在 `src-tauri/`（Tauri 2）：

```sh
pnpm tauri:build          # Windows 桌面安装包（NSIS / MSI）
pnpm tauri:android:init   # 首次：生成 Android 工程（需要 JDK 17 + SDK + NDK）
pnpm tauri:android:build  # 生成 APK
```

桌面端使用系统 Evergreen WebView2，不随包运行时；安装包使用 Tauri 的 `downloadBootstrapper`，缺失时自动下载安装。

- 外壳是单实例，第二次启动只唤起已有窗口。
- 启动失败会写入 `%LOCALAPPDATA%\com.deepseek.chatdemo\startup.log` 并弹出原生错误框。
- 程序装在非系统盘时，WebView2 数据目录会自动落到程序同卷目录。

`node_modules/`、`dist/`、`src-tauri/target/`、`src-tauri/gen/` 只用于构建，已被 gitignore；前端产物会嵌入桌面二进制，运行时不需要这些目录。

桌面与移动共用 `dist/`，`pnpm build` 仍然是最小可运行的静态站点。需要把部分能力换成 Rust 时，
在 `src-tauri` 打开对应的 Cargo feature 即可，前端会在启动时切换，探测失败自动回落：

- [原生模块槽位：TS ↔ Rust 怎么切换](docs/PLATFORM_MODULES.md)
- [Tauri 外壳：构建、CSP、发布](docs/TAURI.md)
- [Android 打包](docs/ANDROID.md)

## 模块现状

前端默认使用 Web 实现。Rust 槽位按 Cargo feature 选择性启用，目前只有 `system`（打开外链）已实现；`secrets`、`http`、`storage`、`archive`、`search` 目前是契约/占位，已接线的模块会自动回落到 Web 实现，未接线的模块保持 Web 实现。完整表格见[原生模块槽位](docs/PLATFORM_MODULES.md)。

## 功能

- 多会话、自动标题、重命名与删除；编辑提问、重新生成和切换消息分支。
- 流式回答、深度思考、智能搜索、链接阅读与来源引用；支持停止和符合条件的继续生成。
- 附件上传、粘贴与拖拽，语音输入和回复朗读；移动端录音时输入框首行显示实时频谱。
- Markdown、代码高亮、KaTeX 公式和 Mermaid 图表。
- 简体中文与英文、浅色与深色主题、移动端布局、位置设置、历史导入导出。

## 数据

API Key 和设置保存在 WebView 的 localStorage（Web 构建是浏览器 profile，桌面端是 WebView2 profile）。原生系统钥匙串槽位尚未实现，因此 Key 以明文保存。会话及附件原件保存在 IndexedDB，本地数据按浏览器用户配置和站点源（origin）隔离。发送对话、上传附件和使用语音功能时，相应内容会提交给配置的 API 服务。

设置中的历史导入导出使用 ZIP 格式。导入会在确认并校验成功后替换全部本地会话和附件；导出包含会话与本地可用的图片原件，不包含 API Key、设置或非图片附件原件。格式与保留范围见[历史导入导出](web/services/chat/history/README.md)。

设置 → 数据管理 → 删除所有对话，会在确认后清空全部本地会话、附件原件和未发送的草稿，停止正在生成的回复并回到新对话。API Key 和其他设置保留，已上传到 API 服务的文件不受影响。

## 开发

| 命令                       | 用途                             |
| -------------------------- | -------------------------------- |
| `pnpm dev`                 | 启动开发服务器                   |
| `pnpm build`               | 构建静态站点到 `dist/`           |
| `pnpm build:tauri`         | 构建给原生外壳加载的前端产物     |
| `pnpm tauri:dev`           | 桌面端开发（rspack + 窗口）      |
| `pnpm tauri:build`         | 桌面端安装包                     |
| `pnpm tauri:android:init`  | 生成 Android 工程（首次）        |
| `pnpm tauri:android:build` | Android APK                      |
| `pnpm type`                | TypeScript 类型检查              |
| `pnpm lint`                | oxlint 检查                      |
| `pnpm format`              | oxfmt 格式化                     |

[rspack.config.ts](rspack.config.ts) 默认连接 `https://api.deepseek.com`。`createConfig({ apiOrigin, target, nativeModules, devServer })` 支持自定义 API 地址、打包目标和原生模块开关。

聊天默认使用 `deepseek-flash`，通过 Anthropic 兼容的 Messages / Files API 通信；语音使用 ASR / TTS 接口。请求使用搜索、链接阅读、标题和 `latest_reminder` 等扩展，接入服务需支持相应能力。附件实际支持的格式以服务端校验为准。

```text
web/                   前端（React + TypeScript）
  app/                 应用布局、主题与视口
  components/          聊天、设置、Markdown 等界面组件
  platform/            原生模块槽位：契约、默认实现、构建期切换
  i18n/                中英文文案
  services/
    api/               API 请求、SSE 与协议类型
    chat/              会话、消息分支、本地存储与历史导入导出
    markdown/          Markdown 解析、代码高亮与图表
    speech/            录音与朗读
  utils/               通用工具

src-tauri/             原生外壳（桌面 + Android）
  src/modules/         Rust 模块槽位，一个模块一个 Cargo feature
  tauri.conf.json      窗口、CSP、打包目标
  capabilities/        IPC 权限
  icons/               各平台应用图标

docs/                  Tauri、平台模块与 Android 文档
scripts/               Android 权限补丁与 CI 辅助脚本
.github/workflows/     桌面、Android 与 GitHub Pages CI
rust-toolchain.toml    锁定的 Rust 工具链
```

## CI

- `.github/workflows/tauri-desktop.yml`：Windows NSIS/MSI（含启动冒烟）、macOS universal DMG、Linux deb/rpm。
- `.github/workflows/tauri-android.yml`：Android APK。
- `.github/workflows/pages.yml`：静态站点发布到 GitHub Pages。

## 许可证

[MIT](LICENSE)。构建会将许可证复制到 `dist/LICENSE`，分发时请一并保留；第三方依赖遵循各自的许可证。
