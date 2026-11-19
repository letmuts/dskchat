//! API Key 存储槽位。
//!
//! 前端契约：`web/platform/modules/secrets.ts` 的 `nativeSecrets`。
//! 启用 `module-secrets` 后，用系统钥匙串（Windows Credential Manager /
//! macOS Keychain / Android Keystore）替换 localStorage 明文存储。

use super::{registry, ModuleError};

/// 读取 API Key；`key` 为存储项标识（当前固定 `chat-demo:api-key`）。
#[tauri::command]
pub async fn secrets_get(key: String) -> Result<Option<String>, ModuleError> {
    if !registry::enabled("secrets") {
        return Err(ModuleError::disabled("secrets"));
    }
    let _ = key;
    Err(ModuleError::unimplemented("secrets"))
}

/// 写入或删除（`value` 为 None）API Key。
#[tauri::command]
pub async fn secrets_set(key: String, value: Option<String>) -> Result<(), ModuleError> {
    if !registry::enabled("secrets") {
        return Err(ModuleError::disabled("secrets"));
    }
    let _ = (key, value);
    Err(ModuleError::unimplemented("secrets"))
}
