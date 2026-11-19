//! 系统集成槽位。
//!
//! 前端契约：`web/platform/modules/system.ts` 的 `nativeSystem`。
//! 外链交给系统默认浏览器 / 系统 intent（tauri-plugin-opener）；导出文件的落盘由
//! `system_save_file` 负责 —— Android WebView 不支持 `a[download]` + `blob:`，
//! 只能由原生侧写进系统「下载」目录。

use super::{registry, ModuleError};
use serde::Serialize;

/// 用系统默认浏览器打开链接。
#[tauri::command]
pub async fn system_open_external(url: String) -> Result<(), ModuleError> {
    if !registry::enabled("system") {
        return Err(ModuleError::disabled("system"));
    }
    tauri_plugin_opener::open_url(&url, None::<&str>)
        .map_err(|error| ModuleError::failed("system", error.to_string()))
}

/// 桌面端「浏览器下载」的默认落点，仅用于导出成功后的提示；取不到时返回 None。
#[tauri::command]
pub fn system_download_dir(app: tauri::AppHandle) -> Option<String> {
    use tauri::Manager;
    if !registry::enabled("system") {
        return None;
    }
    app.path()
        .download_dir()
        .ok()
        .map(|path| path.display().to_string())
}

/// 导出文件的落盘结果。
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedFile {
    /// `downloads`：写进系统「下载」目录；`file`：写到应用专属目录（Android 9 及以下）
    pub kind: &'static str,
    /// `downloads` 时是文件名，`file` 时是完整路径
    pub path: String,
}

/// 只接受普通的文件名，避免 `../` 之类的路径穿越落到下载目录之外。
fn is_safe_file_name(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= 128
        && !name.starts_with('.')
        && name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'))
}

/// 保存导出文件。
///
/// 归档以 base64 传入：Android 的 IPC 走 `window.ipc.postMessage(String)`，
/// 不支持桌面端那种二进制 body（见 tauri 的 `scripts/ipc-protocol.js`）。
/// 桌面端仍用 WebView 自带下载，因此这里只实现 Android 分支。
#[tauri::command]
pub async fn system_save_file(
    app: tauri::AppHandle,
    name: String,
    data: String,
) -> Result<SavedFile, ModuleError> {
    if !registry::enabled("system") {
        return Err(ModuleError::disabled("system"));
    }
    if !is_safe_file_name(&name) {
        return Err(ModuleError::failed(
            "system",
            "invalid file name for export".into(),
        ));
    }

    #[cfg(target_os = "android")]
    {
        use base64::Engine as _;
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(data)
            .map_err(|_| ModuleError::failed("system", "invalid archive payload".into()))?;
        // 写盘与 JNI 调用都可能阻塞，放到阻塞线程池，避免占住 async 运行时
        tauri::async_runtime::spawn_blocking(move || save_to_downloads(&app, &name, &bytes))
            .await
            .map_err(|error| ModuleError::failed("system", format!("save task failed: {error}")))?
    }

    #[cfg(not(target_os = "android"))]
    {
        let _ = (&app, &name, &data);
        Err(ModuleError::unimplemented("system"))
    }
}

/// 在 Android 上把字节写进用户可见的位置。
///
/// 主线程只用来拿 JNIEnv/Activity，真正的写入在 `write_archive` 里完成；
/// 结果通过 channel 回传，调用方在阻塞线程上等待。
#[cfg(target_os = "android")]
fn save_to_downloads(
    app: &tauri::AppHandle,
    name: &str,
    bytes: &[u8],
) -> Result<SavedFile, ModuleError> {
    use std::sync::mpsc;
    use tauri::Manager;

    let window = app.get_webview_window("main").ok_or_else(|| {
        ModuleError::failed("system", "main webview is not available".into())
    })?;

    let (sender, receiver) = mpsc::channel();
    let file_name = name.to_string();
    let payload = bytes.to_vec();
    window
        .with_webview(move |webview| {
            webview.jni_handle().exec(move |env, activity, _webview| {
                let _ = sender.send(write_archive(env, activity, &file_name, &payload));
            });
        })
        .map_err(|error| {
            ModuleError::failed("system", format!("webview dispatch failed: {error}"))
        })?;

    receiver
        .recv()
        .map_err(|_| ModuleError::failed("system", "webview did not run the save task".into()))?
        .map_err(|message| ModuleError::failed("system", message))
}

