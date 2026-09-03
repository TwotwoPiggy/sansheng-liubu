# 🏛️ 三省六部 (sansheng-liubu)

> **基于中国古代「三省六部制」的极简高质跨环境 AI 研发工作流系统**  
> **核心定位**：高质量交付（100%需求对账 + 专属质量门禁） + 去形式主义（羽量级 3 行 HUD） + 极致节省 Token（降幅 85%+）  
> **深度适配**：Vue 3 + Element Plus/UI + C# / .NET 8 / .NET Core 3.1 + HTML/JS/JSON/XML  
> **跨环境支持**：VS Code Copilot / Antigravity / Qoder / DeepSeek Harness / Trae / Cursor

---

## 🗺️ 全生命周期：阶段 × 输入命令 × 触发技能速查矩阵

| 阶段 | 执行位置 | 开发者输入 (敲什么) | 底层调用的命令 / Skill | 核心产物 / 状态 |
| :--- | :--- | :--- | :--- | :--- |
| **0. 环境准备** | 🖥️ 终端 | `sansheng init`<br>`sansheng map`<br>`sansheng update` | `csharp-ls`, `codebase-memory-mcp`<br>`codebase-map.js`, `updater.js` | `.sansheng/config.json`<br>`.sansheng/codebase_map.md`<br>NPM 原地热升级与规则自愈 |
| **1. 中书省 ALIGN** | 💬 IDE 聊天框 | 直接输入需求文本，或：<br>`/sansheng [需求内容]` | **Skill**: `yongle-search` / `yongle-hybrid-search.js`<br>**Tools**: `codebase-map.js`, `tree-sitter` | 四要素微引用质询<br>`[REQ-xx]` 原子清单<br>`[RULE-xx]` 边界铁律 |
| **1.1 决策对齐** | 💬 IDE 聊天框 | `1A 2B 3A` (单选)<br>`A+B` (组合) / `先B后A` (演进)<br>`修改 Q1 为 B` (插话回溯) | 流式 Markdown 解析<br>自动涟漪影响分析 | 决策确定，自动触发门下省 |
| **2. 门下省 PLAN** | 💬 IDE 聊天框 / 🖥️ 终端 | 自动触发，或输入：<br>`定稿，生成任务板`<br>终端查看: `sansheng status` | **Tools**: `menxia.js`<br>**Gate**: `dotnet test`, `npx vitest` | `.sansheng/TASK.md` (≤150行)<br>100% 需求覆盖率对账表<br>聊天框 3 行 HUD 进度看板 |
| **3. 六部 RUN** | 💬 IDE 聊天框 | `c` / `r` (全自动跑完)<br>`s` / `n` (单步执行并汇报) | **Skill**: `invoke_subagent` / `worker.js`<br>**Tools**: `csharp-ls`, `dotnet format`, `biome`<br>**Test**: `dotnet test --verbosity quiet` | 纯净上下文代码编写<br>单元测试 100% 绿灯<br>自动化质量门禁通过 |
| **4. 交互式 UAT** | 💬 IDE 聊天框 / 🖥️ 终端 | 网页看板: `sansheng html`<br>终端验收: `sansheng uat`<br>卡片判定: `1` 或 `y` (通过)<br>缺陷反馈: `2 <报错/现象描述>` | **看板**: 0 Token 本地自包含 HTML (Chrome/Edge 鼠标点选)<br>**Agent**: 原地补写边界测试 ➔ 修复 ➔ 复测<br>**Skill**: `yongle-postmortem` (通过后自动归档) | `.sansheng/uat.html` (网页看板)<br>`[UAT-xx]` 逐项打勾<br>避坑心得归档至知识库 |
| **5. 归档结项** | 💬 IDE 聊天框 / 🖥️ 终端 | 终端: `sansheng archive`<br>聊天框: `archive` 或 `结项` | **Tools**: `shangshu.js` (`closeMilestone`)<br>**Skill**: `yongle-sync` / `yongle-sync-knowledge.js` | `TASK.md` ➔ `.sansheng/archive/`<br>`ROADMAP.md` 标记完成<br>清理临时文件，仓库 100% 纯净 |

---

## 📖 阶段实战详解：在什么阶段用什么命令/Skill

