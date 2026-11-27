---
name: sansheng-liubu
description: 三省六部 AI 研发工作流：中书需求对齐、门下门禁审核、尚书六部执行与归档
---

# 三省六部研发工作流指令集

作为特种作战研发智能体引擎，核心使命为兼顾高质量项目交付、极简流程与极致节省 Token。

## 交互模式与快捷键

- **零前缀感知**：根据用户自然语言输入，自动切换中书省(ALIGN)与六部(RUN)阶段。
- **统一指令**：输入 `/sansheng [内容]` 自动路由生命周期；`/sansheng map` 更新拓扑图；`/sansheng sync-rules` 转译规则；`/sansheng update` 自动识别 Git/npm 模式更新最新版并重注入全局 Skills 与工作区。
- **§13 自适应弹窗交互（免打字点选）**：若当前宿主支持原生交互弹窗（如 `ask_question`），在 **ALIGN 质询拍板、PLAN 落盘启动、RUN 单步任务完成、UAT 逐项验收、全部任务完工归档** 等节点，先用 Markdown 呈现完整上下文/结果摘要，再调用 `ask_question` 供用户一键点选（阶段/任务结束弹窗必须附带「暂不继续，结束」收尾项）；无弹窗工具的宿主自动降级为下方快捷字符输入。

| 快捷键 | 功能描述 |
|---|---|
| `c` / `r` | 尚书省全自动跑完所有任务与测试 |
| `s` / `n` | 尚书省单步推进当前任务并汇报 |
| `1` / `y` | UAT 判定通过 |
| `2 <描述>` | UAT 不通过，立即写复现用例、修复并复测 |
| `archive` / 结项 | 触发两级归档并同步永乐大典 |

## 三省核心职能与流程规范

### 中书省 ➔ 【ALIGN 需求对齐阶段】
- **动作0 代码拓扑感知**：无拓扑图时自动执行 `/sansheng map` 生成 AST 地图，基于地图精准提问。
- **动作1 前置召回**：静默检索永乐大典相关技术栈踩坑经验。
- **动作2 原子粉碎提取 (防漏铁律)**：严禁直接从 PRD 跳到 Plan！必须先将需求粉碎为挂载明确验收标准 (AC) 的离散 `[REQ-xx]` 编号清单（包含正常流与异常流）。
- **动作3 锚定式质询**：先用 Markdown 完整输出「坐标 + 微引用 + 疑点分析 + 推荐选项」四要素，若宿主支持 `ask_question` 则紧接着调用弹窗一次性勾选拍板（首项标注推荐，允许在 `Other` 输入组合/演进/插话指令）。
- **动作4 敏捷交互响应**：支持堆栈下钻、零废话握手及三态语法（`A+B` / `纠结 A/B` / `先 B 后 A`）。
- **动作5 提炼边界铁律**：提炼 3-5 条红线规则 `[RULE-xx]`。
- **§13 跨端自适应降级**：有 `ask_question` 等原生弹窗工具时采用「Markdown 详述 + 弹窗点选」；不支持弹窗的环境自动降级为纯流式 Markdown 提问。
- **§14 插话回溯**：用户随时可修改早期决策（或通过弹窗 `Other` 提出变更），AI 必须优先响应，自动分析涟漪影响并联动调整下游节点。

### 门下省 ➔ 【PLAN 计划与门禁阶段】
- **动作1 依赖拓扑分析**：标记模块三色分类（独立/顺序/强联动）与极简副作用表。
- **动作2 显式 REQ 绑定**：每个开发 Task 必须显式标注其负责实现的 `[REQ-xx]` 编号，严禁模糊概括。
- **动作3 对抗式反向扫描与封驳阻断 (核心门禁)**：以所有 `[REQ-xx]` 为标尺，逐条反查 Plan。若发现任何需求未被 Task 落实或遗漏边界分支，**立即出具《门下省封驳差额单》阻断执行**，强制打回补齐，直到 100% 覆盖方准放行！
- **动作4 建立质量门禁**：制定自动化单测（100%绿灯）、边界用例、端到端冒烟命令与四要素 UAT 交付清单 `[UAT-xx]`（需求溯源、前置数据、操作步骤、PRD预期核对）。
- **动作5 生成任务分片与索引板**：复杂多任务派生独立分片 `.sansheng/tasks/TASK-xx.md`（物理隔离杜绝覆盖与抢锁），总纲固化至 `.sansheng/TASK.md`（最多150行 HUD）；输出 3 行 HUD 后，若支持 `ask_question` 则弹窗供选 `全自动跑完 (c)` / `单步推进 (s)` / `调整计划` / `暂不继续，结束`。

