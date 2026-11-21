# Android 打包

Android 是 Tauri 的一等目标，与桌面共用 `src-tauri/` 和同一份前端产物。`tauri.conf.json` 已声明 `bundle.android.minSdkVersion = 26`（Android 8.0）。

## 一次性准备

1. 安装 **JDK 17**（Tauri 2 不支持 JDK 21 以上的部分 Gradle 组合，先用 17 最稳）。
2. 安装 **Android Studio**，在 SDK Manager 里勾选：
   - Android SDK Platform 34
   - Android SDK Build-Tools 34
   - NDK (Side by side) 26.x
   - Command-line Tools
3. 配置环境变量：

   ```powershell
   $env:JAVA_HOME = "C:\Program Files\Java\jdk-17"
   $env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
   $env:NDK_HOME = "$env:ANDROID_HOME\ndk\26.1.10909125"
   ```

4. 给 Rust 加安卓目标：

   ```sh
   rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android
   ```

## 生成并首次构建

```sh
pnpm tauri:android:init      # 生成 src-tauri/gen/android（已 gitignore，每台机器跑一次）
pnpm tauri:android:dev       # 需要已连接设备或启动模拟器
pnpm tauri:android:build     # 生成 APK
```

产物位置：`src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release.apk`
（`output-metadata.json` 里可以看到 `versionName` / `versionCode`，它们来自 `tauri.conf.json` 的 `version`。）

## ABI 与打包目标

`package.json` 里的脚本是 `tauri android build --apk --target aarch64`，**只编译 arm64-v8a**。注意：

- 如果 `gen/android` 里还留着之前 universal 构建的 `jniLibs`，打出来的 APK 可能仍包含旧 ABI；需要干净的单 ABI 包时，先删除 `src-tauri/gen/android/app/src/main/jniLibs` 再构建。
- 需要模拟器（x86_64）或多个 ABI 时，直接调用 CLI：

  ```sh
  pnpm tauri android build --apk --target x86_64
  pnpm tauri android build --apk            # 不指定 --target 时按 Tauri 默认目标集合
  ```

- 上架 Google Play 用 AAB：

  ```sh
  pnpm tauri android build --aab
  ```

## 与应用相关的原生配置

权限不需要手工维护：`pnpm tauri:android:init` 会执行 `scripts/patch-android.mjs`，在生成的
`gen/android/app/src/main/AndroidManifest.xml` 里幂等补上：

```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.RECORD_AUDIO" />
<uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />
```

- `RECORD_AUDIO`：语音输入用 `getUserMedia`，缺这条会直接拒绝。
- `MODIFY_AUDIO_SETTINGS`：wry 的 `onPermissionRequest` 会把它和 `RECORD_AUDIO` 放进同一次
  运行时申请，并要求两者都通过才向 WebView 授权。清单漏声明时系统对它直接返回 `DENIED`
  （不弹窗），于是用户明明授权了麦克风，`getUserMedia` 仍然抛 `NotAllowedError`——这就是
  “授权后仍提示无法使用麦克风”的原因。它只是普通权限，不需要额外弹窗。
- `INTERNET`：默认模板已包含，脚本会确认。

如果绕过 `tauri:android:init` 直接改 `gen/`，才需要手工补这几条；`gen/` 被 gitignore，重新生成会丢失手工修改。

安卓 9+ 默认禁止明文 HTTP，本项目只访问 HTTPS，不需要 `usesCleartextTraffic`。

## 内置 opener 插件

`tauri-plugin-opener` 不走 crates.io 版本，而是用 `src-tauri/vendor/tauri-plugin-opener` 的路径依赖。原因：上游 `build.rs` 在 Android 构建时会把 `tauri-api` 复制进 Cargo registry 的插件源码目录，缓存目录只读时直接失败：

```text
tauri-plugin: failed to copy tauri-api to the plugin project:
failed to create directory .../tauri-plugin-opener-2.5.4/android/.tauri/tauri-api/:
拒绝访问。 (os error 5)
```

改用 vendor 目录后不再写 registry 缓存。升级该插件时同步替换 vendor 内容即可。

## 导出历史对话（保存文件）

Android WebView 不支持 `a[download]` + `blob:`，导出必须由原生侧落盘：

1. 前端把 ZIP 转成 base64，调用 `system_save_file`（Android 的 IPC 走
   `window.ipc.postMessage(String)`，不能像桌面那样传二进制 body）；
2. Rust 侧在 `src-tauri/src/modules/system.rs` 里用 JNI 调
   `MediaStore.Downloads`，把文件写进系统「下载」目录（Android 10+，免权限），
   并返回文件名；Android 8/9 没有 `MediaStore.Downloads`，退到应用外部目录。
3. 成功后设置页用 toast 提示「已保存到系统「下载」目录：xxx.zip」。

桌面端不经过这个命令：WebView 自带下载，前端只用 `system_download_dir`
拿到下载目录路径，给出「已开始下载：<路径>」的提示。

## 签名与上架

```sh
keytool -genkey -v -keystore release.keystore -alias dskchat -keyalg RSA -keysize 2048 -validity 10000
```

- `my-release-key.keystore` 已被 `.gitignore` 忽略，**不要提交**；当前工作区里的那份只是本机自用，未入库。
- 在 `gen/android/app/build.gradle.kts` 里配置 `signingConfigs.release`，然后：

```sh
pnpm tauri:android:build            # APK（脚本已带 --apk --target aarch64）
pnpm tauri android build --aab      # 上架 Google Play
```

国内应用商店还需要：软件著作权、App 备案（接入备案）、以及各商店的开发者资质。这些是流程成本，与技术栈无关。

## 当前状态

- 桌面端已完成 release 构建并验证启动（窗口正常出现）。
- Android 端已在本机产出 release APK（`universal/release`，`versionName 0.1.2`），构建链路（JDK 17 + SDK 34 + NDK 26 + vendored opener）可用；尚未做完整的真机功能回归（录音、历史导出、深链等）。
- 现有 APK 的 `jniLibs` 里仍保留四个 ABI（历史构建遗留），所以包体较大；删除 `jniLibs` 或用干净的 `gen/android` 重建后，当前脚本只会打入 arm64-v8a。
- `gen/android` 不入库，换机器或 CI 上先跑 `pnpm tauri:android:init`。
- CI 里的 `.github/workflows/tauri-android.yml.1` 可执行，但文件名带 `.1`，GitHub Actions 不会自动触发；改名为 `.yml` 后生效。
