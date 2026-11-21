# 原生模块槽位（TS ↔ Rust）

这套项目同时支持两种打包方式，而且**同一份前端代码**可以按需把部分能力换成 Rust 实现：

```
web/                     前端（React + TS），默认实现全部在 JS
└─ platform/             ← 槽位层，所有可替换能力都从这里进出
   ├─ types.ts           契约：每个模块的接口
   ├─ modules/           默认（Web）实现 + 已就绪的原生实现
   ├─ native/            原生桥接（构建期按目标二选一）
   └─ index.ts           装配：探测外壳、按开关选择实现

src-tauri/               原生外壳（桌面 + Android 共用）
├─ src/modules/          ← Rust 侧的槽位，一个模块一个文件 + 一个 Cargo feature
└─ vendor/               tauri-plugin-opener 的本地副本（Android 构建需要，见 docs/ANDROID.md）
```

> 本文按 `0.1.2` 的代码核对（2026-11-20）；如果正文与实现不一致，以代码为准，并参考文末「已知差异与待办」。

## 三层开关

| 层 | 位置 | 作用 |
|---|---|---|
| 构建期目标 | `APP_TARGET=web\|tauri` | 决定 `@native/bridge` 解析到哪个实现。`web` 构建的产物**不包含** `@tauri-apps` 代码 |
| 构建期模块 | `NATIVE_MODULES=secrets,system` | 本次构建请求哪些原生模块（默认只有 `system`；web 构建默认空。显式设置时 web 构建也会读到，但桥接不可用，最终仍回落） |
| 编译期 feature | `src-tauri/Cargo.toml` 的 `module-*` | 决定运行时 `registry::enabled()` 的返回值。模块文件始终参与编译；feature 关闭时已注册的命令仍存在，但调用会返回 `disabled` 错误。`module-system` 同时控制可选依赖 `tauri-plugin-opener`（路径指向 `src-tauri/vendor/`） |

运行期还可以覆盖：`?native=secrets` 或 `localStorage['chat-demo:native-modules'] = 'secrets,http'`。
优先级：URL > localStorage > 构建期默认值。

> 这里的 `chat-demo:` 前缀是**有意保留**的，与应用显示名 `dskchat` 无关，约定见 [BRANDING.md](./BRANDING.md)。

## 生效规则

`initPlatform()` 在渲染前执行一次（唯一调用点在 [main.tsx](../web/main.tsx)）：

1. 探测外壳（`platform_probe`），拿到每个模块是否为 `true`；探测失败按“没有原生外壳”处理。
2. 装配：当前只有 `secrets` 与 `system` 在 [index.ts](../web/platform/index.ts) 的 `nativeModules` 里登记。对这两个模块，条件是「本次请求 && `nativeModules` 已登记 && `platform_probe` 报告可用」；其余模块没有原生条目，始终使用 Web 实现。
3. `secrets` 若选中原生实现，会额外执行一次 `hydrate()`；失败（例如 Rust 侧仍是 `unimplemented`）则回落到 localStorage。若原生返回空值而 localStorage 有历史值，会把历史值写回原生实现。

需要区分清楚的两点：

- **`registry.ts` 的 `implemented` 只用于状态展示**（`ModuleStatus`），**不参与选择**。因此“未实现模块不会生效”是靠 `hydrate` 失败回落保证的，而不是靠这个标志位；目前 `secrets` 就是这种状态（`implemented: false`，但仍登记在 `nativeModules` 中）。
- **回落只发生在启动阶段**。运行期若原生 `write` 失败，`nativeSecrets` 内部会吞掉错误、保留内存值，**不会**切回 localStorage，也不会提示用户。

任何启动步骤失败都不会让界面白屏：`main.tsx` 对 `initPlatform()` 的 Promise 也做了 `catch`。

## 模块现状

| id | 能力 | 前端已接线 | Rust 已实现 | 说明 |
|---|---|---|---|---|
| `secrets` | API Key 存取 | ✅ | ⬜ 命令占位（返回 `unimplemented`） | 未实现时启动阶段回落 localStorage |
| `system` | 打开外链 / 保存文件 | ✅ | ✅ `openExternal` 与 `saveFile` 均已就绪 | 外链走系统浏览器；保存文件：桌面沿用浏览器下载（另有 `system_download_dir` 用于提示目录），Android 由 `system_save_file` 写入系统「下载」目录 |
| `http` | 聊天流 / 文件 / 语音 | ⚠️ 5/6 方法 | ⬜ | `deleteFile` 契约已定义但暂无调用方；其余方法均已走 `platform.http` |
| `storage` | 会话与附件 | ✅ | ⬜ | 业务代码全部经 `platform.storage`；`db.ts` 除类型导入外只被 `storage.ts` 引用 |
| `archive` | 历史 ZIP | ⚠️ 仅导出 | ⬜ | 导出走 `platform.archive.writeZip`；导入仍在 [importArchive.ts](../web/services/chat/history/importArchive.ts) 里直连 `zipReader` |
| `search` | 全文检索 | ⬜ | ⬜ | 前端还没有入口，仅登记；`webSearch.query` 直接抛错 |