```
┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│ 0. 环境与图谱准备 │ ───> │ 1. 中书省对齐   │ ───> │ 2. 门下省门禁   │ ───> │ 3. 六部执行与自愈│ ───> │ 4. UAT与结项归档│
│  (CLI 命令)     │      │  (聊天框/Skill) │      │  (TASK.md/门禁) │      │  (工兵/Subagent)│      │  (自愈/永乐同步)│
└─────────────────┘      └─────────────────┘      └─────────────────┘      └─────────────────┘      └─────────────────┘
```

---

### 阶段 0：环境准备与项目接入 (Setup & Code Intelligence)

在终端（Terminal）进入你的业务项目根目录（如 `CatFoodManager`）：

#### 1. 初始化三省六部工作区
```bash
sansheng init
```
- **执行效果**：
  - 自动创建 `.sansheng/` 私有目录（含 `config.json` 与 `ROADMAP.md`）；
  - 自动检测并注入 VS Code Copilot 全套规则（`.github/copilot-instructions.md`、`.vscode/mcp.json`、`.vscode/tasks.json`、`.github/prompts/sansheng.prompt.md`）；
  - 自动将临时缓存加入 `.gitignore`，杜绝 Git 污染。

#### 2. 生成 AST 代码符号拓扑骨架 (Token 压缩率 > 95%)
```bash
sansheng map
```
- **底层命令**：调用 `src/tools/codebase-map.js`
- **执行效果**：秒级递归解析 C#（类/方法签名/特性）与 Vue 3 SFC（`props`/`emits`/函数），在 `.sansheng/codebase_map.md` 生成高密度骨架，供后续 Agent 精准定位，杜绝盲读源码。

#### 3. (可选) 多 AI IDE 规则双向同步
```bash
# 自动嗅探 Trae / CatPaw / Qoder / Cursor 规则并转译为 Copilot 规则
sansheng sync-rules

# 反向导出集中规则至指定 IDE
sansheng sync-rules --export trae,qoder,cursor
```

#### 4. 智能检测与原地升级 (无需卸载)
```bash
# 从 NPM 官方源自动检测最新版本并原地覆盖升级，无损同步工作区配置与 IDE 规则
sansheng update
```

---

### 阶段 1：中书省 【ALIGN 需求对齐阶段】

打开 IDE 聊天框（VS Code Copilot / Antigravity / Qoder）：

#### 1. 丢入原始需求（唤醒中书省）
- **开发者在聊天框输入**：
  ```text
  /sansheng 帮我给列表页实现异步流式导出，支持防 OOM、断点续传与下载中心抽屉
  ```
  *(注：亦可直接用自然语言随口输入，AI 自动感知进入 ALIGN 阶段)*

- **底层自动触发的 Skill 与工具**：
  - **Skill `yongle-search` / `yongle-hybrid-search.js`**：静默检索《永乐大典》中关于 `.NET 8 异步流式导出`、`Vue 3 大数据表格` 的历史避坑经验；
  - **工具 `codebase-map.js`**：结合 `.sansheng/codebase_map.md` 定位改动文件入口；
  - **AI 行为规范**：严格执行 **§13 非阻塞 Markdown 优先铁律**（严禁弹出阻塞型表单模态窗，使用流式 Markdown）。

- **AI 回显输出格式（四要素微引用）**：
  ```markdown
  #### ❓ 问题 1：【大数据量导出防 OOM 策略】
  * 📍 需求坐标：`src/Services/ExportService.cs:L45`
  * 📝 原文微引用：“单次最大支持 100 万行导出...”
  * 🔍 疑点/两难：内存一次性加载易触发 OOM，流式分片写盘需要配合后台异步作业。
  * 💡 决策选项：
    - **[选项 A (推荐)]** MediatR 管道拦截 + Hangfire 后台异步作业 + Redis SSE 流式进度
    - **[选项 B]** 本地内存 BlockingCollection 单机队列
  ```

#### 2. 用户快速回复与插话回溯
- **快速单选**：输入 `1A 2B 3A`
- **三态高级语法**：
  - 组合分层：`1(A+B)`
  - 决裁矩阵：`纠结 1A/1B`
  - 阶段演进：`先 1B 后 1A`
