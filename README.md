# chat-demo

English | [简体中文](README.zh-CN.md)

A static chat demo powered by the DeepSeek API. No application backend is required: the browser connects directly to the configured API service.

You can [try the app online](https://deepseek-ai.github.io/chat-demo/) or download the archive from [Releases](https://github.com/deepseek-ai/deepseek-chat-demo/releases), extract it, and double-click `index.html` to use it locally without installation or a build. Enter your API key in Settings before your first chat.

## Getting started

Install Node.js 22.12+ and pnpm, then run:

```sh
git clone https://github.com/deepseek-ai/chat-demo.git
cd chat-demo
pnpm install
pnpm dev
```

Open http://localhost:8090.

To build the static site:

```sh
pnpm build
```

The output is written to `dist/`. Deploy it to a static web server or open `dist/index.html` directly. Opening the file directly requires browser support for storage on `file://` pages and an API service that permits their cross-origin requests.

## Desktop and Android

The same frontend ships to three targets; the native shell lives in `src-tauri/` (Tauri 2):

```sh
pnpm tauri:build          # Windows desktop installers (NSIS / MSI)
pnpm tauri:android:init   # first run: generate the Android project (needs JDK 17 + SDK + NDK)
pnpm tauri:android:build  # build an APK
```

Desktop builds use the system Evergreen WebView2 runtime (preinstalled on Windows 11; most Windows 10 devices have it via Edge/Windows Update, and the installer downloads it when missing). Startup failures are written to `%LOCALAPPDATA%\com.deepseek.chatdemo\startup.log` and shown in a native dialog. When the app is installed on a non-system drive, the WebView2 data folder is placed next to the executable.

Both targets consume `dist/`, so `pnpm build` still produces the smallest runnable static site.
To move a capability into Rust, enable the matching Cargo feature in `src-tauri`; the frontend
switches at startup and falls back automatically when a module is unavailable:

- [Platform module slots (TS ↔ Rust)](docs/PLATFORM_MODULES.md)
- [Tauri shell: build, CSP, release](docs/TAURI.md)
- [Android packaging](docs/ANDROID.md)

## Features

- Multiple conversations with automatic titles, renaming, and deletion; edit prompts, regenerate replies, and switch between message branches.
- Streaming replies, deep thinking, smart search, link reading, and source citations; stop generation or continue eligible replies.
- Upload, paste, or drag and drop attachments; use voice input and read replies aloud. A live audio spectrum appears in the first row of the input area while recording on mobile.
- Markdown, syntax highlighting, KaTeX math, and Mermaid diagrams.
- Simplified Chinese and English, light and dark themes, mobile layouts, location settings, and chat history import and export.

## Data and storage

Your API key and settings are stored in the browser's localStorage. Conversations and original attachments are stored in IndexedDB. Local data is isolated by browser profile and site origin. Sending messages, uploading attachments, and using speech features sends the relevant content to the configured API service.

History import and export in Settings use ZIP archives. After confirmation and successful validation, importing replaces all local conversations and attachments. Exports include conversations and locally available original images, but exclude API keys, settings, and original non-image attachments. See the [history import/export documentation (Chinese)](web/services/chat/history/README.md) for the archive format and preservation details.

Settings → Data → Delete all chats clears all local conversations, original attachments, and unsent drafts after confirmation. It stops ongoing replies and returns to a new chat. Your API key and settings are preserved; files already uploaded to the API service are not deleted.

## Development

| Command                    | Description                        |
| -------------------------- | ---------------------------------- |
| `pnpm dev`                 | Start the development server       |
| `pnpm build`               | Build the static site into `dist/` |
| `pnpm build:tauri`         | Build the frontend for the shell   |
| `pnpm tauri:dev`           | Desktop dev (rspack + window)      |
| `pnpm tauri:build`         | Desktop installers                 |
| `pnpm tauri:android:init`  | Generate the Android project       |
| `pnpm tauri:android:build` | Android APK                        |
| `pnpm type`                | Run TypeScript type checks         |
| `pnpm lint`                | Lint with oxlint                   |
| `pnpm format`              | Format with oxfmt                  |

[rspack.config.ts](rspack.config.ts) uses `https://api.deepseek.com` by default. Use `createConfig({ apiOrigin, target, nativeModules, devServer })` to customize the API origin, the build target, and the native module switches.

Chat uses `deepseek-flash` by default through Anthropic-compatible Messages / Files APIs. Speech features use ASR / TTS endpoints. Requests include extensions for search, link reading, titles, and `latest_reminder`, so the configured service must support the corresponding capabilities. Supported attachment formats are determined by server-side validation.

```text
web/                   Frontend (React + TypeScript)
  app/                 Layout, theme, viewport handling
  components/          Chat, settings, Markdown UI
  platform/            Native module slots: contracts, defaults, build-time switch
  i18n/                English and Chinese translations
  services/
    api/               API requests, SSE, and protocol types
    chat/              Conversations, message branches, storage, and history import/export
    markdown/          Markdown parsing, syntax highlighting, and diagrams
    speech/            Audio recording and read-aloud playback
  utils/               Shared utilities

src-tauri/             Native shell (desktop + Android)
  src/modules/         Rust module slots, one Cargo feature per module
  tauri.conf.json      Window, CSP, bundle targets
  capabilities/        IPC permissions
```

## License

[MIT](LICENSE). The build copies the license to `dist/LICENSE`; include it when distributing the app. Third-party dependencies are subject to their own licenses.
