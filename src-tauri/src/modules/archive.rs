//! 历史归档槽位（未实现）。
//!
//! 前端契约：`web/platform/modules/archive.ts` 的 `writeZip`。
//! 计划用 `zip` + `zstd` 替换 fflate；导出格式（manifest / sessions / index / images）
//! 必须与 `services/chat/history/README.md` 保持一致，保证双向兼容。