- **全局插话回溯（§14 涟漪分析）**：
  - 用户随时输入：`修改 Q1 为 B`
  - AI 立即优先响应，并自动扫描下游依赖，输出受影响节点的联动调整建议。

---

### 阶段 2：门下省 【PLAN 计划与质量门禁阶段】

当决策对齐完成，门下省自动接管：

#### 1. 生成活跃任务看板与质量门禁
- **开发者在聊天框输入**：`开跑`、`定稿` 或 `继续`
- **底层落盘状态文件**：`.sansheng/TASK.md`（**强制控制在 150 行以内**）
- **门禁定义清单 (Quality Gates)**：
  1. **自动化单测门禁**：`dotnet test --verbosity quiet`（0 Failed, 0 Error） / `npx vitest run`（100%通过）；
  2. **边界反例用例**：针对 `[RULE-01]` 至 `[RULE-04]` 的专用拦截测试方法；
  3. **一键冒烟命令**：`dotnet test --filter "Category=Smoke"`；
  4. **人工 UAT 验收项**：`[UAT-01]`、`[UAT-02]`。
- **100% 覆盖率对账**：严格校验 `[REQ-01 ~ xx]` 是否 100% 绑定到各 Wave 的具体 Task。

#### 2. 对话框极简 3 行 HUD 回显
AI 严禁长篇刷屏输出伪代码，仅回显 3 行：
```markdown
📊 [阶段进度] Wave 1/2: 核心导出管道与 Hangfire 作业 (.NET 8)
🎯 [门禁状态] dotnet test (0/15) | UAT 项 (0/3)
👉 回复 c (全自动开跑) 或 s (单步推进)
```

#### 3. (可选) 终端随时查看进度
```bash
sansheng status
```

---

### 阶段 3：尚书省与六部 【RUN 纯净执行与测试阶段】

#### 1. 启动执行
- **开发者在聊天框输入**：
  - `c` 或 `r` ➔ 全自动执行当前 Phase 的全部 Task 并跑通测试
  - `s` 或 `n` ➔ 单步执行当前 Task 并汇报

#### 2. 底层工兵执行机制
- **纯净工兵派生**：通过 `invoke_subagent` 或 `bin/worker.js` 派生独立上下文，每次仅携带当前 Task 与 1~2 个源码文件（0 历史 Token 负担）；
- **0-Token 物理重构**：
  - 跨文件重命名/跳转调用 LSP 原生指令（`csharp-ls` / `vue-language-server`）；
  - 代码格式化调用本地命令（`dotnet format` / `npx biome check --write`），严禁消耗 LLM Token 调缩进；
  - 源码写入调用局部 Hunk 替换（`replace_file_content`）；
- **四级语义权限保护 (§15)**：
  - 🟢 L1 只读 (`view_file`/`grep`) ➔ 自动放行
  - 🟡 L2 验证 (`dotnet test`/`vitest`) ➔ 自动放行
  - 🟠 L3 改写 (当前项目源码修改) ➔ 自动放行 + Git 本地保护
  - 🔴 L4 高危 (`rm -rf`/`git push -f`/删库/越界) ➔ **强制打断请求人工确认**；
- **弹性自愈升配**：工兵单任务测试连续 2 次失败时，自动召唤 Tier-1 旗舰大脑介入排查修复。

---

### 阶段 4：交互式 UAT 验收与自愈复盘闭环

所有代码与自动化单元测试通过后，触发 UAT 交付门禁。

#### 📌 铁律：四要素用例标准与 PRD 预期对账（严禁以代码测代码）
在 `TASK.md` 中生成的每一项 UAT 必须具备**四要素**（编号溯源、前置数据、操作步骤、🎯 PRD预期核对）：
```markdown
- [ ] `[UAT-01]` (溯源: REQ-01 / AC-1) 【订单列表异步导出正常流】
  - **前置与数据**：登录 operator_test 运营账号，系统存在待发货状态订单
  - **操作步骤**：进入【订单管理 ➔ 列表】➔ 勾选前 2 条 ➔ 点击右上角【批量导出】
  - **PRD预期对照**：1秒内弹出成功提示：“导出任务已提交”；进入【下载中心】状态为“已完成”，下载 Excel 打开无乱码，客户手机号显示为 138****0000 脱敏格式。
```
- **门禁对账**：门下省执行 `auditUATCoverage`，严格校验每个 `[REQ-xx]` 是否 100% 被正向与异常 UAT 覆盖，缺项或无 PRD 预期直接阻断。

