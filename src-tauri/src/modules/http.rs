//! 联网请求槽位（未实现）。
//!
//! 前端契约：`web/platform/modules/http.ts`。
//! 实现后应提供：
//! - `http_stream_message`：reqwest 发起 SSE，经 `tauri::ipc::Channel` 按块推送，
//!   避免每个 token 一次 IPC 往返；
//! - `http_upload_file` / `http_delete_file`：multipart 与文件删除；
//! - `http_transcribe` / `http_synthesize`：返回二进制（`tauri::ipc::Response`）。
