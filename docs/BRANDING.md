# 品牌与命名：dskchat

本文记录本应用从 **Chat Demo / chat-demo / com.deepseek.chatdemo** 更名为 **dskchat** 的全部约定：
改了哪些地方、哪些旧名是刻意保留的、对本地数据与安装升级有什么影响，以及将来基于上游模板升级时应该怎么处理。

> 适用版本：`0.1.1` 完成改名，`0.1.2` 复核（2026-11-20）。下文 §2 的改动清单是 0.1.1 的历史记录，链接与命令已按当前仓库更新。
> 上游模板：[deepseek-ai/deepseek-chat-demo](https://github.com/deepseek-ai/deepseek-chat-demo)（本地快照见 `code/1/chat-demo-main`）。
> 改名原因：`deskchat` 与其他项目重名；同时把 Android 包名收归到自己的命名空间。

## 1. 命名口径

同一款应用在不同层面有不同写法，**改名前先对照本表**，避免只改一半：

| 用途 | 取值 | 由谁决定 | 说明 |
|---|---|---|---|
| 应用显示名 | `dskchat` | [tauri.conf.json](../src-tauri/tauri.conf.json) `productName`、窗口 `title`、[i18n](../web/i18n/zh.ts) `appName`、[index.html](../web/index.html) `<title>` | 侧边栏、窗口标题、安装器、任务栏、浏览器标签页 |
| npm 包名 | `dskchat` | [package.json](../package.json) `name` | 仅项目元数据，不影响运行时；`pnpm` 输出会显示它 |
| Rust 包 / 二进制 | `dskchat` → `dskchat.exe` | [Cargo.toml](../src-tauri/Cargo.toml) `[package] name` | 决定 exe 文件名与进程名，CI 冒烟按它断言 |
| Rust lib | `dskchat_lib` | `Cargo.toml` `[lib] name` + [main.rs](../src-tauri/src/main.rs) | 两者必须一致，否则编译失败 |
| Bundle identifier | `com.letmuts.dskchat` | `tauri.conf.json` `identifier` | 同时是 **Android applicationId** 与 Windows 数据目录名 |
| Windows 数据目录 | `%LOCALAPPDATA%\com.letmuts.dskchat` | 由 identifier 推导 | 见 §4.1；装在非系统盘时另有兜底路径 |
| 启动日志 | `%LOCALAPPDATA%\com.letmuts.dskchat\startup.log` | [lib.rs](../src-tauri/src/lib.rs) 硬编码 | 必须与 identifier 一致，否则文档/排错会指错目录 |
| localStorage 前缀 | `chat-demo:`（**未改**） | [settings.ts](../web/services/settings.ts)、[secrets.ts](../web/platform/modules/secrets.ts)、[switches.ts](../web/platform/switches.ts) | 刻意保留，见 §3 |
| IndexedDB 名 | `chat-demo`（**未改**） | [db.ts](../web/services/chat/db.ts) | 刻意保留，见 §3 |
| 历史导出文件名 | `deepseek_data-<日期>.zip`（**未改**） | [backup.ts](../web/services/chat/backup.ts)、[format.ts](../web/services/chat/history/format.ts) | 上游导入导出格式约定，改名没有收益 |

**显示名统一小写 `dskchat`**（不是 `Dskchat` / `Deskchat` / `Desk Chat`）。这是有意选择：品牌字符串只保留一种写法，避免安装器、窗口标题、文档三处不一致。

## 2. 本次改动清单

0.1.1 改名共 15 个文件、47 行（`git diff --stat`，不含本文件）。按影响面分四组。

### 2.1 标识与安装（[tauri.conf.json](../src-tauri/tauri.conf.json)）

| 键 | 原值 | 新值 |
|---|---|---|
| `productName` | `Chat Demo` | `dskchat` |
| `identifier` | `com.deepseek.chatdemo` | `com.letmuts.dskchat` |
| `app.windows[0].title` | `Chat Demo` | `dskchat` |
| `bundle.shortDescription` | `DeepSeek API chat demo` | `dskchat — DeepSeek API chat client` |
| `bundle.longDescription` | `A static chat client for the DeepSeek API. …` | `dskchat: a static chat client for the DeepSeek API. …` |

`productName` 与 `identifier` 共同决定安装器身份：前者影响安装目录、开始菜单、卸载项，后者影响数据目录与安卓包名。两者都变了，意味着旧版本不会被当作同一个应用升级（见 §4.2）。

### 2.2 Rust 外壳

| 文件 | 改动 |
|---|---|
| [Cargo.toml](../src-tauri/Cargo.toml) | `name = "chat-demo"` → `dskchat`；`description` 同步；`[lib] name = "chat_demo_lib"` → `dskchat_lib` |
| [Cargo.lock](../src-tauri/Cargo.lock) | 根包名同步（cargo 自动重写，包条目按字母序移动；依赖版本未变） |
| [main.rs](../src-tauri/src/main.rs) | `chat_demo_lib::run()` → `dskchat_lib::run()` |
| [lib.rs](../src-tauri/src/lib.rs) | stderr：`dskchat.exe failed to start: {message}`；错误框标题：`dskchat.exe 启动失败`；`startup.log` 目录：`com.letmuts.dskchat` |

错误框标题里特意带 `dskchat.exe`：用户反馈问题时能直接对应到进程/文件名。

### 2.3 前端显示

| 文件 | 改动 |
|---|---|
| [web/i18n/zh.ts](../web/i18n/zh.ts) | `appName: 'API 使用 demo'` → `'dskchat'` |
| [web/i18n/en.ts](../web/i18n/en.ts) | `appName: 'API usage demo'` → `'dskchat'` |
| [web/index.html](../web/index.html) | `<title>API 使用 demo</title>` → `<title>dskchat</title>` |

`appName` 渲染在侧边栏顶部（[Sider.tsx](../web/components/sider/Sider.tsx)）；`index.html` 的 `<title>` 只影响 Web 构建的标签页，桌面窗口标题由 `tauri.conf.json` 决定。

### 2.4 CI 与文档

| 文件 | 改动 |
|---|---|
| [.github/workflows/tauri-desktop.yml.1](../.github/workflows/tauri-desktop.yml.1) | exe 路径 `dskchat.exe`；进程名 `dskchat`；`%TEMP%\dskchat.out/.err`；日志路径 `com.letmuts.dskchat\startup.log`；窗口标题断言 `'dskchat'`（文件当前带 `.1` 后缀，GitHub Actions 不会触发，见 [TAURI.md](./TAURI.md#ci)） |
| [docs/TAURI.md](./TAURI.md) | 数据目录/日志路径 3 处改为 `com.letmuts.dskchat`；冒烟断言标题改为 `dskchat` |
| [docs/ANDROID.md](./ANDROID.md) | keystore 示例 alias `chatdemo` → `dskchat`（只是示例名，不影响已生成的 keystore） |
| [web/services/chat/history/README.md](../web/services/chat/history/README.md) | 项目名叙述 “chat-demo 使用 …” → “dskchat 使用 …”（导出格式 `deepseek_data-*.zip` 不变） |
| [README.en.md](../README.en.md) / [README.md](../README.md) | 标题与首段品牌名改为 `dskchat` |

## 3. 刻意保留的旧名（不要“顺手改掉”）

以下三组仍含 `chat-demo` / `deepseek`，是**有意保留**的，改动它们会破坏数据或格式兼容：

| 保留项 | 位置 | 保留理由 |
|---|---|---|
| localStorage 键 `chat-demo:api-key`、`chat-demo:locale`、`chat-demo:location`、`chat-demo:theme-preference`、`chat-demo:tts-voice`、`chat-demo:thinking`、`chat-demo:search`、`chat-demo:sider-collapsed`、`chat-demo:native-modules` | [settings.ts](../web/services/settings.ts)、[secrets.ts](../web/platform/modules/secrets.ts)、[switches.ts](../web/platform/switches.ts)、[PLATFORM_MODULES.md](./PLATFORM_MODULES.md)、[secrets.rs](../src-tauri/src/modules/secrets.rs) | 1) 与上游模板保持一致，减少未来升级的合并差异；2) 迁移 WebView2 profile 时旧数据仍可读（见 §4.1） |
| IndexedDB 名 `chat-demo` | [db.ts](../web/services/chat/db.ts) | 同上；改名等于让本地会话“消失” |
| 历史导出文件名 `deepseek_data-<日期>.zip` | [backup.ts](../web/services/chat/backup.ts)、[format.ts](../web/services/chat/history/format.ts) | 属于上游导入导出格式约定，导入识别按内容而非文件名，改名无功能收益 |
| 上游仓库引用 `deepseek-ai/deepseek-chat-demo` | README、本文 | 说明“封装自谁”，不是本应用名 |