/// Android 10+ 用 MediaStore 写「下载」目录（免权限）；更早的系统没有
/// `MediaStore.Downloads`，退到应用外部目录（文件管理器仍可见）。
#[cfg(target_os = "android")]
fn write_archive(
    env: &mut jni::JNIEnv<'_>,
    activity: &jni::objects::JObject<'_>,
    name: &str,
    bytes: &[u8],
) -> Result<SavedFile, String> {
    use jni::objects::{JObject, JValue};

    let resolver = env
        .call_method(
            activity,
            "getContentResolver",
            "()Landroid/content/ContentResolver;",
            &[],
        )
        .and_then(|value| value.l())
        .map_err(|error| format!("content resolver: {error}"))?;

    if let Ok(downloads) = env.find_class("android/provider/MediaStore$Downloads") {
        let collection = env
            .get_static_field(&downloads, "EXTERNAL_CONTENT_URI", "Landroid/net/Uri;")
            .and_then(|value| value.l())
            .map_err(|error| format!("downloads collection: {error}"))?;

        let values = env
            .new_object("android/content/ContentValues", "()V", &[])
            .map_err(|error| format!("content values: {error}"))?;
        put_string(env, &values, "_display_name", name)?;
        put_string(env, &values, "relative_path", "Download")?;
        put_string(env, &values, "mime_type", "application/zip")?;

        let uri = env
            .call_method(
                &resolver,
                "insert",
                "(Landroid/net/Uri;Landroid/content/ContentValues;)Landroid/net/Uri;",
                &[JValue::Object(&collection), JValue::Object(&values)],
            )
            .and_then(|value| value.l())
            .map_err(|error| format!("insert download entry: {error}"))?;
        if uri.is_null() {
            return Err("the system refused a new entry in Downloads".to_string());
        }

        let stream = env
            .call_method(
                &resolver,
                "openOutputStream",
                "(Landroid/net/Uri;)Ljava/io/OutputStream;",
                &[JValue::Object(&uri)],
            )
            .and_then(|value| value.l());
        let stream = match stream {
            Ok(stream) if !stream.is_null() => stream,
            _ => {
                // 拿不到输出流时把刚插入的空条目删掉，避免「下载」里多一个 0 字节文件
                let _ = env.call_method(
                    &resolver,
                    "delete",
                    "(Landroid/net/Uri;Ljava/lang/String;[Ljava/lang/String;)I",
                    &[
                        JValue::Object(&uri),
                        JValue::Object(&JObject::null()),
                        JValue::Object(&JObject::null()),
                    ],
                );
                return Err("could not open the saved file".to_string());
            }
        };

        let buffer = env
            .byte_array_from_slice(bytes)
            .map_err(|error| format!("archive buffer: {error}"))?;
        let written = env.call_method(&stream, "write", "([B)V", &[JValue::Object(&buffer)]);
        // 无论写入成功与否都要关流，否则 MediaStore 里会留下 0 字节条目
        let _ = env.call_method(&stream, "flush", "()V", &[]);
        let _ = env.call_method(&stream, "close", "()V", &[]);
        written.map_err(|error| format!("write archive: {error}"))?;

        return Ok(SavedFile {
            kind: "downloads",
            path: name.to_string(),
        });
    }

    let directory = env
        .call_method(
            activity,
            "getExternalFilesDir",
            "(Ljava/lang/String;)Ljava/io/File;",
            &[JValue::Object(&JObject::null())],
        )
        .and_then(|value| value.l())
        .map_err(|error| format!("external files dir: {error}"))?;
    if directory.is_null() {
        return Err("no writable app directory".to_string());
    }
    let _ = env.call_method(&directory, "mkdirs", "()Z", &[]);

    let raw = env
        .call_method(&directory, "getAbsolutePath", "()Ljava/lang/String;", &[])
        .and_then(|value| value.l())
        .map_err(|error| format!("external files path: {error}"))?;
    let base: String = env
        .get_string(&raw.into())
        .map_err(|error| format!("external files path: {error}"))?
        .to_string_lossy()
        .into_owned();

    let target = std::path::Path::new(&base).join(name);
    std::fs::write(&target, bytes).map_err(|error| format!("write archive: {error}"))?;
    Ok(SavedFile {
        kind: "file",
        path: target.display().to_string(),
    })
}

#[cfg(target_os = "android")]
fn put_string(
    env: &mut jni::JNIEnv<'_>,
    values: &jni::objects::JObject<'_>,
    key: &str,
    value: &str,
) -> Result<(), String> {
    use jni::objects::JValue;
    let key = env
        .new_string(key)
        .map_err(|error| format!("content key: {error}"))?;
    let value = env
        .new_string(value)
        .map_err(|error| format!("content value: {error}"))?;
    env.call_method(
        values,
        "put",
        "(Ljava/lang/String;Ljava/lang/String;)V",
        &[JValue::Object(&key), JValue::Object(&value)],
    )
    .map(|_| ())
    .map_err(|error| format!("content values put: {error}"))
}
