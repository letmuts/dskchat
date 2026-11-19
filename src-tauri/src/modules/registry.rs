//! 槽位注册表：模块 id、feature 开关、以及启动探测。

use std::collections::BTreeMap;

use serde::Serialize;

/// 与前端 `ModuleId` 一一对应，顺序即展示顺序。
pub const MODULE_IDS: [&str; 6] = ["secrets", "http", "storage", "archive", "system", "search"];

/// 编译期是否启用了某个模块的 Rust 实现。
///
/// 新增模块时：在这里加一个分支，并在 Cargo.toml 声明同名 feature。
pub fn enabled(id: &str) -> bool {
    match id {
        "secrets" => cfg!(feature = "module-secrets"),
        "http" => cfg!(feature = "module-http"),
        "storage" => cfg!(feature = "module-storage"),
        "archive" => cfg!(feature = "module-archive"),
        "system" => cfg!(feature = "module-system"),
        "search" => cfg!(feature = "module-search"),
        _ => false,
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShellPlatform {
    pub os: &'static str,
    pub arch: &'static str,
    pub mobile: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShellProbe {
    /// 外壳标识，前端用来区分浏览器与 Tauri
    pub shell: &'static str,
    pub version: &'static str,
    /// 每个模块是否有可用的原生实现
    pub modules: BTreeMap<&'static str, bool>,
    pub platform: ShellPlatform,
}

/// 前端 `initPlatform()` 调用：报告外壳身份与各模块可用性。
#[tauri::command]
pub fn platform_probe() -> ShellProbe {
    ShellProbe {
        shell: "tauri",
        version: env!("CARGO_PKG_VERSION"),
        modules: MODULE_IDS.iter().map(|id| (*id, enabled(id))).collect(),
        platform: ShellPlatform {
            os: std::env::consts::OS,
            arch: std::env::consts::ARCH,
            mobile: cfg!(any(target_os = "android", target_os = "ios")),
        },
    }
}