> 若将来确实要清掉这些内部字符串，必须同时提供一次性迁移（读旧键 → 写新键、复制 IndexedDB），并在本文登记为“不可回退”，否则升级/回退时会出现会话丢失。

## 4. 影响与迁移

### 4.1 Windows 本地数据目录

- 旧：`%LOCALAPPDATA%\com.deepseek.chatdemo`
- 新：`%LOCALAPPDATA%\com.letmuts.dskchat`

WebView2 的 localStorage / IndexedDB 都保存在这个目录里，**换 identifier 不会自动带走数据**。由于页面源（macOS/Linux 为 `tauri://localhost`，Windows 为 `http(s)://tauri.localhost`）与存储键都没有变，可以手动迁移：

1. 完全退出应用（含任务栏残留进程）。
2. 备份旧目录：把 `%LOCALAPPDATA%\com.deepseek.chatdemo` 复制一份留底。
3. 把旧目录内容复制到 `%LOCALAPPDATA%\com.letmuts.dskchat`（目标目录不存在时先创建）。
4. 启动应用，确认会话列表与 API Key 都在；确认后旧目录可删除。

注意事项：

- 程序安装在**非系统盘**时，[lib.rs](../src-tauri/src/lib.rs) 的 `prepare_webview_data_folder()` 会把数据目录改到 exe 同卷的 `.webview2-data/`，此时要迁移的是那个目录，而不是 `%LOCALAPPDATA%`。
- 迁移前先备份；WebView2 profile 跨版本复制不保证 100% 成功，失败就退回全新开始（不影响源码）。
- 旧目录不会自动删除，确认无用后手动清理。