---

#### 验收执行的三种方式：

#### 1. 方式 A：0 Token 本地交互式 HTML 验收看板（⭐ 最爽体验：浏览器鼠标点选）
无需启动常驻服务或占用端口，纯本地 3ms 瞬间编译：
```bash
sansheng html
```
- **双击即开**：直接用 Chrome / Edge 双击打开 `.sansheng/uat.html`；
- **鼠标直选与自动静默写回**：点击网页顶部的 **【📁 关联本地 TASK.md】** 授权一次，之后在网页上**每用鼠标勾选/取消一项，浏览器利用原生 File System Access API 自动实时写回磁盘的 `TASK.md`**（自动更新 `- [x]`）；
- **四要素卡片与进度计算**：直观展示前置、步骤与高亮的 🎯 PRD 预期对照，实时展示通过百分比（如 `67% Passed`）；
- **一键缺陷反馈**：点击卡片下方“记录反馈”，输入偏差后点击“复制自愈指令”，直接发给 AI 触发代码修复。

#### 2. 方式 B：终端交互式独立验收
```bash
sansheng uat
```
命令行逐项展示需求溯源、前置数据、操作步骤与 PRD 预期对照表，支持终端键盘快捷判定与即时自愈。同时每次执行会自动同步刷新 `.sansheng/uat.html`。

#### 3. 方式 C：聊天框单项卡片验收
AI 依次在聊天窗口弹出当前 UAT 项四要素：
- **判定通过**：输入 `1` 或 `y` ➔ 打勾 `- [x] UAT-01: Passed`，自动推进下一项；
- **判定不通过**：输入 `2 <实际现象与PRD预期的偏差>` ➔ AI 对照需求文档原文定位源码偏差，补写复现用例、修复并原地复测；
- **自愈复盘**：修复通过后自动触发 `yongle-postmortem` 将排查经验沉淀至《永乐大典》。

---

### 阶段 5：两级自动归档与结项纯净化

当所有 `[UAT-xx]` 全部标记为 Passed 后：

#### 1. 触发结项
- **开发者输入**：
  - 聊天框输入：`archive` 或 `结项` 或 `完工`
  - 或终端运行：`sansheng archive`

#### 2. 底层自动化执行动作
1. **阶段滑动归档 (Phase Archiving)**：当前 `TASK.md` 备份至 `.sansheng/archive/phase-final-2026-xx-xx.md`；
2. **清理活跃看板**：安全删除活跃 `TASK.md`，防止下一轮对话上下文膨胀；
3. **标记项目总纲**：自动在 `.sansheng/ROADMAP.md` 中标记本 Phase 为 `[COMPLETED 2026-xx-xx ✅]`；
4. **仓库 100% 纯净化**：自动清理 `.sansheng/codebase_map.md` 及临时缓存；
5. **永乐大典云端同步**：自动调用 `yongle-sync-knowledge.js` / Skill `yongle-sync`，将本次项目沉淀的全部经验推送到 Git 远程知识库。

---

## 🔌 DeepSeek Harness (`dsh`) 插件接入指南

`sansheng-liubu` 原生符合 **DeepSeek Harness (`dsh`) / Cordis Meta-Framework** 插件开发规范（**“一切皆插件”**、**“Fail-Closed 审批阻断”** 与 **“响应式自清理 Reversible Effects”**）。

---

### 1. 📥 插件安装 (Installation)

#### 方式 A：本地源码软链接安装（开发调试首选，修改源码无需发版即时生效）
在本地开发插件时，直接将源码目录软链到指定的 profile 中：
```bash
# 将本地插件软链接至 dev profile
dsh plugin --profile dev add D:\Computers\AIDevelop\Tools\Skills\sansheng-liubu

# 也可以链接到默认的 web profile
dsh plugin --profile web add D:\Computers\AIDevelop\Tools\Skills\sansheng-liubu
```

