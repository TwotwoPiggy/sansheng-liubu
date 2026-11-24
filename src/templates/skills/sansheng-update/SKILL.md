---
name: sansheng-update
description: 三省六部自动更新与技能同步：自动识别 Git/npm 模式检查并升级版本，重注入全局 AI 运行时 Skills 与工作区规则
---

# `/sansheng-update` — 三省六部一键更新与技能同步

当用户要求检查版本、升级 `sansheng-liubu`、同步最新三省六部 Skills，或输入 `/sansheng update` / `/sansheng-update` 时，按以下流程执行：

## 1. 调用优先级
1. **优先调用 MCP 工具 `sansheng_update`**（若当前会话已挂载 `sansheng-liubu` MCP Server）：
   - 仅检查版本：`sansheng_update({ action: "check" })`
   - 检查并升级至最新版：`sansheng_update({ action: "update" })`
   - 升级到指定版本/Tag/分支：`sansheng_update({ action: "update", targetVersion: "<version>" })`
   - 仅重注入全局 Skills 与工作区配置（不拉远程包）：`sansheng_update({ action: "sync-skills" })`
2. **未挂载 MCP 时直接调用终端 CLI**：
   - 仅检查：`sansheng update --check --json`
   - 执行升级与同步：`sansheng update --json`
   - 指定版本/Tag：`sansheng update <version> --json`
   - 仅同步本地 Skills 与配置：`sansheng update --skip-npm --json`
   - 若本机位于 `sansheng-liubu` 本地 Git 仓库中，优先通过仓库自身脚本运行 `node bin/cli.js update --json` 以启用 Git 模式（自动 `git fetch/pull`、依赖检查、失败回滚与多运行时 Skill 重注入）。

## 2. 执行结果汇报
执行完成后，向用户简洁汇报：
- **安装模式与版本变化**：`git` 或 `npm` 模式，升级前版本 → 升级后版本（或已是最新）。
- **全局 AI 运行时 Skills 同步情况**：已更新哪些运行时（如 Antigravity、Claude、Cursor、Trae 等）以及同步了哪些技能。
- **工作区同步状态**：若当前目录包含 `.sansheng/`，汇报配置与 IDE 规则刷新结果；若非三省项目目录则说明已跳过避免污染。
- **异常处理**：若检测到 Git 脏工作区或权限不足（`EACCES`/`EPERM`），清晰给出原因和用户可执行的下一步命令，不强行覆盖未提交修改。
