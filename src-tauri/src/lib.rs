mod modules;

#[cfg(desktop)]
use tauri::Manager;

/// 桌面与手机共用入口：Android 由 `mobile_entry_point` 生成对应符号。
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // 可移植性兜底：exe 不在系统盘时，WebView2 默认数据目录（%LOCALAPPDATA%）会跨卷，
    // 本机实测会导致 WebView2 环境创建挂起（窗口一直不出现）。改为 exe 同卷目录。
    #[cfg(windows)]
    prepare_webview_data_folder();

    // release 下没有控制台，panic 也要留下日志/提示，不能静默退出
    #[cfg(not(debug_assertions))]
    {
        MAIN_THREAD_ID
            .set(std::thread::current().id())
            .ok();
        install_panic_hook();
    }

    #[allow(unused_mut)]
    let mut builder = tauri::Builder::default();

    // 单实例必须最先加载：第二次启动只唤起已有窗口，
    // 不新开进程抢同一个 WebView2 用户数据目录（%LOCALAPPDATA%/<identifier>）
    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }));
    }

    // system 槽位默认启用：外链必须交给系统浏览器，否则 WebView 会自己吞掉
    #[cfg(feature = "module-system")]
    {
        builder = builder.plugin(tauri_plugin_opener::init());
    }

    let result = builder
        .invoke_handler(tauri::generate_handler![
            modules::registry::platform_probe,
            modules::secrets::secrets_get,
            modules::secrets::secrets_set,
            modules::system::system_open_external,
        ])
        .run(tauri::generate_context!());

    if let Err(error) = result {
        record_failure(&format!("failed to run tauri application: {error}"), true);
        // 启动失败不能以 0 退出，否则 CI/脚本无法区分成功启动和失败退出
        std::process::exit(1);
    }
}

#[cfg(not(debug_assertions))]
static MAIN_THREAD_ID: std::sync::OnceLock<std::thread::ThreadId> = std::sync::OnceLock::new();

#[cfg(not(debug_assertions))]
fn install_panic_hook() {
    let default_hook = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let payload = info.payload();
        let message = payload
            .downcast_ref::<&str>()
            .map(|value| (*value).to_string())
            .or_else(|| payload.downcast_ref::<String>().cloned())
            .unwrap_or_else(|| "unknown panic payload".to_string());
        // 只为主线程弹框，后台线程的 panic 仅写日志
        let is_main_thread = MAIN_THREAD_ID.get() == Some(&std::thread::current().id());
        record_failure(&format!("panic: {message}\n{info}"), is_main_thread);
        default_hook(info);
    }));
}

/// 把启动失败写入 `%LOCALAPPDATA%/<identifier>/startup.log`，Windows 上再弹原生错误框。
fn record_failure(message: &str, show_dialog: bool) {
    let log_path = startup_log_path();
    if let Some(path) = &log_path {
        if let Ok(mut file) = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(path)
        {
            use std::io::Write as _;
            let _ = writeln!(file, "[{}] {message}", unix_timestamp());
        }
    }
    eprintln!("dskchat.exe failed to start: {message}");
    #[cfg(windows)]
    if show_dialog {
        show_native_error(message, log_path.as_deref());
    }
    #[cfg(not(windows))]
    let _ = show_dialog;
}

fn startup_log_path() -> Option<std::path::PathBuf> {
    let base = std::env::var_os("LOCALAPPDATA")
        .map(std::path::PathBuf::from)
        .or_else(|| {
            std::env::current_exe()
                .ok()
                .and_then(|exe| exe.parent().map(|parent| parent.to_path_buf()))
        })?;
    let dir = base.join("com.letmuts.dskchat");
    std::fs::create_dir_all(&dir).ok()?;
    Some(dir.join("startup.log"))
}

fn unix_timestamp() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or(0)
}

/// 当 exe 与 `%LOCALAPPDATA%` 不在同一个卷时，把 WebView2 用户数据目录改到 exe 同卷，
/// 避免跨卷创建 WebView2 环境时挂起。用户已显式设置环境变量时不覆盖。
#[cfg(windows)]
fn prepare_webview_data_folder() {
    if std::env::var_os("WEBVIEW2_USER_DATA_FOLDER").is_some() {
        return;
    }
    let Some(exe) = std::env::current_exe().ok() else {
        return;
    };
    let Some(exe_dir) = exe.parent() else {
        return;
    };
    let Some(local_app_data) = std::env::var_os("LOCALAPPDATA").map(std::path::PathBuf::from) else {
        return;
    };
    if volume_of(exe_dir) == volume_of(&local_app_data) {
        return;
    }
    let fallback = exe_dir.join(".webview2-data");
    if std::fs::create_dir_all(&fallback).is_ok() {
        std::env::set_var("WEBVIEW2_USER_DATA_FOLDER", &fallback);
    }
}

#[cfg(windows)]
fn volume_of(path: &std::path::Path) -> Option<String> {
    use std::path::Component;
    match path.components().next()? {
        Component::Prefix(prefix) => Some(prefix.as_os_str().to_string_lossy().to_uppercase()),
        _ => None,
    }
}

#[cfg(windows)]
fn show_native_error(message: &str, log_path: Option<&std::path::Path>) {
    use windows_sys::Win32::UI::WindowsAndMessaging::{MessageBoxW, MB_ICONERROR, MB_OK};

    let text = match log_path {
        Some(path) => format!("{message}\n\n详细信息已写入:\n{}", path.display()),
        None => message.to_string(),
    };
    let text: Vec<u16> = text.encode_utf16().chain(std::iter::once(0)).collect();
    let caption: Vec<u16> = "dskchat.exe 启动失败"
        .encode_utf16()
        .chain(std::iter::once(0))
        .collect();
    unsafe {
        MessageBoxW(
            std::ptr::null_mut(),
            text.as_ptr(),
            caption.as_ptr(),
            MB_OK | MB_ICONERROR,
        );
    }
}
