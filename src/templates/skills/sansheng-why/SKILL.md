---
name: sansheng-why
description: 业务背景与特殊逻辑反查：按文件/行号/符号/BIZ-ID 秒查代码来历、决策取舍、@biz 锚点与调用链红线
---

# `/sansheng-why` — 代码业务背景与特殊逻辑反查

当用户询问“这段代码为什么这么写”“某块特殊逻辑的业务背景是什么”，或输入 `/sansheng-why <target> [--chain]` 时，**优先调用 MCP 工具 `sansheng_why`**（若当前会话未加载该 MCP 工具，则使用终端执行 `sansheng why <target> --json`）。

## 执行规范
1. 识别用户查询目标：
   - 精确行段：`path/to/file.cs:45` 或 `path/to/file.cs:40-60`
   - 整个文件：`path/to/file.cs`
   - 函数/类符号或关键词：`ValidateTaxNo`
   - 永久业务档案 ID：`BIZ-20261128-01`
2. 默认调用 `sansheng_why({ target, chainDepth: 0 })` 保持极低 Token 消耗；若用户追问上下游联动影响或本文件未直接命中，传 `chainDepth: 1`（最大 2）沿 `codebase_index.json` 穿透调用链。
3. 清晰提炼回答：**① 源码特殊逻辑锚点（`@biz`/`@why`）**、**② 生效业务背景与决策取舍（区分 `active` 与已替代的 `superseded` 口径）**、**③ 相关 Git 提交历史**。
4. 若需要完整展开某条关联档案或需求，引导使用下一跳 `sansheng_recall("<BIZ-ID|REQ-ID>")`。
