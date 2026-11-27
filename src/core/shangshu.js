import fs from 'fs';
import path from 'path';
import { YongleBridge } from '../tools/yongle-bridge.js';
import { parseUATBlocks } from './uat-runner.js';
import { getFileBizBrief, syncMilestoneToBizContext, loadBizIndex } from './biz-context.js';

/**
 * 尚书省 (Shangshu) - 掌管执行与状态统领 (RUN 与归档阶段)
 * 职责:
 * 1. 任务分片池管理 (Tasks Sharding: .sansheng/tasks/*.md)
 * 2. 活跃指针与 TASK.md 滑动窗口限制 (<150行)
 * 3. 分片轮转、多任务切换与两级归档
 */

export class Shangshu {
  constructor(cwd = process.cwd()) {
    this.cwd = cwd;
    const sanshengDir = path.join(cwd, '.sansheng');
    
    // 优先读取 .sansheng/TASK.md，向下兼容根目录 TASK.md
    const sanshengTask = path.join(sanshengDir, 'TASK.md');
    const rootTask = path.join(cwd, 'TASK.md');
    this.taskPath = fs.existsSync(sanshengTask) ? sanshengTask : (fs.existsSync(rootTask) ? rootTask : sanshengTask);

    // 优先读取 .sansheng/ROADMAP.md，向下兼容根目录 ROADMAP.md
    const sanshengRoadmap = path.join(sanshengDir, 'ROADMAP.md');
    const rootRoadmap = path.join(cwd, 'ROADMAP.md');
    this.roadmapPath = fs.existsSync(sanshengRoadmap) ? sanshengRoadmap : (fs.existsSync(rootRoadmap) ? rootRoadmap : sanshengRoadmap);

    this.archiveDir = path.join(sanshengDir, 'archive');
    this.sanshengDir = sanshengDir;
    this.tasksDir = path.join(sanshengDir, 'tasks');
    this.activeTaskPointerPath = path.join(sanshengDir, '.active_task');
    this.yongle = new YongleBridge();
  }

  // ==========================================
  // 1. 任务分片池架构 (Tasks Sharding)
  // ==========================================

  /**
   * 判断当前工作区是否处于任务分片模式
   * 当 .sansheng/tasks 目录存在且包含分片 Markdown 文件时为分片模式
   */
  isShardedMode() {
    if (!fs.existsSync(this.tasksDir)) return false;
    try {
      const files = fs.readdirSync(this.tasksDir).filter(f => f.endsWith('.md') && !f.startsWith('.'));
      return files.length > 0;
    } catch (_) {
      return false;
    }
  }

  /**
   * 确保分片目录 .sansheng/tasks 存在
   */
  ensureTasksDir() {
    if (!fs.existsSync(this.tasksDir)) {
      fs.mkdirSync(this.tasksDir, { recursive: true });
    }
    return this.tasksDir;
  }

  /**
   * 获取当前活跃 Task ID
   */
  getActiveTaskId() {
    if (fs.existsSync(this.activeTaskPointerPath)) {
      try {
        const id = fs.readFileSync(this.activeTaskPointerPath, 'utf-8').trim();
        if (id) return id;
      } catch (_) {}
    }

    // 若无显式指针，扫描分片，自动返回第一个未完成的任务
    const tasks = this.listTasks();
    const pending = tasks.find(t => !t.completed);
    if (pending) return pending.id;

    return tasks[0]?.id || null;
  }

  /**
   * 切换当前活跃 Task ID 并联动更新看板
   */
  setActiveTask(taskId) {
    if (!taskId) return null;
    const cleanId = String(taskId).trim().replace(/^\[|\]$/g, '');
    this.ensureTasksDir();
    fs.writeFileSync(this.activeTaskPointerPath, cleanId, 'utf-8');
    this.syncTaskIndex();
    return cleanId;
  }