#### 方式 B：通过 DSH 命令行安装 (生产环境 NPM 发布后)
在你的 DSH 项目根目录中运行：
```bash
# 使用 DSH 官方插件管理指令
dsh plugin add sansheng-liubu

# 或通过包管理器直接引入
pnpm add sansheng-liubu
# 或
npm install sansheng-liubu
```

#### 方式 C：通过 DSH Web UI 可视化安装
1. 启动 DSH Web 界面并访问（默认 `http://localhost:5173`）；
2. 导航至左侧侧边栏 **Settings ➔ Plugins**（插件市场）；
3. 在搜索框输入 `sansheng-liubu`，点击 **Install**（安装）；
4. 安装完成后，插件状态将自动变为绿色 **Active**（已激活）。

#### 方式 D：本地开发与热联调补丁挂载 (Local Dev & Patch)
若在本地进行插件开发调试，可在工作区根目录创建 `cordis.yml`：
```yaml
plugins:
  group:agent:
    dsh-tools: {}
    dsh-session: {}
    dsh-user-approval: {}

  insert:
    - path: ./node_modules/sansheng-liubu/src/index.js: # 或指向本地开发源码路径 ./src/index.js
        models:
          architectTier: "gemini-3.7-flash"
          workerTier: "deepseek-v3"
          fallbackTier: "gemini-3.7-flash"
        escalationMaxRetries: 2
        codeIntelligence:
          lspEnabled: true
          cbmEnabled: false
        yongleDadian:
          enabled: true
          autoRecallOnAlign: true
          autoPostmortemOnFix: true
```
使用 DSH 补丁模式启动 Web UI：
```bash
npx @deepseek-ai/dsh web --patch ./cordis.yml
```

---

### 2. 🔄 插件更新 (Update)

#### 方式 A：通过 DSH 命令行更新
```bash
# 升级插件至最新版本
dsh plugin update sansheng-liubu

# 或通过包管理器更新
pnpm update sansheng-liubu
```

#### 方式 B：通过 DSH Web UI 一键升级
1. 进入 **Settings ➔ Plugins**；
2. 找到 `sansheng-liubu`，若有新版本将显示 **Update** 按钮；
3. 点击 **Update**，Cordis 运行时将自动完成无损热重载（Hot-Reload），无需重启 DSH 后台服务。

#### 方式 C：通过三省六部内置 CLI 原地升级
```bash
# 自动检测 npm 远端版本并原地覆盖升级 (无须卸载再安装)，随后增量同步工作区配置与 IDE 规则
sansheng update

# 仅检查是否有新版本
sansheng update --check

# 跳过 npm 包更新，仅同步工作区配置与 IDE 提示词规则
sansheng update --skip-npm

# 强制从 NPM 重新安装最新版
sansheng update --force
```

---

### 3. 🗑️ 插件卸载与停用 (Uninstall & Disable)

#### 1. 临时停用 (Disable / Pause)
- **Web UI 操作**：在 **Settings ➔ Plugins** 中，找到 `sansheng-liubu` 并关闭状态开关（Toggle Switch）。
- **CLI 操作**：
  ```bash
  dsh plugin disable sansheng-liubu
  ```
- **生命周期表现**：Cordis 会自动触发 `ctx.on('dispose')` 钩子，立即注销已注册的 6 个 Tool，安全清理后台定时器与子进程，**绝无悬挂句柄或内存残留**。

#### 2. 彻底卸载 (Uninstall / Remove)
- **Web UI 操作**：在 **Settings ➔ Plugins** 中点击 `sansheng-liubu` 的 **Uninstall**（卸载）按钮并确认。
- **CLI 操作**：
  ```bash
  dsh plugin remove sansheng-liubu
  # 或
  pnpm remove sansheng-liubu
  ```
- **清理本地配置（可选）**：若需完全清除本地工作区状态，可手动删除 `.sansheng/` 目录。

---

### 4. ⚙️ 配置项说明 (Schemastery Configuration)

在 DSH Web UI 配置面板中，`sansheng-liubu` 会自动渲染可视化配置表单：

