# dskchat

dskchat is a third-party wrapper around `deepseek-ai/deepseek-chat-demo` built on the Rust Tauri framework. No backend configuration is required; the binary runs as-is.

[简体中文](README.md) | English

A Rust + Tauri Windows / Android wrapper around the DeepSeek API static chat demo ([deepseek-ai/deepseek-chat-demo](https://github.com/deepseek-ai/deepseek-chat-demo)). No build or configuration changes are required: download, install, and enter your API key in Settings.

## Download and install

Release builds are available as Windows installers (NSIS / MSI) and an Android APK:

- **Windows**: download the NSIS / MSI installer and run it. Windows 10/11 is required. WebView2 is preinstalled on Windows 11; most Windows 10 devices already have it via Edge / Windows Update, and the installer downloads it when missing.
- **Android**: download and install the APK. Android 8.0 (API 26) or later is required; allow installation from unknown sources on first install.
- **First use**: open Settings and enter your DeepSeek API key. The key is stored only in the local WebView localStorage (plain text; the OS keychain slot is not implemented yet) and is sent to the configured API service along with chat requests. See [Data](#data).

> The Windows installer is not code-signed, so SmartScreen may warn; on Android, allow installation from unknown sources.

## Project structure

#### Directory layout

```text
package.json / pnpm-lock.yaml   Frontend dependencies and scripts
rust-toolchain.toml             Pinned Rust toolchain
web/                            Frontend (React + TypeScript)
  app/                          Layout, theme, and viewport handling
  components/                   Chat, settings, and Markdown UI
  platform/                     Native module slots: contracts, defaults, build-time switch
  i18n/                         English and Chinese translations
  services/
    api/                        API requests, SSE, and protocol types
    chat/                       Conversations, message branches, local storage, history import/export
    markdown/                   Markdown parsing, syntax highlighting, and diagrams
    speech/                     Audio recording and read-aloud playback
  utils/                        Shared utilities

src-tauri/                      Native shell (desktop + Android)
  Cargo.toml / Cargo.lock       Rust dependencies and module features
  src/modules/                  Rust module slots, one Cargo feature per module
  tauri.conf.json               Window, CSP, bundle targets
  capabilities/                 IPC permissions
  icons/                        App icons per platform

docs/                           Tauri, platform-module, and Android documentation
scripts/                        Android permission patch and CI helpers
.github/workflows/              Desktop, Android, and GitHub Pages CI
```

#### Tech stack details

- **Frontend**: React 18 + TypeScript, bundled by rspack; state via zustand; Markdown through micromark / mdast, syntax highlighting with Prism, math with KaTeX, diagrams with Mermaid; IndexedDB (idb) for local storage and fflate for ZIP history import/export.
- **Desktop / Android**: Tauri 2 (Rust). Desktop uses the system WebView2 with no bundled runtime; the shell is single-instance, writes `startup.log` and shows a native error dialog on startup failure, and moves the WebView2 data folder to a directory on the same volume when the program is installed on a non-system drive.
- **Native modules**: only `system` (opening external links) is implemented. `secrets`, `http`, `storage`, `archive`, and `search` are contracts / placeholders; wired modules fall back to the Web implementation automatically, and unwired ones stay on the Web side. See [Platform module slots](docs/PLATFORM_MODULES.md) for the table.
- **Versions**: Rust 1.99.1 (pinned by `rust-toolchain.toml`), `tauri` 2.11.5, `@tauri-apps/api` 2.11.1, and `@tauri-apps/cli` 2.11.3; `Cargo.lock` and `pnpm-lock.yaml` pin the dependency graph.

#### Features

- Multiple conversations with automatic titles, renaming, and deletion; edit prompts, regenerate replies, and switch between message branches.
- Streaming replies, deep thinking, smart search, link reading, and source citations; stop generation or continue eligible replies.
- Upload, paste, or drag and drop attachments; voice input and read-aloud replies. A live audio spectrum appears in the first row of the input area while recording on mobile.
- Markdown, syntax highlighting, KaTeX math, and Mermaid diagrams.
- Simplified Chinese and English, light and dark themes, mobile layouts, location settings, and chat history import and export.

#### Data

The API key and settings are stored in the WebView's localStorage (the browser profile on the Web build, the WebView2 profile on desktop). The native OS keychain slot is not implemented yet, so the key is stored as plain text. Conversations and original attachments are stored in IndexedDB, isolated by browser profile and site origin. Sending messages, uploading attachments, and using speech features sends the relevant content to the configured API service.

History import and export in Settings use ZIP archives. After confirmation and successful validation, importing replaces all local conversations and attachments. Exports include conversations and locally available original images, but exclude the API key, settings, and original non-image attachments. See the [history import/export documentation (Chinese)](web/services/chat/history/README.md) for the archive format and preservation details.

Settings → Data → Delete all chats clears all local conversations, original attachments, and unsent drafts after confirmation. It stops ongoing replies and returns to a new chat. The API key and other settings are preserved; files already uploaded to the API service are not deleted.

## Build from source

| Target | Requirements |
|---|---|
| Common | Node.js 22.12+, pnpm 10 |
| Windows | Rust 1.99.1 (pinned by `rust-toolchain.toml`), MSVC C++ toolchain, WebView2 |
| Linux | Rust, `libwebkit2gtk-4.1-dev`, `librsvg2-dev`, `libdbus-1-dev`, `patchelf` |
| Android | JDK 17, Android SDK 34, NDK 26, and the four Rust Android targets |

#### Windows

```sh
pnpm install
pnpm tauri:build
```

Artifacts are written to `src-tauri/target/release/bundle/`: `nsis/*.exe` and `msi/*.msi`. The first build downloads NSIS / WiX over the network; use `pnpm tauri:dev` for desktop development.

#### Linux

```sh
sudo apt-get update
sudo apt-get install -y libwebkit2gtk-4.1-dev librsvg2-dev libdbus-1-dev patchelf
pnpm install
pnpm exec tauri build --bundles deb,rpm
```

Artifacts are written to `src-tauri/target/release/bundle/deb/` and `rpm/`. Without `--bundles`, the build also attempts an AppImage, which needs extra tooling; specifying the bundles explicitly is recommended.

#### Android

```sh
rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android
pnpm tauri:android:init
pnpm tauri:android:build
```

`tauri:android:init` runs `scripts/patch-android.mjs` to add `RECORD_AUDIO` / `INTERNET` automatically; the APK is written to `src-tauri/gen/android/app/build/outputs/apk/universal/release/`. For Google Play, build an AAB with `pnpm tauri android build --aab`; see [Android packaging](docs/ANDROID.md) for signing.

## Development

| Command                    | Description                         |
| -------------------------- | ----------------------------------- |
| `pnpm install`             | Install dependencies                |
| `pnpm dev`                 | Start the Web dev server (8090)     |
| `pnpm build`               | Build the static site into `dist/`  |
| `pnpm build:tauri`         | Build the frontend for the shell    |
| `pnpm tauri:dev`           | Desktop dev (rspack + window)       |
| `pnpm tauri:build`         | Desktop installers                  |
| `pnpm tauri:android:init`  | Generate the Android project        |
| `pnpm tauri:android:build` | Android APK                         |
| `pnpm type`                | Run TypeScript type checks          |
| `pnpm lint`                | Lint with oxlint                    |
| `pnpm format`              | Format with oxfmt                   |

[rspack.config.ts](rspack.config.ts) uses `https://api.deepseek.com` by default. Use `createConfig({ apiOrigin, target, nativeModules, devServer })` to customize the API origin, the build target, and the native module switches.

Chat uses `deepseek-flash` by default through Anthropic-compatible Messages / Files APIs; speech features use ASR / TTS endpoints. Requests include extensions for search, link reading, titles, and `latest_reminder`, so the configured service must support the corresponding capabilities. Supported attachment formats are determined by server-side validation.

## CI

- `.github/workflows/tauri-desktop.yml`: Windows NSIS/MSI with a startup smoke test, macOS universal DMG, and Linux deb/rpm.
- `.github/workflows/tauri-android.yml`: Android APK.
- `.github/workflows/pages.yml`: static site deployed to GitHub Pages.

## License

[MIT](LICENSE). The build copies the license to `dist/LICENSE`; include it when distributing the app. Third-party dependencies are subject to their own licenses.
