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

## 🚀 现有项目（Existing Projects）快速接入实战指南

对于你本地已有的真实业务项目（如 `D:\...\02.CatFoodManager`），仅需 **3 步** 即可无缝接入：

### 步骤 1：进入已有项目根目录并初始化
```bash
cd "D:\your-existing-project"
sansheng init
```
👉 **CLI 会全自动完成环境对账**：
* ⚡ 自动探测 C# 编译环境 (`csharp-ls`) ➔ `✅ 已就绪`
* 🧠 自动探测知识图谱 (`codebase-memory-mcp`) ➔ `✅ 已就绪`
* 🏛️ 自动探测《永乐大典》连接 ➔ `✅ 已就绪`
* 📄 自动生成项目专属 `.sanshengrc.json` 与 `ROADMAP.md` 总纲。

### 步骤 2：生成项目 AST 代码符号骨架图
```bash
sansheng map
```
*自动生成 `.codebase_map.md`，秒级提取全系统 C# 与 Vue 3 核心类名、方法签名与行号（Token 物理压缩率 95%+）。*

### 步骤 3：在 AI IDE 中直接对话开发
在 Antigravity / Qoder / VS Code Copilot 对话框中，**直接用大白话输入需求**：
1. **中书省 ALIGN**：*“我想给 CatFoodManager 加个库存预警定时任务”* ➔ AI 结合骨架图精准质询与提炼铁律；
2. **门下省 PLAN**：回复 *“1A 2B 3A”* ➔ AI 自动生成带单元测试门禁的 `TASK.md`（仅回显 3 行 HUD）；
3. **六部 RUN**：回复 *“c”* ➔ AI 调用 `csharp-ls` 纯净编写代码，跑通 `dotnet test`；
4. **UAT 自愈**：AI 弹出单项验收，如遇 Bug 回复 *“2 没发邮件”* ➔ 原地写用例修复并复测，通过后自动沉淀心得至《永乐大典》；
5. **结项归档**：回复 *“archive”* ➔ 两级自动归档，代码仓库恢复 100% 纯净。

---

## 🧠 代码智能与知识图谱增强套件 (强烈推荐)

`sansheng-liubu` 原生深度整合了 **微观编译器 (LSP)** 与 **宏观知识图谱 (CBM)** 双引擎，彻底消灭盲读代码与上下文爆炸：

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

### 1. 安装 C# / .NET 官方语言服务器 (LSP 编译器微观精度)
```bash
dotnet tool install -g csharp-ls
```

### 2. 安装 CBM 知识图谱引擎 (宏观架构与 15 个 MCP 工具)
```bash
npm install -g codebase-memory-mcp
```
*(Windows PowerShell 也可直接运行官方脚本: `Invoke-WebRequest -Uri https://raw.githubusercontent.com/DeusData/codebase-memory-mcp/main/install.ps1 -OutFile install.ps1; Unblock-File .\install.ps1; .\install.ps1`)*

### 3. 安装 Vue 3 前端语言服务器 (可选)
```bash
npm install -g @vue/language-server
```

### 4. 一键自检全套代码智能环境
```bash
sansheng init
# 或单独验证 LSP 协议:
npm run test:lsp
```

---

## 💾 数据持久化与存储位置说明

* **项目 AST 骨架图**：直接保存在项目根目录的 [`.codebase_map.md`](.codebase_map.md)（透明 Markdown 纯文本）；
* **CBM 知识图谱数据库**：持久化保存在本地物理固态硬盘 `~/.cache/codebase-memory-mcp/`（SQLite `.db` 磁盘文件，**电脑重启绝不丢失**）。

---

## 📦 快速安装与 CLI 命令集

### 1. 全局安装
```bash
npm install -g sansheng-liubu
```

### 2. CLI 常用命令集
| 命令 | 描述 |
| :--- | :--- |
| `sansheng init` | 初始化当前工作区三省六部配置（含永乐大典 / LSP / CBM 探测） |
| `sansheng update` | 检查最新版本、无损增量同步工作区配置与 IDE 技能规则 |
| `sansheng map` | 提取当前项目 AST 符号骨架地图 (`.codebase_map.md`) |
| `sansheng status` | 极简查看当前活跃 Phase 进度 HUD |
| `sansheng uat` | 启动交互式单项 UAT 验收与自愈修复循环 |
| `sansheng archive` | 触发两级项目结项归档并同步至《永乐大典》 |

---

## 📄 详细架构白皮书
完整 21 章节工业级设计白皮书详见：[`LITE_DEV_WORKFLOW_SPEC.md`](./LITE_DEV_WORKFLOW_SPEC.md)
