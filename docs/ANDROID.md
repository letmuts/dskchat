# Android 打包

Android 是 Tauri 的一等目标，与桌面共用 `src-tauri/` 和同一份前端产物。

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

## 与应用相关的原生配置

`tauri.conf.json` 已声明 `bundle.android.minSdkVersion = 26`（Android 8.0）。

权限不需要手工维护：`pnpm tauri:android:init` 会执行 `scripts/patch-android.mjs`，在生成的
`gen/android/app/src/main/AndroidManifest.xml` 里幂等补上：

```xml
<uses-permission android:name="android.permission.RECORD_AUDIO" />
<uses-permission android:name="android.permission.INTERNET" />
```

- `RECORD_AUDIO`：语音输入用 `getUserMedia`，缺这条会直接拒绝。
- `INTERNET`：默认模板已包含，脚本会确认。

如果绕过 `tauri:android:init` 直接改 `gen/`，才需要手工补这两条；`gen/` 被 gitignore，重新生成会丢失手工修改。

安卓 9+ 默认禁止明文 HTTP，本项目只访问 HTTPS，不需要 `usesCleartextTraffic`。

## 签名与上架

```sh
keytool -genkey -v -keystore release.keystore -alias dskchat -keyalg RSA -keysize 2048 -validity 10000
```

在 `gen/android/app/build.gradle.kts` 里配置 `signingConfigs.release`，然后：

```sh
pnpm tauri:android:build            # APK（脚本已带 --apk）
pnpm tauri android build --aab      # 上架 Google Play
```

国内应用商店还需要：软件著作权、App 备案（接入备案）、以及各商店的开发者资质。这些是流程成本，与技术栈无关。

## 当前状态

- 本仓库已完成桌面端 release 构建并验证启动（窗口正常出现）；Android 未在本机验证。
- **Android 未在本机验证**：当前环境没有 JDK / Android SDK / NDK，因此 `gen/android` 需要在装好上述工具后生成。
  CI 里提供了可直接跑的 `.github/workflows/tauri-android.yml`。
