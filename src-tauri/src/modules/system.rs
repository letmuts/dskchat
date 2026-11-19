//! 系统集成槽位。
//!
//! 前端契约：`web/platform/modules/system.ts` 的 `nativeSystem`。
//! 桌面交给系统默认浏览器，移动端交给系统 intent —— 都由 tauri-plugin-opener 统一处理。

use super::{registry, ModuleError};

/// 用系统默认浏览器打开链接。
#[tauri::command]
pub async fn system_open_external(url: String) -> Result<(), ModuleError> {
    if !registry::enabled("system") {
        return Err(ModuleError::disabled("system"));
    }
    tauri_plugin_opener::open_url(&url, None::<&str>)
        .map_err(|error| ModuleError::failed("system", error.to_string()))
}