  /**
   * 根据 Task ID 检索对应分片文件路径（支持前缀匹配与模糊匹配）
   * @param {string} taskId 任务编号，如 "TASK-01" 或 "TASK-01-order-export"
   * @returns {string|null}
   */
  getTaskPath(taskId) {
    if (!taskId || !fs.existsSync(this.tasksDir)) return null;
    const cleanId = String(taskId).trim().replace(/^\[|\]$/g, '');

    const files = fs.readdirSync(this.tasksDir).filter(f => f.endsWith('.md') && !f.startsWith('.'));
    // 1. 精确匹配文件名（不带扩展名或带扩展名）
    let match = files.find(f => f === `${cleanId}.md` || f === cleanId);
    if (match) return path.join(this.tasksDir, match);

    // 2. 前缀匹配（如 taskId 为 TASK-01，文件名为 TASK-01-order-export.md）
    match = files.find(f => {
      const base = f.replace(/\.md$/i, '');
      return base.toLowerCase() === cleanId.toLowerCase() ||
        base.toLowerCase().startsWith(`${cleanId.toLowerCase()}-`) ||
        base.toLowerCase().startsWith(`${cleanId.toLowerCase()}_`);
    });
    if (match) return path.join(this.tasksDir, match);

    // 3. 包含匹配
    match = files.find(f => f.toLowerCase().includes(cleanId.toLowerCase()));
    if (match) return path.join(this.tasksDir, match);

    return null;
  }

  /**
   * 列出所有分片任务
   * @returns {Array<object>}
   */
  listTasks() {
    if (!fs.existsSync(this.tasksDir)) return [];
    let files = [];
    try {
      files = fs.readdirSync(this.tasksDir).filter(f => f.endsWith('.md') && !f.startsWith('.')).sort();
    } catch (_) {
      return [];
    }

    let activeId = null;
    if (fs.existsSync(this.activeTaskPointerPath)) {
      try {
        activeId = fs.readFileSync(this.activeTaskPointerPath, 'utf-8').trim();
      } catch (_) {}
    }

    const tasks = files.map(file => {
      const fullPath = path.join(this.tasksDir, file);
      const content = fs.readFileSync(fullPath, 'utf-8');
      return this.parseTaskContent(content, fullPath, file, activeId);
    });

    // 若无显式 activeId，默认以第一个未完成任务为活跃
    if (!activeId) {
      const firstPending = tasks.find(t => !t.completed);
      if (firstPending) {
        firstPending.isActive = true;
      } else if (tasks.length > 0) {
        tasks[0].isActive = true;
      }
    }

    return tasks;
  }