> 说明：`secrets`、`http`、`storage`、`archive` 的 Rust 文件目前只有注释或占位命令。
> `platform_probe` 按 Cargo feature 如实上报；未实现模块最终不会生效——`secrets` 虽在 `nativeModules` 中登记，但 `hydrate` 会因 `unimplemented` 失败并回落到 localStorage。

## 新增一个原生模块

以 `http` 为例，五步：

1. **Rust**：在 [http.rs](../src-tauri/src/modules/http.rs) 实现命令，返回 `Result<_, ModuleError>`；
2. **feature**：`Cargo.toml` 里已经有 `module-http = []`，实现完启用即可；
3. **注册**：在 [lib.rs](../src-tauri/src/lib.rs) 的 `tauri::generate_handler!` 里加入命令。**漏了这步前端会调不到**；
4. **前端口**：在 [http.ts](../web/platform/modules/http.ts) 增加 `nativeHttp: HttpModule`，调用 `bridge.call('http_stream_message', …)`；
5. **装配**：在 [index.ts](../web/platform/index.ts) 的 `nativeModules` 里登记，并把 [registry.ts](../web/platform/modules/registry.ts) 的 `implemented` 改为 `true`。

如果是**全新的模块 id**（不是补 `http` 这类已有槽位），还要额外做三件事：在 [mod.rs](../src-tauri/src/modules/mod.rs) 声明 `pub mod`、在 [registry.rs](../src-tauri/src/modules/registry.rs) 的 `enabled()` 加同名分支、在 `Cargo.toml` 加 `module-<id>` feature。

切换验证：

```sh
pnpm build:tauri
# 原生实现可用后：
NATIVE_MODULES=http pnpm build:tauri
# 或者不改构建，直接在地址栏加 ?native=http 对比两种实现
```

> 只有完成第 5 步后，`NATIVE_MODULES` / `?native=` 才会真正改变实现；否则即使请求了，也没有对应的 `nativeModules` 条目可用。

## 写原生实现的注意事项

- **IPC 是粗粒度的**。流式回复请用 `tauri::ipc::Channel` 按块推送，不要每个 token 一次 `invoke`。
- **错误要能被前端识别**。命令统一返回 `ModuleError { module, reason: disabled | unimplemented | failed, message }`（定义见 [mod.rs](../src-tauri/src/modules/mod.rs)）。`ApiError` 是更上层的业务错误；`nativeHttp` 需要区分「余额不足 / 限流」时，应在 TS 侧把 `ModuleError`（或额外返回的结构化数据）映射成 `ApiError`，**不要假设 Rust 侧已有 `{ kind, status, message }` 这种形状**。
- **二进制别用 JSON**。音频、ZIP 用 `tauri::ipc::Response` 直接回字节。
- **部分实现要逐方法回落**。`system` 就是例子：`openExternal` 两端都走原生，`saveFile` 在桌面用浏览器下载（WebView 自带），在 Android 换成原生命令 —— 因为 Android WebView 不支持 `a[download]` + `blob:`。

## 已知差异与待办

以下问题在当前代码里真实存在，文档先如实记录，后续要么改代码、要么改这里：

| 现象 | 现状 | 建议 |
|---|---|---|
| `secrets` 在 `nativeModules` 中登记，但 `registry.ts` 标 `implemented: false` | 装配会先选中原生，`hydrate` 失败后才回落；而 `platform.status()` 始终把它报成 `web` | 二选一：从 `nativeModules` 移除，或把 `implemented` 改 `true` 并接受“回落由调用失败驱动” |
| `archive` 的 `wired: true` 只覆盖导出 | 导入仍直连 `zipReader`，切 Rust 时需要同时改导入 | 给 `ArchiveModule` 补 `readZip` 契约，或把 `wired` 改成能表达“部分接线”的状态 |
| `platform.status()` 没有消费方 | `main.tsx` 忽略 `initPlatform()` 的返回值，设置页也没有模块状态入口 | 要做诊断 UI 时再接；否则视为预留 API |
| `http.deleteFile` 无调用方 | 契约与 Web 实现都有，业务代码未使用 | 保留待用，或从契约中删除 |
| 运行期原生 `write` 失败静默 | `nativeSecrets.write` 捕获错误后保留内存值，不回落 localStorage | 若将来启用 `secrets` 原生实现，应改成“失败即切回 `webSecrets`” |