### 4.2 安装与升级（Windows）

`productName` 与 `identifier` 都变了，安装器会把新版视为**另一个应用**：

- 新版不会覆盖旧版，可能出现 “Chat Demo / Deskchat” 与 “dskchat” 并存；
- 建议分发/自用前先手动卸载旧版本，再安装新版；
- 旧版卸载不会删除 `%LOCALAPPDATA%\com.deepseek.chatdemo`，需要按 §4.1 处理。

### 4.3 Android

`identifier` 决定 applicationId（现为 `com.letmuts.dskchat`）：

- 新 APK 不能覆盖安装旧包，需先卸载旧应用；
- 旧应用数据不会迁移，按全新安装处理；
- 签名密钥可以沿用；[ANDROID.md](./ANDROID.md) 里的 keystore alias 只是示例，实际以签名配置为准。

## 5. 与上游模板的关系（升级时看这里）

本仓库是上游静态 demo 的 Tauri 封装，目录对应关系是 `上游 src/` → 本仓库 `web/`，另有上游没有的 `web/platform/` 与 `src-tauri/`。

改名对“基于新模板升级”的影响很小，但升级时要守住三条：

1. **共享区只差 3 行品牌字符串**：`web/i18n/zh.ts`、`web/i18n/en.ts` 的 `appName`，以及 `web/index.html` 的 `<title>`。上游这三行不会变（仍是 `API 使用 demo`），合并时保留 `dskchat` 即可。
2. **存储键与 IndexedDB 名与上游完全一致**：因此升级合并时 `services/settings.ts`、`services/chat/db.ts` 不产生额外冲突；**不要**在升级时把它们改成 `dskchat`。
3. **其余改名点都在包装层**（`src-tauri/`、`package.json`、CI、docs、`web/platform/`），上游没有对应文件，合并成本为零。