| 配置项 (Key) | 类型 (Type) | 默认值 (Default) | 描述说明 |
| :--- | :--- | :--- | :--- |
| `models.architectTier` | `string` | `gemini-3.7-flash` | 中书省起草、微引用质询与门禁对齐的大脑模型 (架构师层级) |
| `models.workerTier` | `string` | `deepseek-v3` | 六部工兵派生纯净上下文执行模型 (工兵层级，极致省 Token) |
| `models.fallbackTier` | `string` | `gemini-3.7-flash` | 工兵连续失败时的自愈升配兜底模型 |
| `escalationMaxRetries` | `number` | `2` | 工兵单任务自测失败最大自愈重试次数（超过自动升配） |
| `codeIntelligence.lspEnabled`| `boolean` | `true` | 是否启用 C# (`csharp-ls`) 与 Vue 3 (`volar`) LSP 语义增强 |
| `codeIntelligence.cbmEnabled`| `boolean` | `false` | 是否连接 `codebase-memory-mcp` 知识图谱数据库 |
| `yongleDadian.enabled` | `boolean` | `true` | 是否连接《永乐大典》双向知识复利库 |
| `yongleDadian.autoRecallOnAlign` | `boolean` | `true` | 在 ALIGN 需求对齐阶段静默前置召回技术栈历史避坑经验 |
| `yongleDadian.autoPostmortemOnFix` | `boolean` | `true` | 在 UAT 缺陷修复后即时触发复盘沉淀知识 |

---

### 5. 🧰 DSH 原生工具清单 (Tool Registry)

DSH 模型上下文可随时调用以下受控工具：

| 工具名称 (`name`) | 权限等级 (`permissionTier`) | 风险分类 (`riskLevel`) | 功能描述 |
| :--- | :--- | :--- | :--- |
| `sansheng_codebase_map` | `workspace-read` | `low` | 扫描并提取 AST 符号拓扑骨架 (C#/Vue3/TS/JS，压缩率>95%) |
| `sansheng_task_status` | `read-only` | `low` | 读取当前活跃阶段 150 行 HUD 任务进度看板与完成率 |
| `sansheng_uat_gate` | `workspace-write` | `medium` | 管理与断言 UAT 质量门禁清单 `[UAT-xx]`，支持标记与缺陷自愈 |
| `sansheng_archive` | `workspace-write` | `medium` | 执行两级归档（阶段切片归档 / 结项全量归档并同步知识库） |
| `sansheng_sync_rules` | `workspace-write` | `medium` | 自动嗅探并双向同步多 AI IDE (Trae/Cursor/Qoder) 规则 |
| `sansheng_dispatch_worker` | `dangerous` | `high` | 派生纯净工兵执行任务，**强制接入 `ctx.approval` 显式审批阻断 (Fail-Closed)** |

---

## 🛠️ CLI 常用命令速查表

| 命令 | 适用场景 | 对应三省六部底层逻辑 |
| :--- | :--- | :--- |
| `sansheng init` | 首次接入或新项目初始化 | 嗅探环境、注入 VS Code Copilot 全套规则与 MCP 配置 |
| `sansheng map` | 源码结构变动时重新扫描 | 提取 AST 骨架生成 `.sansheng/codebase_map.md` (压缩率>95%) |
| `sansheng sync-rules` | 多 IDE 协同开发时 | 嗅探 Trae/CatPaw/Qoder/Cursor 规则并智能转译至 Copilot |
| `sansheng sync-rules --export <ide>` | 导出规则至其他 IDE | 将集中维护的规则导出为 `.trae/rules.md` / `.cursorrules` 等 |
| `sansheng status` | 随时查看进度 | 查看当前活跃 Phase 的 3 行 HUD 任务进度看板 |
| `sansheng html` | 网页可视化鼠标勾选 | 0 Token 编译本地自包含 UAT 看板 (`.sansheng/uat.html`)，支持浏览器静默写回 |
| `sansheng uat` | 命令行交互验收 | 启动交互式单项 UAT 验收与自愈修复循环 |
| `sansheng archive` | 模块全部交付结项时 | 触发两级归档、更新 ROADMAP、清理缓存、同步《永乐大典》 |
| `sansheng update` | 升级工作流引擎 | 从 NPM 检查并原地更新至最新版 (无须卸载)，无损增量合并配置与 IDE Prompt 模板 |

---

## 📄 详细架构白皮书
完整 21 章节工业级设计白皮书详见：[`LITE_DEV_WORKFLOW_SPEC.md`](./LITE_DEV_WORKFLOW_SPEC.md)

