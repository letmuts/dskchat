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
└─ src/modules/          ← Rust 侧的槽位，一个模块一个文件 + 一个 Cargo feature
```

## 三层开关

| 层 | 位置 | 作用 |
|---|---|---|
| 构建期目标 | `APP_TARGET=web\|tauri` | 决定 `@native/bridge` 解析到哪个实现。`web` 构建**完全不包含** `@tauri-apps` 代码 |
| 构建期模块 | `NATIVE_MODULES=secrets,system` | 本次构建请求哪些原生模块（默认只有 `system`；web 构建为空） |
| 编译期 feature | `src-tauri/Cargo.toml` 的 `module-*` | 决定 Rust 侧到底有没有这个能力 |

运行期还可以覆盖：`?native=secrets` 或 `localStorage['chat-demo:native-modules'] = 'secrets,http'`。
优先级：URL > localStorage > 构建期默认值。

## 生效规则

`initPlatform()` 在渲染前执行一次：

1. 探测外壳（`platform_probe`），拿到每个模块是否是 `true`；
2. 对每个模块：`请求中 && 有原生实现 && 外壳报告可用` 三者同时满足才切到原生，否则用 Web；
3. 原生 Key 存储会额外做一次 `hydrate()`，失败则回落到 localStorage。

任何一步失败都只会**回落**，不会让界面白屏。

## 模块现状

| id | 能力 | 前端已接线 | Rust 已实现 | 说明 |
|---|---|---|---|---|
| `secrets` | API Key 存取 | ✅ | ⬜ 命令占位（返回 `unimplemented`） | 未实现时自动回落 localStorage |
| `system` | 打开外链 | ✅ | ✅ `openExternal` 已就绪 | 保存文件仍走浏览器下载 |
| `http` | 聊天流 / 文件 / 语音 | ✅ | ⬜ | 建议 `reqwest` + `ipc::Channel` 按块推送 |
| `storage` | 会话与附件 | ✅ | ⬜ | 建议 SQLite |
| `archive` | 历史 ZIP | ✅ | ⬜ | 建议 `zip` + `zstd` |
| `search` | 全文检索 | ⬜ | ⬜ | 前端还没有入口，仅登记 |

> 说明：`secrets`、`http`、`storage`、`archive` 的 Rust 文件目前只有注释/占位命令；
> `platform_probe` 按 Cargo feature 如实上报，前端不会把未实现的模块误切到原生。

## 新增一个原生模块

以 `http` 为例，四步：

1. **Rust**：在 `src-tauri/src/modules/http.rs` 实现命令，返回 `Result<_, ModuleError>`；
2. **feature**：`Cargo.toml` 里已经有 `module-http = []`，实现完直接启用即可；
3. **前端口**：在 `web/platform/modules/http.ts` 增加 `nativeHttp: HttpModule`，调用
   `bridge.call('http_stream_message', …)`；
4. **装配**：在 `web/platform/index.ts` 的 `nativeModules` 里登记，并把
   `modules/registry.ts` 的 `implemented` 改为 `true`。

切换验证：

```sh
pnpm build:tauri
# 原生实现可用后：
NATIVE_MODULES=http pnpm build:tauri
# 或者不改构建，直接在地址栏加 ?native=http 对比两种实现
```

## 写原生实现的注意事项

- **IPC 是粗粒度的**。流式回复请用 `tauri::ipc::Channel` 按块推送，不要每个 token 一次 `invoke`。
- **错误要能被前端识别**。`ApiError` 是前端类型，跨边界后只剩错误码；需要 UI 区分「余额不足 / 限流」时，
  在 Rust 侧返回结构化的 `{ kind, status, message }`，由 `nativeHttp` 重新抛出 `ApiError`。
- **二进制别用 JSON**。音频、ZIP 用 `tauri::ipc::Response` 直接回字节。
- **部分实现要逐方法回落**。`system` 就是例子：`openExternal` 走原生，`saveFile` 仍用 Web 实现。
