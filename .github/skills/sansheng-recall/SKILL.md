---
name: sansheng-recall
description: 三省六部链式召回：按 ID (BIZ/TASK/REQ/UAT/JOB/ARCHIVE) 分页召回上下文与关联指针
---

# `/sansheng-recall` — 链式上下文召回

当用户输入 `/sansheng-recall <ID> [offset]` 时，**优先调用 MCP 工具 `sansheng_recall`**（若当前会话未加载该 MCP 工具，则使用终端执行 `sansheng recall <ID> --json`）。

## 执行规范
1. 解析用户传入的目标对象 ID（支持 `BIZ-YYYYMMDD-xx`、`TASK-xx`、`REQ-xx`、`UAT-xx`、`JOB-xx`、`ARCHIVE` 或 `ARCHIVE/<path>`）及可选分页参数 `offset` / `limit`（默认 `offset: 0, limit: 2000`）。
2. 调用 `sansheng_recall({ id, offset, limit })`。
3. 精简输出召回的正文内容；若 `truncated === true`，提示用户可用 `offset: <nextOffset>` 继续读取；并在末尾列出 `related` 中的下一跳关联指针（含纵向业务演化链 `supersedes`/`supersededBy`），方便继续追踪。
