//! 本地持久化槽位（未实现）。
//!
//! 前端契约：`web/platform/types.ts` 的 `StorageModule`。
//! 计划用 SQLite（rusqlite 或 sqlx）替换 IndexedDB：
//! - `storage_*` 命令与 `services/chat/db.ts` 一一对应；
//! - 附件二进制放文件系统，库里只存路径与元数据；
//! - 首次启动时可从现有 IndexedDB 导入一次，保证老用户数据不丢。
