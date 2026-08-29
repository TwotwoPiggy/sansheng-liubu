# 🏛️ 三省六部 (sansheng-liubu)

> 基于中国古代「三省六部制」的极简高质跨环境 AI 研发工作流系统  
> **核心定位**：高质量交付 + 去形式主义（羽量级） + 极致节省 Token（降幅 85%+）  
> **深度适配**：Vue 3 + Element Plus/UI + C# / .NET 8 / .NET Core 3.1 + HTML/JS/JSON/XML

---

## ⚡ 三大零摩擦调用方式

### 1. 零前缀自然语言自感知 (Zero-Prefix)
再也不需要输入死板的括号标签！AI 自动根据工作区状态识别意图：
* 丢入需求 ➔ 自动启动【中书省 ALIGN】
* 回复决策 ➔ 自动启动【门下省 PLAN】
* 喊一句“继续/开跑” ➔ 自动进入【尚书省 RUN】

### 2. 统一斜杠指令 (`/sansheng`)
在 IDE 聊天框中输入 `/sansheng [内容]` 即可驱动全流程：
```
/sansheng 帮我把所有列表页做异步导出重构
/sansheng map   # 重新生成项目 AST 骨架图
```

### 3. 极速单字符快捷交互 (Shorthand)
* `c` / `r` ➔ 全自动执行全部任务与测试 (continue/run)
* `s` / `n` ➔ 单步推进当前任务并汇报 (step/next)
* `1` / `y` ➔ 交互式 UAT 判定通过 (Passed)
* `2 报错描述` ➔ 交互式 UAT 判定未通过，工兵原地自愈修复
* `archive` / `结项` ➔ 触发两级项目归档与永乐大典同步

---

## 🛠️ VS Code + GitHub Copilot 专属深度增强

针对主要使用 **VS Code + GitHub Copilot** 的开发者，`sansheng-liubu` 在 `sansheng init` 时会自动注入 **四大专属原生增强套件**：

```
 ┌─────────────────────────────────────────────────────────────┐
 │           🏆 sansheng-liubu 针对 VS Code Copilot 专属增强    │
 └──────────────────────────────┬──────────────────────────────┘
                                │
   ┌────────────────┬───────────┴────────┬────────────────┐
   ▼                ▼                    ▼                ▼
【1. 指令文件注入】 【2. 原生 MCP 工具】 【3. Prompt 模板】 【4. VS Code Tasks】
.github/copilot-   .vscode/mcp.json     .github/prompts/  .vscode/tasks.json
instructions.md    打通 CBM 15个工具     一键唤醒 /sansheng 快捷键一键跑测试/骨架
每句对话自动注入    Copilot 直接查调用链  VS Code 原生斜杠   无需手动切终端敲命令
```

1. **自动注入 `.github/copilot-instructions.md`**：Copilot 每轮对话自动遵循三省六部极简高质铁律（消灭长篇刷屏，强制 3 行 HUD）；
2. **自动生成 `.vscode/mcp.json`**：将 `codebase-memory-mcp` 直接挂进 VS Code，Copilot 聊天框可原生调用 `get_architecture`、`trace_path` 等 15 个工具；
3. **原生 Prompt 模板 (`.github/prompts/sansheng.prompt.md`)**：VS Code Copilot 聊天框输入 `/sansheng` 即可一键唤醒自感知工作流；
4. **快捷自动化任务 (`.vscode/tasks.json`)**：按 `Ctrl+Shift+P` ➔ 运行任务一键跑骨架提取与质量门禁测试。

---

## 📦 一键安装与环境配置指南

三省六部原生深度整合了 **微观编译器 (LSP)** 与 **宏观知识图谱 (CBM)** 双引擎，建议在开发机上一键安装好全套底座：

```
 ┌─────────────────────────────────────────────────────────────┐
 │                🏆 三省六部“双引擎”代码智能体系               │
 └──────────────────────────────┬──────────────────────────────┘
                                │
        ┌───────────────────────┴───────────────────────┐
        ▼                                               ▼
【微观层: csharp-ls (LSP 编译器)】           【宏观层: CBM (知识图谱 MCP)】
─────────────────────────────────           ─────────────────────────────────
• 0-Token 原生跨文件原子重命名                • `get_architecture`: 秒级透视分层与入口
• 100% 官方 Roslyn 语法与类型诊断             • `trace_path`: 双向追踪 10 层调用链
• 0 毫秒精准跳转接口实现类                   • `detect_changes`: 评估 Git 改动爆炸半径
```

### 1. 全局安装三省六部核心引擎
```bash
npm install -g sansheng-liubu
```

### 2. 安装 C# / .NET 官方语言服务器 (LSP 编译器微观精度)
```bash
dotnet tool install -g csharp-ls
```