  /**
   * 解析单个分片 Markdown 内容
   */
  parseTaskContent(content, fullPath, filename, activeId = null) {
    const lines = (content || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    const firstLine = lines.find(l => l.trim().startsWith('#')) || lines[0] || '';
    
    // 提取 ID，优先匹配形如 [TASK-01] 或从文件名提取
    let id = '';
    const idMatch = firstLine.match(/\[?(TASK-[\w.-]+)\]?/i) || filename.match(/^(TASK-[\w.-]+?)(?:[-_.]|$)/i);
    if (idMatch) {
      id = idMatch[1].toUpperCase();
    } else {
      id = filename.replace(/\.md$/i, '').toUpperCase();
    }

    // 提取标题 (去除前导 Markdown 标记、Emoji 与 [TASK-xx] 标签)
    let title = firstLine
      .replace(/^#+\s*/, '')
      .replace(/^[🎯📋⚠️🚀🔧📦✨\s]+/, '')
      .replace(/\[?TASK-[\w.-]+\]?[:\s-]*/i, '')
      .trim();
    if (!title) {
      title = filename.replace(/\.md$/i, '');
    }

    // 提取关联的 [REQ-xx]
    const reqMatches = content.match(/REQ-\d+/gi) || [];
    const boundReqs = [...new Set(reqMatches.map(r => r.toUpperCase()))];

    // 提取关联的 [RULE-xx]
    const ruleMatches = content.match(/RULE-\d+/gi) || [];
    const boundRules = [...new Set(ruleMatches.map(r => r.toUpperCase()))];

    // 提取关联的 [BIZ-YYYYMMDD-xx]
    const bizMatches = content.match(/BIZ-\d{8}-\d+/gi) || [];
    const boundBiz = [...new Set(bizMatches.map(b => b.toUpperCase()))];

    // 提取 UAT 验收项
    const uats = parseUATBlocks(content);
    const completedUats = uats.filter(u => u.passed).length;

    // 判定任务完成状态
    // 规则：若有 UAT 项，则所有 UAT 通过才算完成；若无 UAT 项，检查是否包含未完成勾选框 - [ ]
    let completed = false;
    if (uats.length > 0) {
      completed = completedUats === uats.length;
    } else {
      const hasUnchecked = lines.some(l => /^\s*-\s*\[\s*\]/.test(l));
      const hasChecked = lines.some(l => /^\s*-\s*\[[xX]\]/.test(l));
      completed = hasChecked && !hasUnchecked;
    }

    const isActive = activeId ? (id.toLowerCase() === activeId.toLowerCase() || filename.toLowerCase().includes(activeId.toLowerCase())) : false;

    return {
      id,
      title,
      filename,
      filePath: fullPath,
      completed,
      isActive,
      boundReqs,
      boundRules,
      boundBiz,
      uats,
      totalUats: uats.length,
      completedUats,
    };
  }

  /**
   * 创建新的独立任务分片 (Task Shard)
   * @param {object} taskDef 任务定义
   * @param {object} [options] 选项
   * @returns {string} 生成的文件路径
   */
  createTaskSlice(taskDef = {}, options = {}) {
    this.ensureTasksDir();
    const id = (taskDef.id || `TASK-${String(this.listTasks().length + 1).padStart(2, '0')}`).toUpperCase();
    const title = taskDef.title || '新研发任务';
    const cleanSlug = title.replace(/[^\w\u4e00-\u9fa5]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30);
    const fileName = `${id}${cleanSlug ? '-' + cleanSlug : ''}.md`;
    const destPath = path.join(this.tasksDir, fileName);

    const boundReqs = Array.isArray(taskDef.boundReqs) ? taskDef.boundReqs : [];
    const boundRules = Array.isArray(taskDef.rules) ? taskDef.rules : (Array.isArray(options.rules) ? options.rules : []);
    const reqDetails = options.reqs || [];

    // 构建需求章节
    let reqSection = '';
    if (boundReqs.length > 0) {
      reqSection = boundReqs.map(r => {
        const found = reqDetails.find(d => (d.id || '').toUpperCase() === r.toUpperCase());
        if (found) {
          const acs = (found.acs || []).map((ac, idx) => `  - **AC-${idx + 1}**: ${ac}`).join('\n');
          return `- **[${found.id} ${found.title || ''}]**\n${acs || '  - 满足既定业务预期'}`;
        }
        return `- **[${r}]** 对应 PRD 细节约定`;
      }).join('\n');
    } else {
      reqSection = `> ⚠️ *[门下省警告] 当前任务未显式绑定 [REQ-xx]，开发时请严格防漏！*`;
    }

    // 构建规则章节
    let ruleSection = '';
    if (boundRules.length > 0) {
      ruleSection = boundRules.map((r, i) => {
        const rId = typeof r === 'string' ? r : (r.id || `RULE-${String(i + 1).padStart(2, '0')}`);
        const rContent = typeof r === 'string' ? r : (r.content || r.text || '遵守既定边界契约');
        return `- **[${rId}]** ${rContent}`;
      }).join('\n');
    } else {
      ruleSection = `- **[RULE-01]** 严禁破坏现有业务单测，外部输入必须执行严格防御校验。`;
    }

    // 构建质量门禁与 UAT
    let uatSection = '';
    if (Array.isArray(taskDef.uats) && taskDef.uats.length > 0) {
      uatSection = taskDef.uats.map(u => {
        if (typeof u === 'string') return `- [ ] ${u}`;
        return `- [ ] \`[${u.id || 'UAT-01'}]\` (溯源: ${u.trace || boundReqs[0] || 'REQ-01'}) 【${u.title || title}】\n  - **前置与数据**：${u.preconditions || '准备对应业务数据'}\n  - **操作步骤**：${u.steps || '触发业务执行'}\n  - **PRD预期对照**：${u.expected || '给出合规业务反馈'}`;
      }).join('\n');
    } else {
      uatSection = `- [ ] \`[UAT-01]\` (溯源: ${boundReqs[0] || 'REQ-01'} / AC-1) 【${title} 正常业务流验收】
  - **前置与数据**：具备业务权限的测试环境
  - **操作步骤**：1. 进入对应功能；2. 触发提交操作
  - **PRD预期对照**：界面给出预期成功反馈，数据正常持久化
- [ ] \`[UAT-02]\` (溯源: ${boundReqs[0] || 'REQ-01'} / AC-2) 【${title} 边界与异常拦截】
  - **前置与数据**：输入非法或超限参数
  - **操作步骤**：触发提交操作
  - **PRD预期对照**：系统正确拦截并给出友好错误提示，杜绝越界`;
    }

    const testCmd = taskDef.testCommand || 'dotnet test';

    const content = `# 🎯 [${id}] ${title}

* **状态**: [ ] 待执行
* **负责人**: 兵部工兵 (Worker Subagent)
* **关联需求**: ${boundReqs.length > 0 ? boundReqs.map(r => `\`[${r}]\``).join(', ') : '无'}

---

## 📋 绑定的原子需求细节 (已切片隔离)
${reqSection}

---

## ⚠️ 适用业务边界与铁律契约
${ruleSection}

---

## 🎯 专属质量门禁与验收清单 (Quality Gates)

### 1. 自动化单元测试门禁
- [ ] 运行 \`${testCmd}\`，所有相关单测 100% 绿灯通过。

### 2. 人工 UAT 交付验收准则清单
${uatSection}
`;

    fs.writeFileSync(destPath, content, 'utf-8');

    // 默认若尚无活跃指针，则设为当前新任务
    if (!fs.existsSync(this.activeTaskPointerPath)) {
      fs.writeFileSync(this.activeTaskPointerPath, id, 'utf-8');
    }

    // 同步刷新主看板 TASK.md
    this.syncTaskIndex();

    return destPath;
  }