推荐的升级流程：

1. 把新模板解压到带版本号的目录（如 `code/upstream/0.2.0/`），保留旧模板快照作为基线。
2. `git diff --no-index <旧模板>/src <新模板>/src`，得到上游改动。
3. 把改动移植/三路合并到 `web/`，冲突处优先保留封装侧语义（platform 接线、ExternalLink、`dskchat` 品牌）。
4. 对照 §2 检查品牌字符串没有被上游内容覆盖回 `Chat Demo` / `API 使用 demo`。
5. 跑 §6 的验证。

## 6. 验证清单

改完/升级后依次执行：

```sh
pnpm type                     # TypeScript
pnpm lint                     # oxlint
cargo metadata --locked --format-version 1 --manifest-path src-tauri/Cargo.toml
cargo check --locked --manifest-path src-tauri/Cargo.toml
```

再扫一遍旧名，**预期命中**只剩 §3 的保留项：

```sh
rg -n 'Chat Demo|chat-demo|chat_demo|chatdemo|Deskchat|com\.deepseek\.chatdemo' \
  -g '!node_modules' -g '!target' -g '!dist'
```

预期结果：

- `chat-demo` 只出现在存储键、IndexedDB 名、`PLATFORM_MODULES.md`、`secrets.rs` 注释、上游 URL 中；
- `Chat Demo`、`chatdemo`、`Deskchat`、`com.deepseek.chatdemo` 只应留在本文的历史记录与迁移说明里，其余位置 **应为 0 处**；
- 桌面冒烟：进程 `dskchat.exe`、窗口标题 `dskchat`、不产生新的 `startup.log`。

## 7. 再次改名时的步骤

如果将来还要换品牌，按这个顺序做，避免漏改：

1. 改 §1 表中的“由谁决定”列；
2. 改 [tauri.conf.json](../src-tauri/tauri.conf.json)：`productName`、`identifier`、窗口 `title`、两个 description；
3. 改 [Cargo.toml](../src-tauri/Cargo.toml) 的 `[package] name`、`[lib] name`，同步 [main.rs](../src-tauri/src/main.rs) 与 `Cargo.lock`（让 cargo 自动重写）；
4. 改 [lib.rs](../src-tauri/src/lib.rs)：stderr、错误框标题、`startup.log` 目录（**必须等于 identifier**）；
5. 改 `web/i18n/*` 的 `appName` 与 `web/index.html` 的 `<title>`；
6. 改 [package.json](../package.json) 的 `name`/`description`；
7. 改 CI（exe、进程名、日志路径、窗口标题断言；当前文件名为 `*.yml.1`，改名启用后才会生效）与 docs/README；
8. 处理数据迁移：identifier 变了就要按 §4.1 迁移 profile，或明确放弃旧数据；
9. 跑 §6 验证，并更新本文。

## 8. 变更记录

| 日期 | 版本 | 变更 |
|---|---|---|
| 2026-11-19 | 0.1.1 | Chat Demo / chat-demo / com.deepseek.chatdemo → dskchat / dskchat / com.letmuts.dskchat；存储键与导出格式保持不变 |
| 2026-11-20 | 0.1.2 | 复核命名与文档链接：CI 文件已带 `.1` 后缀、英文 README 为 `README.en.md`、`startup.log` 路径仍为硬编码 |