### 3. 安装 CBM 知识图谱引擎 (宏观架构与 15 个 MCP 工具)
```bash
npm install -g codebase-memory-mcp
```
*(Windows PowerShell 也可直接运行官方脚本: `Invoke-WebRequest -Uri https://raw.githubusercontent.com/DeusData/codebase-memory-mcp/main/install.ps1 -OutFile install.ps1; Unblock-File .\install.ps1; .\install.ps1`)*

### 4. 安装 Vue 3 前端语言服务器 (可选)
```bash
npm install -g @vue/language-server
```

### 5. 一键自检全套代码智能环境
在终端任意目录下运行：
```bash
sansheng init
# 或单独验证 LSP 协议:
npm run test:lsp
```

---

## 🚀 现有项目（Existing Projects）快速接入实战指南

当环境安装完成后，对于你本地已有的真实业务项目（如 `D:\...\02.CatFoodManager`），仅需 **3 步** 即可无缝激活全套体系：

### 步骤 1：进入已有项目根目录并初始化
```bash
cd "D:\your-existing-project"
sansheng init
```
👉 **CLI 会全自动完成环境对账并自动注入 VS Code / Copilot 增强**！

### 步骤 2：建立项目代码地图与 CBM 知识图谱（双擎初始化）
```bash
# 1. 提取 AST 纯文本代码符号骨架 (生成 .codebase_map.md，Token 物理压缩 95%+)
sansheng map

# 2. 为项目构建 CBM 知识图谱数据库 (秒级解析全局类节点、函数节点与调用链边)
codebase-memory-mcp cli index_repository
```
> 💡 **可选：打开浏览器看 3D 图谱**：  
> 运行 `codebase-memory-mcp --ui=true`，浏览器访问 `http://localhost:9749` 即可 3D 旋转查看调用拓扑！

### 步骤 3：在 AI IDE 中直接对话开发（双擎协同流）
在 VS Code Copilot / Antigravity / Qoder 对话框中，**直接用大白话输入需求**：
1. **中书省 ALIGN**：*“我想给 CatFoodManager 加个库存预警定时任务”* ➔ AI 结合 CBM 图谱与骨架秒级透视分层，精准提问与提炼铁律；
2. **门下省 PLAN**：回复 *“1A 2B 3A”* ➔ AI 自动生成带 `dotnet test` 门禁的 `TASK.md`（聊天框仅回显 3 行 HUD）；
3. **六部 RUN**：回复 *“c”* ➔ AI 调用 `csharp-ls` 纯净编写代码，跑通全部测试；
4. **UAT 自愈**：AI 弹出单项验收，如遇 Bug 回复 *“2 描述”* ➔ 原地写用例修复并复测，通过后自动沉淀心得至《永乐大典》；
5. **结项归档**：回复 *“archive”* ➔ 两级自动归档，代码仓库恢复 100% 纯净。

---

## 🗺️ Codebase Mapping (AST 代码骨架拓扑提取原理)

针对庞大老工程，传统 AI 往往盲读几万行源码导致 **Token 瞬间爆炸并引发上下文截断**。  
`sansheng-liubu` 原生内置了基于 **AST 语法树的轻量代码拓扑提取器**：

* **C# / .NET**：秒级遍历解析 `.cs` 源码，提取命名空间、`class` / `interface` 声明、方法入参签名与特性注解，**彻底剥离函数体 `{ ... }` 细节**；
* **Vue 3 SFC**：精准提取 `<script setup>` 内的 `defineProps`、`defineEmits`、`defineExpose` 与核心函数签名；
* **实测效果**：**Token 物理压缩率超过 95%**！把几万行的复杂工程压缩成一张仅占 1~2k Token 的超高密度架构符号图。

一键提取命令：
```bash
sansheng map
```
*自动在项目根目录生成 `.codebase_map.md`。*

---

## 💾 数据持久化与存储位置说明

* **项目 AST 骨架图**：直接保存在项目根目录的 [`.codebase_map.md`](.codebase_map.md)（透明 Markdown 纯文本）；
* **CBM 知识图谱数据库**：持久化保存在本地物理固态硬盘 `~/.cache/codebase-memory-mcp/`（SQLite `.db` 磁盘文件，**电脑重启绝不丢失**）。

---

## 🛠️ CLI 常用命令集

| 命令 | 描述 |
| :--- | :--- |
| `sansheng init` | 初始化当前工作区三省六部配置（自动注入 Copilot 增强 / 探测 LSP 与 CBM） |
| `sansheng update` | 检查最新版本、无损增量同步工作区配置与 IDE 技能规则 |
| `sansheng map` | 提取当前项目 AST 符号骨架地图 (`.codebase_map.md`) |
| `sansheng status` | 极简查看当前活跃 Phase 进度 HUD |
| `sansheng uat` | 启动交互式单项 UAT 验收与自愈修复循环 |
| `sansheng archive` | 触发两级项目结项归档并同步至《永乐大典》 |

---

## 📄 详细架构白皮书
完整 21 章节工业级设计白皮书详见：[`LITE_DEV_WORKFLOW_SPEC.md`](./LITE_DEV_WORKFLOW_SPEC.md)