  /**
   * 汇总所有分片状态，刷新生成主看板 .sansheng/TASK.md (保证 < 150 行)
   */
  syncTaskIndex() {
    if (!this.isShardedMode()) return;
    const tasks = this.listTasks();
    const total = tasks.length;
    const completed = tasks.filter(t => t.completed).length;
    const activeTask = tasks.find(t => t.isActive) || tasks.find(t => !t.completed) || tasks[0];
    const percent = total > 0 ? Math.round((completed / total) * 100) : 100;

    const taskLines = tasks.map(t => {
      const mark = t.completed ? 'x' : ' ';
      const tag = t.isActive ? ' 🔥 `[当前活跃]`' : (t.completed ? ' ✅' : ' ⏳');
      const reqStr = t.boundReqs.length > 0 ? ` (溯源: ${t.boundReqs.join(', ')})` : '';
      return `- [${mark}] \`[${t.id}]\` ${t.title}${reqStr}${tag}`;
    }).join('\n');

    let activeSliceOverview = '> 暂无活跃任务切片';
    if (activeTask) {
      activeSliceOverview = `### 🎯 当前活跃任务切片: \`[${activeTask.id}] ${activeTask.title}\`
* **分片文件**: \`.sansheng/tasks/${activeTask.filename}\`
* **需求溯源**: ${activeTask.boundReqs.length > 0 ? activeTask.boundReqs.map(r => `\`[${r}]\``).join(', ') : '通用'}
* **验收进度**: UAT 通过 ${activeTask.completedUats}/${activeTask.totalUats} 项 (${activeTask.completed ? '已达成 ✅' : '进行中 🔥'})`;
    }

    const rawBoard = `# 🏛️ 三省六部活跃任务看板 (Active Tasks HUD)

> 📊 **整体进度**: ${completed} / ${total} 完成 (${percent}%) | 当前活跃: \`${activeTask ? activeTask.id : '无'}\`  
> 📁 **分片存储**: \`.sansheng/tasks/*.md\` (多任务物理隔离，杜绝覆盖冲突)

## 📋 任务分片总览 (Task Shards Index)
${taskLines || '- 暂无任务分片'}

---

${activeSliceOverview}

---
> 💡 *[尚书省指令]* 输入 \`s\` 单步执行当前任务；输入 \`c\` 批量推进；输入 \`archive\` 触发结项归档。
`;

