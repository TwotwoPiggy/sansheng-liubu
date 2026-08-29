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
```

### 3. 极速单字符快捷交互 (Shorthand)
* `c` / `r` ➔ 全自动执行全部任务与测试 (continue/run)
* `s` / `n` ➔ 单步推进当前任务并汇报 (step/next)
* `1` / `y` ➔ 交互式 UAT 判定通过 (Passed)
* `2 报错描述` ➔ 交互式 UAT 判定未通过，工兵原地自愈修复
* `archive` / `结项` ➔ 触发两级项目归档与永乐大典同步

---

## 🗺️ Codebase Mapping (AST 代码骨架拓扑提取)

针对庞大老工程，传统 AI 往往盲读几万行源码导致 **Token 瞬间爆炸并引发上下文截断**。  
`sansheng-liubu` 原生内置了基于 **AST 语法树的轻量代码拓扑提取器**：

### 1. 工作原理与 Token 压缩率
* **C# / .NET**：秒级遍历解析 `.cs` 源码，提取命名空间、`class` / `interface` 声明、方法入参签名与特性注解，**彻底剥离函数体 `{ ... }` 细节**；
* **Vue 3 SFC**：精准提取 `<script setup>` 内的 `defineProps`、`defineEmits`、`defineExpose` 与核心函数签名；
* **实测效果**：**Token 物理压缩率超过 95%**！把几万行的复杂工程压缩成一张仅占 1~2k Token 的超高密度架构符号图。

### 2. 一键提取命令
```bash
sansheng map
```
*自动在项目根目录生成 `.codebase_map.md`，AI 开工前先读骨架图，精准按需加载关键文件，杜绝源码盲读。*

---

## 🔌 LSP 语言服务器安装指南 (强烈推荐)

`sansheng-liubu` 原生内置了 **Language Server Protocol (LSP)** 客户端，配合语言服务器可解锁 **0-Token 跨文件原子重命名**、**毫秒级定义跳转**与**实时类型诊断（红波浪线捕获）**。

### 1. 安装 C# / .NET 语言服务器
```bash
dotnet tool install -g csharp-ls
```

### 2. 安装 Vue 3 前端语言服务器
```bash
npm install -g @vue/language-server
```

### 3. 一键验证 LSP 运行状态
```bash
npm run test:lsp
```
*自动探测本机语言服务器安装状态并完成 JSON-RPC 协议自检。*

---

## 📦 快速安装与使用

### 1. 全局安装
```bash
npm install -g sansheng-liubu
```

### 2. 项目初始化
在你的 Vue3 / .NET 项目根目录下运行：
```bash
sansheng init
```
*自动检测《永乐大典》与 LSP 环境，生成 `.sanshengrc.json` 与 `ROADMAP.md`。*

### 3. CLI 常用命令集
| 命令 | 描述 |
| :--- | :--- |
| `sansheng init` | 初始化当前工作区三省六部配置（含永乐大典与 LSP 探测） |
| `sansheng map` | 秒级提取当前项目 AST 符号骨架地图 (`.codebase_map.md`) |
| `sansheng update` | 检查最新版本、无损增量同步工作区配置与 IDE 技能规则 |
| `sansheng status` | 极简查看当前活跃 Phase 进度 HUD |
| `sansheng uat` | 启动交互式单项 UAT 验收与自愈修复循环 |
| `sansheng archive` | 触发两级项目结项归档并同步至《永乐大典》 |

---

## 📄 详细架构白皮书
完整 21 章节工业级设计白皮书详见：[`LITE_DEV_WORKFLOW_SPEC.md`](./LITE_DEV_WORKFLOW_SPEC.md)
