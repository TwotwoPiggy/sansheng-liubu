---
name: sansheng-worker
description: 三省六部异步工兵：后台非阻塞启动、查询状态日志或终止六部工兵任务
---

# `/sansheng-worker` — 全双工异步工兵调度

当用户输入 `/sansheng-worker <start|status|stop> ...` 时，**优先调用 MCP 工具 `sansheng_dispatch_worker`**（若当前会话未加载该 MCP 工具，则使用终端执行 `sansheng worker <start|status|stop> ... --json`）。

## 动作路由
1. **`status [jobId]`**：
   - 调用 `sansheng_dispatch_worker({ action: "status", jobId })`（只读查询，免高危审批）。
   - 列出活跃或已完成的后台 `Job` 列表，或展示指定 `jobId` 的状态与最近日志摘要。
2. **`start [taskId] [taskTitle] [testCmd]`**：
   - 调用 `sansheng_dispatch_worker({ action: "start", taskId, taskTitle, testCmd })`（`taskId` 和 `taskTitle` 均可省略：未传 `taskId` 时自动生成唯一编号，未传 `taskTitle` 时自动从 `testCmd` 推导或使用默认标题）。
   - 立即返回 `jobId` 与 `Started` 状态，不阻塞当前主对话。
3. **`stop <jobId>`**：
   - 调用 `sansheng_dispatch_worker({ action: "stop", jobId })` 终止后台进程树并汇报结果。