    // 实施滑动窗口检查（保证永不超 150 行）
    const finalBoard = this.enforceSlidingWindow(rawBoard, 150);

    // 写入 .sansheng/TASK.md
    if (!fs.existsSync(this.sanshengDir)) {
      fs.mkdirSync(this.sanshengDir, { recursive: true });
    }
    const targetPath = path.join(this.sanshengDir, 'TASK.md');
    fs.writeFileSync(targetPath, finalBoard, 'utf-8');
    this.taskPath = targetPath;
  }

  /**
   * 归档单个任务分片
   */
  archiveTask(taskId) {
    const taskPath = this.getTaskPath(taskId);
    if (!taskPath || !fs.existsSync(taskPath)) return false;

    const taskArchiveDir = path.join(this.archiveDir, 'tasks');
    if (!fs.existsSync(taskArchiveDir)) {
      fs.mkdirSync(taskArchiveDir, { recursive: true });
    }

    const fileName = path.basename(taskPath);
    const timestamp = new Date().toISOString().slice(0, 10);
    const dest = path.join(taskArchiveDir, `${timestamp}-${fileName}`);

    fs.copyFileSync(taskPath, dest);
    try { fs.unlinkSync(taskPath); } catch (_) {}

    // 若归档的是当前活跃任务，清除指针
    if (fs.existsSync(this.activeTaskPointerPath)) {
      const active = fs.readFileSync(this.activeTaskPointerPath, 'utf-8').trim();
      if (active.toLowerCase() === taskId.toLowerCase()) {
        try { fs.unlinkSync(this.activeTaskPointerPath); } catch (_) {}
      }
    }

    this.syncTaskIndex();
    console.log(`📁 [尚书省归档] 任务分片 [${taskId}] 已归档至: ${path.relative(this.cwd, dest)}`);
    return true;
  }

  // ==========================================
  // 2. 原有向后兼容方法保持与升级
  // ==========================================

  /**
   * 检查并确保 TASK.md 严格处于滑动窗口限制以内 (< 150 行)
   * 具备语义感知能力：优先在章节或任务边界折叠，并自动保持 Markdown 代码块闭合
   */
  enforceSlidingWindow(content, maxLines = 150) {
    if (!content) return '';
    const lines = content.split('\n');
    if (lines.length <= maxLines) {
      return content;
    }

    console.warn(`⚠️ [尚书省警告] TASK.md 超过 ${maxLines} 行 (${lines.length} 行)，正在执行语义感知滑动窗口折叠！`);

    // 寻找在 [maxLines - 30, maxLines] 范围内的安全语义切割点
    let cutIndex = maxLines;
    const minCut = Math.max(10, maxLines - 30);
    
    // 优先寻找二级/三级标题分界点
    for (let i = maxLines - 1; i >= minCut; i--) {
      const line = lines[i].trim();
      if (line.startsWith('## ') || line.startsWith('### ')) {
        cutIndex = i;
        break;
      }
    }

    const truncatedLines = lines.slice(0, cutIndex);

    // 校验代码块 ``` 闭合状态，若未闭合则自动安全补全
    let backtickCount = 0;
    for (const l of truncatedLines) {
      if (l.trim().startsWith('```')) {
        backtickCount++;
      }
    }
    if (backtickCount % 2 !== 0) {
      truncatedLines.push('```');
    }

    truncatedLines.push('');
    truncatedLines.push(`> ℹ️ *[尚书省提示] 历史任务进度已超出 ${maxLines} 行滑动窗口上限并自动折叠。完整阶段记录请查阅归档: .sansheng/archive/*`);

    return truncatedLines.join('\n');
  }

  /**
   * 阶段滑动归档 (Phase Roll-over)
   */
  archivePhase(phaseName = 'current') {
    if (!fs.existsSync(this.archiveDir)) {
      fs.mkdirSync(this.archiveDir, { recursive: true });
    }

    if (fs.existsSync(this.taskPath)) {
      const timestamp = new Date().toISOString().slice(0, 10);
      const dest = path.join(this.archiveDir, `phase-${phaseName}-${timestamp}.md`);
      fs.copyFileSync(this.taskPath, dest);
      console.log(`📁 [尚书省归档] 当前阶段已安全归档至: ${path.relative(this.cwd, dest)}`);
    }
  }

  /**
   * 更新 ROADMAP.md：将当前活跃 Phase 标记为已完成 (SPEC §3)
   */
  markRoadmapPhaseComplete() {
    if (!fs.existsSync(this.roadmapPath)) return;
    try {
      let content = fs.readFileSync(this.roadmapPath, 'utf-8');
      const timestamp = new Date().toISOString().slice(0, 10);
      // 匹配第一个未完成且标记为活跃的 Phase 行
      const updated = content.replace(
        /- \[ \] (.+?)(?:\[(?:当前活跃|Active)\s*🔥\]|\`\[(?:当前活跃|Active)\s*🔥\]\`)/,
        `- [x] $1\`[COMPLETED ${timestamp} ✅]\``
      );
      if (updated !== content) {
        fs.writeFileSync(this.roadmapPath, updated, 'utf-8');
        console.log(`📋 [尚书省] 已在 ROADMAP.md 中标记当前阶段为完成。`);
      }
    } catch (_) {}
  }

  /**
   * 清理临时文件与缓存，确保代码仓库 100% 纯净 (SPEC §3)
   */
  cleanTemporaryFiles() {
    const tempFiles = ['codebase_map.md', '.active_task'];
    const tempDirs = ['cache'];
    let cleaned = 0;

    for (const f of tempFiles) {
      const p = path.join(this.sanshengDir, f);
      if (fs.existsSync(p)) {
        try { fs.unlinkSync(p); cleaned++; } catch (_) {}
      }
    }
    for (const d of tempDirs) {
      const p = path.join(this.sanshengDir, d);
      if (fs.existsSync(p)) {
        try { fs.rmSync(p, { recursive: true, force: true }); cleaned++; } catch (_) {}
      }
    }
    if (cleaned > 0) {
      console.log(`🧹 [尚书省纯净化] 已清理 ${cleaned} 个临时文件/目录，仓库恢复纯净。`);
    }
  }

  /**
   * 触发永乐大典同步 (SPEC §7)
   */
  syncToYongle() {
    console.log(`💡 正在检查《永乐大典》同步环境...`);
    this.yongle.syncKnowledge();
  }

  /**
   * 项目结项全量归档 (Milestone Close) (SPEC §3 完整实现)
   * 1. 归档当前 TASK.md 与全部分片 tasks/ → archive/
   * 2. 删除活跃 TASK.md 与 tasks/
   * 3. 更新 ROADMAP.md 标记完成
   * 4. 清理临时文件恢复仓库纯净
   * 5. 触发永乐大典同步
   */
  closeMilestone() {
    // 0. 结项前收集活跃任务/看板中的 BIZ-xxx 关联，自动补录改动文件并刷新永久业务索引（绝不清理 .sansheng/context/）
    const activeBizIds = new Set();
    try {
      if (fs.existsSync(this.taskPath)) {
        const content = fs.readFileSync(this.taskPath, 'utf-8');
        (content.match(/BIZ-\d{8}-\d+/gi) || []).forEach(id => activeBizIds.add(id.toUpperCase()));
      }
      this.listTasks().forEach(t => (t.boundBiz || []).forEach(id => activeBizIds.add(id)));
      const bizSync = syncMilestoneToBizContext(this.cwd, { bizIds: [...activeBizIds] });
      if (bizSync && !bizSync.skipped) {
        console.log(`🧭 [业务溯源同步] 已刷新 .sansheng/context/index.json (档案 ${bizSync.stats?.totalBiz ?? 0} 条 / 锚点 ${bizSync.stats?.totalAnchors ?? 0} 处)。`);
      }
    } catch (_) {}

    // 1. 归档单看板
    this.archivePhase('final');

    // 1.1 若存在分片目录，归档所有分片
    if (fs.existsSync(this.tasksDir)) {
      const timestamp = new Date().toISOString().slice(0, 10);
      const milestoneTasksArchive = path.join(this.archiveDir, `milestone-${timestamp}-tasks`);
      if (!fs.existsSync(milestoneTasksArchive)) {
        fs.mkdirSync(milestoneTasksArchive, { recursive: true });
      }

      try {
        const files = fs.readdirSync(this.tasksDir).filter(f => f.endsWith('.md'));
        files.forEach(f => {
          fs.copyFileSync(path.join(this.tasksDir, f), path.join(milestoneTasksArchive, f));
        });
        fs.rmSync(this.tasksDir, { recursive: true, force: true });
        console.log(`📁 [尚书省归档] 所有分片任务已安全归档至: ${path.relative(this.cwd, milestoneTasksArchive)}`);
      } catch (_) {}
    }

    // 2. 清理活跃任务看板
    if (fs.existsSync(this.taskPath)) {
      try {
        fs.unlinkSync(this.taskPath);
        console.log(`🧹 [尚书省纯净化] 已安全清理当前活跃任务看板: ${path.relative(this.cwd, this.taskPath)}`);
      } catch (_) {}
    }

    // 3. 更新 ROADMAP.md
    this.markRoadmapPhaseComplete();

    // 4. 清理临时文件
    this.cleanTemporaryFiles();

    // 5. 触发永乐大典同步
    this.syncToYongle();

    console.log(`🎉 [尚书省结项] 项目开发全链路圆满完成！`);
  }

  /**
   * 为工兵构建聚焦微切片上下文 (Zero-Dilution Worker Context) (SPEC §9, §16)
   * 仅打包当前 Task 关联的 [REQ-xx] 细节与 [RULE-xx] 边界，杜绝上下文污染导致的偷工减料
   */
  buildWorkerSliceContext(task = {}, options = {}) {
    const { reqs = [], rules = [], targetFiles = [], cwd = this.cwd } = options;
    const taskId = task?.id || '当前指定任务';
    const taskTitle = task?.title || (typeof task === 'string' ? task : '未定义任务描述');
    const boundReqs = Array.isArray(task?.boundReqs) ? task.boundReqs.map(r => r.toUpperCase()) : [];
    const filesToInspect = Array.isArray(targetFiles) && targetFiles.length > 0
      ? targetFiles
      : (Array.isArray(task?.targetFiles) ? task.targetFiles : (Array.isArray(task?.files) ? task.files : []));

    // 过滤与当前任务严格相关的 REQ 条目
    const relevantReqs = (Array.isArray(reqs) ? reqs : []).filter(r => {
      const id = typeof r === 'string' ? r.toUpperCase() : (r?.id || '').toUpperCase();
      return boundReqs.includes(id);
    });

    let reqSection = '';
    if (relevantReqs.length > 0) {
      reqSection = relevantReqs.map(r => {
        if (typeof r === 'string') return `- **[${r}]** 对应业务验收细节`;
        const title = r.title || r.id;
        const acs = Array.isArray(r.acs) && r.acs.length > 0
          ? r.acs.map((ac, idx) => `    * **AC-${idx + 1}**: ${ac}`).join('\n')
          : '    * 满足既定正常流与异常流业务准则';
        return `- **[${r.id} ${title}]**\n${acs}`;
      }).join('\n');
    } else if (boundReqs.length > 0) {
      reqSection = boundReqs.map(r => `- **[${r}]** 对应 PRD 细节约定`).join('\n');
    } else {
      reqSection = `> ⚠️ *[门下省警告] 当前任务未显式绑定 [REQ-xx]，请严格遵守需求与测试守门员机制！*`;
    }

    let ruleSection = '';
    const safeRules = Array.isArray(rules) ? rules : [];
    if (safeRules.length > 0) {
      ruleSection = safeRules.map((r, i) => {
        const id = r?.id || `RULE-${String(i + 1).padStart(2, '0')}`;
        const content = r?.content || r?.text || (typeof r === 'string' ? r : '未定义规则内容');
        return `- **[${id}]** ${content}`;
      }).join('\n');
    } else {
      ruleSection = `- **[RULE-01]** 严禁破坏现有业务单测，外部输入必须执行严格防御校验。`;
    }

    // 自动为待改文件注入业务背景与特殊逻辑红线（无记录时 0 字符追加，受 Token 硬预算约束）
    let bizGuardSection = '';
    if (filesToInspect.length > 0 && cwd) {
      const bizIndex = loadBizIndex(cwd);
      const briefs = [];
      const perFileBudget = Math.max(120, Math.floor((options.bizBudgetTokens || 300) / Math.min(filesToInspect.length, 3)));
      for (const f of filesToInspect.slice(0, 5)) {
        const brief = getFileBizBrief(cwd, f, {
          index: bizIndex,
          maxTokens: perFileBudget,
          heading: `##### 📄 \`${f}\` 业务红线`,
        });
        if (brief) briefs.push(brief);
      }
      if (briefs.length > 0) {
        bizGuardSection = `\n#### 🧭 目标文件历史业务背景与特殊逻辑红线 (改前必读):\n${briefs.join('\n\n')}\n`;
      }
    }

    return `### 🎯 尚书省工兵当前专属任务切片 (Task Context Slice)
* **当前执行任务**：\`${taskId}: ${taskTitle}\`

#### 📋 绑定的原子需求细节 (已剔除无关需求干扰):
${reqSection}

#### ⚠️ 适用的业务边界与铁律契约:
${ruleSection}
${bizGuardSection}
#### 🛡️ 工兵特战执行守则:
1. **测试断言守门**：先为上述需求细节编写/确认自动化测试用例，全绿前严禁声称完成。
2. **零副作用控制**：仅修改当前任务直接相关的最小文件集，严禁越界扩散改动。
3. **Diff 行级落地**：提交前必须自检 Git Diff，确保 PRD 约定的边界与异常在代码中有具体语句落实，严禁伪实现。
4. **特殊逻辑红线保护**：严禁擅自删除或绕过带 \`@biz\`/\`@why\` 锚点的特殊逻辑；新增反直觉特殊处理（特例豁免/历史兼容/防并发/魔数阈值）时必须在对应行上方标注 1 行 \`// @biz <BIZ-ID>: 原因\`（常规代码零注释侵入）。`;
  }

  /**
   * 验证工兵交付的 Git Diff 是否真实落实了任务改动 (SPEC §9)
   */
  verifyTaskDiff(task = {}, gitDiffText = '') {
    if (!gitDiffText || typeof gitDiffText !== 'string' || gitDiffText.trim().length === 0) {
      return {
        passed: false,
        reason: 'Git Diff 为空，未检测到任何实际源码修改（存在伪交付风险）'
      };
    }

    const addedLines = gitDiffText
      .split('\n')
      .filter(l => l.startsWith('+') && !l.startsWith('+++'))
      .map(l => l.substring(1).trim());

    if (addedLines.length === 0) {
      return {
        passed: false,
        reason: '未检测到任何新增或修改的代码逻辑'
      };
    }

    return {
      passed: true,
      addedLineCount: addedLines.length,
      sampleAdded: addedLines.slice(0, 3)
    };
  }
}

export function executeArchive() {
  const shangshu = new Shangshu();
  shangshu.closeMilestone();
}