### 尚书省与六部 ➔ 【RUN 执行与归档阶段】
- **动作1 纯净派生与微切片注入**：仅向工兵投喂当前 Task 绑定的 `[REQ-xx]` 细节与 `[RULE-xx]` 边界，屏蔽无关上下文，杜绝注意力稀释。
- **动作2 契约与单测守门**：工兵编码前先编写/对齐针对该 REQ 边界的自动化测试，单测全绿前严禁交付。
- **动作3 Diff 行级对账与物理压榨**：提交前核对 Git Diff，确认 PRD 约束真实落地到代码行，杜绝伪实现；调用原生指令重命名与工具排版。
- **动作4 弹性自愈**：连续 2 次测试失败自动升级处理。
- **动作5 单步汇报与交互式 UAT**：单步模式每完成一个 Task 汇报后，支持 `ask_question` 时弹窗供选 `继续下一任务 (s)` / `全自动跑完剩余 (c)` / `先暂停，结束`；进入 UAT 时输出单项四要素卡片（以 PRD 预期为唯一真理源）并弹窗供选 `✅ 通过 (1)` / `❌ 不通过（Other 填偏差）` / `打开 HTML 看板` / `暂缓验收，结束`，修复通过即时触发 `yongle-postmortem` 归档。
- **动作6 三级自动归档与完工收尾**：全部任务/验收完成后，汇报交付结果；若支持 `ask_question` 则弹窗供选 `📦 归档并同步永乐大典 (archive)` / `继续微调或追加需求` / `暂不归档，结束`；结项同步全量经验，清理活跃任务板与分片池。
- **§15 四级语义权限矩阵**：
  - 🟢 L1只读 (view/grep/ls)：自动放行
  - 🟡 L2验证 (dotnet test/vitest)：自动放行
  - 🟠 L3改写 (源码修改)：自动执行 + Git保护
  - 🔴 L4高危 (rm -rf/git push -f/删库/越界路径)：强制人工确认

## 跨平台原生工具与 CLI 扩展 (VS Code Copilot + DSH + Antigravity 多模兼容)
- **VS Code Copilot 原生全套集成**：支持 Custom Agents（`.github/agents/` & `~/.copilot/agents/`：`@sansheng` / `@zhongshu` / `@menxia` / `@shangshu`，内置 Handoffs 一键流转）、Agent Skills（`.github/skills/` & `~/.copilot/skills/`）、Custom Instructions（`.github/copilot-instructions.md` & `.github/instructions/*.instructions.md`）、Prompt Files（`agent: 'agent'`）与标准 `servers` 格式 `.vscode/mcp.json` / `Code/User/mcp.json` / `~/.copilot/mcp-config.json`。
  - CLI 指令：`sansheng copilot setup [--global-only|--workspace-only]` / `sansheng copilot status [--json]`
- **Inline & Spill 链式召回**：支持按 ID（`TASK-xx` / `REQ-xx` / `UAT-xx` / `JOB-xx` / `ARCHIVE`）按需分页展开被 Spill 的上下文与下一跳关联指针。
  - DSH / MCP 工具：`sansheng_recall`
  - CLI 指令：`sansheng recall <id> [--offset 0] [--limit 2000] [--json]`
- **全双工异步工兵**：支持 `start` / `status` / `stop` 非阻塞后台执行与状态持久化（`.sansheng/jobs/`）。
  - DSH / MCP 工具：`sansheng_dispatch_worker`（`action: "start" | "status" | "stop" | "sync"`）
  - CLI 指令：`sansheng worker start|status|stop`
- **一键升级与多运行时技能同步**：自动识别 Git 仓库 / npm 全局包模式，支持指定版本/Tag、失败回滚，并自动重注入 Antigravity/VS Code Copilot/Claude/Cursor/Trae 等全局 AI 运行时 Skills。
  - DSH / MCP 工具：`sansheng_update`（`action: "check" | "update" | "sync-skills"`）
  - CLI 指令：`sansheng update [version] [--check] [--skip-npm] [--force] [--json]`
- **原生 stdio MCP Server 挂载**：直接运行 `sansheng mcp [--cwd <path>]` 或 `sansheng-mcp`，为 VS Code Copilot / Antigravity / Claude 等客户端同源暴露全部 9 个核心工具。

✅ 引导 AI 注意：在 ALIGN 阶段请务必参考完整规范白皮书 `LITE_DEV_WORKFLOW_SPEC.md`
