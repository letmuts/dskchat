//! 原生模块槽位。
//!
//! 每个子模块对应前端 `web/platform/types.ts` 的一个 `ModuleId`，
//! 并由 Cargo.toml 里同名的 `module-<id>` feature 控制是否可用。
//!
//! 约定：
//! - 命令一律返回 `Result<_, ModuleError>`，前端据此回落到 Web 实现；
//! - 命令参数用 camelCase 传入，Rust 侧自动转 snake_case；
//! - 新增模块的步骤见 `docs/PLATFORM_MODULES.md`。

pub mod archive;
pub mod http;
pub mod registry;
pub mod search;
pub mod secrets;
pub mod storage;
pub mod system;

use serde::Serialize;

/// 原生模块不可用时的统一错误。
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModuleError {
    pub module: &'static str,
    pub reason: Reason,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Reason {
    /// 编译期没有启用对应 feature。
    Disabled,
    /// feature 已启用，但实现还没写。
    Unimplemented,
    /// 实现存在但调用失败（例如系统没有可用的浏览器）。
    Failed,
}

impl ModuleError {
    pub const fn disabled(module: &'static str) -> Self {
        Self {
            module,
            reason: Reason::Disabled,
            message: None,
        }
    }

    pub const fn unimplemented(module: &'static str) -> Self {
        Self {
            module,
            reason: Reason::Unimplemented,
            message: None,
        }
    }

    pub fn failed(module: &'static str, message: String) -> Self {
        Self {
            module,
            reason: Reason::Failed,
            message: Some(message),
        }
    }
}
