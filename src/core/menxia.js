/**
 * 门下省 (Menxia) - 掌管审核与门禁定义 (PLAN 阶段)
 * 职责: 模块依赖拓扑分析、生成专属质量门禁 (Quality Gates)、100% 需求覆盖率对账与 UAT-to-REQ 双向审计
 */

export class Menxia {
  /**
   * 生成专属质量门禁契约 (针对 .NET 8 与 Vue 3)
   * 支持传入 options.reqs 自动派生四要素（溯源、前置数据、步骤、PRD预期）UAT 清单
   */
  generateQualityGates(options = {}) {
    const { reqs = [] } = options;

    let uatSection = '';
    if (Array.isArray(reqs) && reqs.length > 0) {
      const uatItems = [];
      let uatIndex = 1;
      reqs.forEach((r, idx) => {
        const reqId = typeof r === 'string' ? r : (r.id || `REQ-${String(idx + 1).padStart(2, '0')}`);
        const title = typeof r === 'object' && r.title ? r.title : `需求 ${reqId} 功能点`;
        
        // 每个 REQ 派生 1 个正向流用例 + 1 个异常/边界拦截用例 (SPEC §5)
        const id1 = `UAT-${String(uatIndex++).padStart(2, '0')}`;
        uatItems.push(`- [ ] \`[${id1}]\` (溯源: ${reqId} / AC-1) 【${title} - 正常业务流】
  - **前置与数据**：具备对应权限的测试账号，初始前置数据准备完毕
  - **操作步骤**：1. 进入对应业务功能界面；2. 输入有效参数并触发提交
  - **PRD预期对照**：界面给出预期成功反馈提示，系统状态与数据正确更新`);

        const id2 = `UAT-${String(uatIndex++).padStart(2, '0')}`;
        uatItems.push(`- [ ] \`[${id2}]\` (溯源: ${reqId} / AC-2) 【${title} - 边界与异常拦截】
  - **前置与数据**：构造边界超限参数或越权测试账号
  - **操作步骤**：1. 触发超限输入或无权操作
  - **PRD预期对照**：系统正确拦截并给出友好错误提示/码，杜绝崩溃或越权`);
      });
      uatSection = uatItems.join('\n');
    } else {
      uatSection = `- [ ] \`[UAT-01]\` (溯源: REQ-01 / AC-1) 【基础正常路径业务验证】
  - **前置与数据**：登录具备业务权限的测试账号
  - **操作步骤**：进入功能模块并按业务标准流程执行操作
  - **PRD预期对照**：按需求文档约定弹出成功提示，数据正常落库流转
- [ ] \`[UAT-02]\` (溯源: REQ-01 / AC-2) 【异常与边界提示验证】
  - **前置与数据**：输入超限参数或模拟异常中断
  - **操作步骤**：触发异常操作场景
  - **PRD预期对照**：系统正确拦截并返回 PRD 规定的错误码与用户友好提示`;
    }

    return `## 🎯 验收标准与质量门禁 (Verification & Quality Gates)

### 1. 自动化单元测试门禁 (.NET & Vue3)
- [ ] 运行 \`dotnet test --verbosity quiet\`，所有测试 100% 绿灯 (0 Failed, 0 Error)。
- [ ] 运行 \`npx vitest run\` (若包含前端测试)，通过率 100%。

### 2. 边界铁律反例用例清单 (Boundary Test Cases)
- [ ] 边界测试用例通过 (校验限流、熔断、异常回滚与数据脱敏)。

### 3. 一键端到端冒烟命令 (One-Line Smoke Command)
\`\`\`bash
dotnet test --filter "Category=IntegrationTest"
\`\`\`

### 4. 人工 UAT 交付验收准则清单 (Human Sign-off Checklist)
> ⚠️ 制定铁律：严禁以代码测代码。必须包含四要素（编号溯源、前置数据、操作步骤、PRD预期核对）。

${uatSection}
`;
  }

  /**
   * 100% 需求覆盖率严格对账审计 (SPEC §4)
   * 必须校验 tasks 绑定的 REQ ID 是否真实存在于 reqs 清单中，杜绝虚假通过
   */
  auditCoverage(reqs = [], tasks = []) {
    const reqSet = new Set(reqs.map(r => (typeof r === 'string' ? r : r.id)).filter(Boolean));
    const totalReqs = reqSet.size;
    const coveredReqs = new Set();
    const invalidBoundReqs = new Set();

    tasks.forEach(t => {
      (t.boundReqs || []).forEach(r => {
        const id = typeof r === 'string' ? r : r?.id;
        if (!id) return;
        if (reqSet.has(id)) {
          coveredReqs.add(id);
        } else {
          invalidBoundReqs.add(id);
        }
      });
    });

    const uncovered = [...reqSet].filter(id => !coveredReqs.has(id));
    const passed = totalReqs > 0 ? uncovered.length === 0 : true;

    return {
      total: totalReqs,
      covered: coveredReqs.size,
      uncovered,
      invalidBoundReqs: [...invalidBoundReqs],
      rate: totalReqs === 0 ? '100%' : `${Math.round((coveredReqs.size / totalReqs) * 100)}%`,
      passed
    };
  }

  /**
   * UAT-to-REQ 双向追溯与 PRD 预期审计门禁 (SPEC §5)
   * 严格校验:
   * 1. 无源不立: 每个 UAT 必须绑定合法的 REQ ID
   * 2. 无漏不结: 所有 REQ 必须 100% 被 UAT 覆盖
   * 3. 预期明确: 每个 UAT 必须具备 PRD 预期对照字段 (Expected / 预期)
   */
  auditUATCoverage(reqs = [], uats = []) {
    const reqSet = new Set(reqs.map(r => (typeof r === 'string' ? r : r.id)).filter(Boolean));
    const totalReqs = reqSet.size;
    const coveredReqs = new Set();
    const invalidBoundReqs = new Set();
    const untraceableUats = [];
    const missingExpectedUats = [];

    // 解析 UAT 列表 (支持 Markdown 文本输入或对象数组)
    const normalizedUats = parseUATItems(uats);

    normalizedUats.forEach(u => {
      const uatId = u.id || 'UAT-?';
      const boundReqs = u.boundReqs || [];

      if (boundReqs.length === 0) {
        untraceableUats.push(uatId);
      } else {
        boundReqs.forEach(r => {
          if (reqSet.has(r)) {
            coveredReqs.add(r);
          } else {
            invalidBoundReqs.add(r);
          }
        });
      }

      // 校验是否具备 PRD 预期对照
      if (!u.hasExpected) {
        missingExpectedUats.push(uatId);
      }
    });

    const uncoveredReqs = [...reqSet].filter(id => !coveredReqs.has(id));
    const passed = totalReqs > 0
      ? (uncoveredReqs.length === 0 && invalidBoundReqs.size === 0 && untraceableUats.length === 0 && missingExpectedUats.length === 0)
      : (untraceableUats.length === 0 && missingExpectedUats.length === 0);

    return {
      totalReqs,
      coveredReqs: coveredReqs.size,
      uncoveredReqs,
      totalUats: normalizedUats.length,
      invalidBoundReqs: [...invalidBoundReqs],
      untraceableUats,
      missingExpectedUats,
      rate: totalReqs === 0 ? '100%' : `${Math.round((coveredReqs.size / totalReqs) * 100)}%`,
      passed
    };
  }

  /**
   * 从 Plan Markdown 中解析任务列表及绑定的 REQ ID (SPEC §9)
   */
  parseTasksFromMarkdown(planMarkdown = '') {
    if (!planMarkdown || typeof planMarkdown !== 'string') return [];
    const lines = planMarkdown.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    const tasks = [];
    let currentTask = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // 匹配任务行，如 `- [ ] Task 1.1: ...` 或 `- [x] Task 1: ...` 或 `### Task 1: ...`
      const taskHeaderMatch = line.match(/^(\s*-\s*\[([ xX])\]|\s*###?\s+)\s*`?\[?(Task\s*[^\]:`]+|Wave\s*\d+[^\]:`]*)\]?`?[:\s]*(.*)/i);

      if (taskHeaderMatch) {
        if (currentTask) {
          tasks.push(finalizeParsedTask(currentTask));
        }
        currentTask = {
          id: taskHeaderMatch[3].trim(),
          title: (taskHeaderMatch[4] || '').trim(),
          lines: [line]
        };
      } else if (currentTask) {
        // 遇到下一个同级任务或高阶标题时结束当前任务
        if (/^\s*-\s*\[\s*[ xX]?\s*\]/.test(line) || line.trim().startsWith('## ')) {
          tasks.push(finalizeParsedTask(currentTask));
          currentTask = null;
        } else {
          currentTask.lines.push(line);
        }
      }
    }

    if (currentTask) {
      tasks.push(finalizeParsedTask(currentTask));
    }

    return tasks;
  }

  /**
   * 对 Plan 进行严格反向需求对账审计 (SPEC §9)
   * 拿原始需求逐条在 Plan 中检索责任 Task，杜绝计划阶段压缩丢失细节
   */
  auditPlan(reqs = [], plan = '') {
    let normalizedReqs = reqs;
    if (typeof reqs === 'string') {
      const matches = reqs.match(/REQ-\d+/gi) || [];
      normalizedReqs = [...new Set(matches.map(m => m.toUpperCase()))];
    } else if (Array.isArray(reqs)) {
      normalizedReqs = reqs.map(r => (typeof r === 'string' ? r : r.id)).filter(Boolean);
    }

    let parsedTasks = [];
    if (typeof plan === 'string') {
      parsedTasks = this.parseTasksFromMarkdown(plan);
    } else if (Array.isArray(plan)) {
      parsedTasks = plan;
    }

    const reqSet = new Set(normalizedReqs.map(r => r.toUpperCase()));
    const totalReqs = reqSet.size;
    const coveredReqs = new Set();
    const invalidBoundReqs = new Set();
    const unboundedTasks = [];

    parsedTasks.forEach(t => {
      const bound = t.boundReqs || [];
      if (bound.length === 0) {
        unboundedTasks.push(t.id || t.title || '未知任务');
      } else {
        bound.forEach(r => {
          const u = r.toUpperCase();
          if (reqSet.has(u)) {
            coveredReqs.add(u);
          } else {
            invalidBoundReqs.add(u);
          }
        });
      }
    });

    const uncoveredReqs = [...reqSet].filter(id => !coveredReqs.has(id));
    const passed = totalReqs > 0
      ? (uncoveredReqs.length === 0 && invalidBoundReqs.size === 0)
      : (parsedTasks.length > 0);

    return {
      totalReqs,
      coveredReqs: coveredReqs.size,
      uncoveredReqs,
      invalidBoundReqs: [...invalidBoundReqs],
      unboundedTasks,
      totalTasks: parsedTasks.length,
      rate: totalReqs === 0 ? '100%' : `${Math.round((coveredReqs.size / totalReqs) * 100)}%`,
      passed
    };
  }

  /**
   * 生成《门下省封驳差额单》(Rejection Report) 或放行确认 (SPEC §9)
   */
  generateRejectionReport(auditResult = {}) {
    const {
      passed = false,
      totalReqs = 0,
      coveredReqs = 0,
      uncoveredReqs = [],
      invalidBoundReqs = [],
      unboundedTasks = [],
      rate = '0%'
    } = auditResult;

    if (passed) {
      return `### ✅ 【门下省门禁放行】开发计划审计通过！
* **📊 需求覆盖率**：100% (${coveredReqs}/${totalReqs} 项原子需求已全额对账)
* **🛡️ 状态**：无未覆盖遗漏项，开发计划符合高质量交付标准，准许录入 \`.sansheng/TASK.md\` 并放行至尚书省执行！`;
    }

    const missingSection = uncoveredReqs.length > 0
      ? uncoveredReqs.map(r => `  - ❌ **\`[${r}]\`**：未在任何开发 Task 中规划对应实现与测试！`).join('\n')
      : '  - （无遗漏原子需求）';

    const invalidSection = invalidBoundReqs.length > 0
      ? `\n* ⚠️ **虚假绑定 REQ (需求清单中不存在此编号)**：\n` + invalidBoundReqs.map(r => `  - \`[${r}]\``).join('\n')
      : '';

    const unboundedSection = unboundedTasks.length > 0
      ? `\n* ❓ **悬空任务 (未标注溯源 [REQ-xx])**：\n` + unboundedTasks.map(t => `  - \`${t}\``).join('\n')
      : '';

    return `### ❌ 【门下省封驳】开发计划未通过门禁审计！(覆盖率: ${rate})
* 🚨 **门禁封驳原因**：检测到需求细节逃逸或任务溯源缺失，开发计划被驳回。
* 📌 **逃逸/未覆盖原子需求 (共 ${uncoveredReqs.length} 项)**：
${missingSection}${invalidSection}${unboundedSection}

---
💡 **【尚书省待命指示】**：请根据上述《封驳差额单》，为遗漏的需求补齐具体实现 Task 与边界单测，重新提审通过后方可动工。`;
  }

  /**
   * 对分片任务池 (.sansheng/tasks/*.md) 进行全量反向需求审计与门禁校验 (SPEC §9)
   * 支持传入任务数组或 Shangshu 实例
   */
  auditShardedPlan(reqs = [], tasksOrShangshu = []) {
    let taskList = tasksOrShangshu;
    if (tasksOrShangshu && typeof tasksOrShangshu.listTasks === 'function') {
      taskList = tasksOrShangshu.listTasks();
    }
    return this.auditPlan(reqs, taskList);
  }

  /**
   * 生成独立 Auditor Agent 对抗式反向扫描专属 Prompt (SPEC §9)
   */
  generateAdversarialAuditPrompt(reqs = '', planMarkdown = '') {
    const reqText = typeof reqs === 'string' ? reqs : JSON.stringify(reqs, null, 2);
    return `你现在是门下省特任【严苛门禁审计官】。你的职责是彻底阻止存在细节遗漏的开发方案投入生产。

【输入资产】
1. 原始原子需求清单与约束：
\`\`\`markdown
${reqText}
\`\`\`

2. 候选开发计划 (Plan / TASK.md)：
\`\`\`markdown
${planMarkdown}
\`\`\`

【你的审计规程】
1. **反向逐条检索**：以原始需求的每一个 [REQ-xx] 为标尺，在候选计划中反查其落实的 Task。
2. **保真度与边界核查**：即使 Task 标题提及了该功能，但若漏掉了异常码、错误提示文案、防刷频控、超时或字段级校验，一律判定为【未覆盖】。
3. **禁止臆测**：不得假设工兵在写代码时会“顺手实现”。任何未落在文字上的细节均视为遗漏。

【判定输出格式】
若存在遗漏，必须输出《门下省封驳差额单》并列出所有具体遗漏项；若 100% 确认无遗漏，输出门禁放行令。`;
  }
}

/**
 * 将多格式 UAT 输入解析为标准化结构
 * 复用 uat-runner.js 中的严格解析器，确保解析行为与交互式验收引擎完全一致
 */
function parseUATItems(uats) {
  if (typeof uats === 'string') {
    return parseUATFromMarkdownInternal(uats);
  }

  if (Array.isArray(uats)) {
    // 若是字符串数组（单行形式）
    if (uats.length > 0 && typeof uats[0] === 'string') {
      return parseUATFromMarkdownInternal(uats.join('\n'));
    }

    // 若是对象数组
    return uats.map((item, idx) => {
      const id = item.id || `UAT-${String(idx + 1).padStart(2, '0')}`;
      let boundReqs = [];
      if (Array.isArray(item.boundReqs)) {
        boundReqs = item.boundReqs;
      } else if (typeof item.boundReq === 'string') {
        boundReqs = [item.boundReq];
      } else if (typeof item.title === 'string') {
        const matches = item.title.match(/REQ-\d+/gi);
        if (matches) boundReqs = matches.map(m => m.toUpperCase());
      }
      const hasExpected = Boolean(item.expected || item.prdExpected || (typeof item.text === 'string' && /预期|expected/i.test(item.text)));
      return { id, boundReqs, hasExpected, raw: item };
    });
  }

  return [];
}

/**
 * 从 Markdown 文本中解析结构化 UAT 项
 * 正则匹配与 uat-runner.js 的 parseUATBlocks 保持一致：
 * - 行首必须以 `- [ ]` 或 `- [x]` 开头（严格模式，避免正文误匹配）
 * - hasExpected 的判定基于提取后的 expected 字段是否为非空字符串
 */
function parseUATFromMarkdownInternal(markdown) {
  const items = [];
  const lines = (markdown || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  let currentItem = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // 与 uat-runner 一致的严格行首正则：必须以 `- [空格/x/X]` 开头
    const uatHeaderMatch = line.match(/^(\s*-\s*\[([ xX])\])\s*`?\[?(UAT-\d+)\]?`?(.*)/i);

    if (uatHeaderMatch) {
      if (currentItem) {
        items.push(finalizeAuditItem(currentItem));
      }
      currentItem = {
        id: uatHeaderMatch[3].toUpperCase(),
        headerRest: uatHeaderMatch[4] || '',
        lines: [line],
      };
    } else if (currentItem) {
      // 边界终止条件与 uat-runner 一致（含大写 X）
      if (/^\s*-\s*\[\s*[ xX]?\s*\]/.test(line) || line.trim().startsWith('### ') || line.trim().startsWith('## ')) {
        items.push(finalizeAuditItem(currentItem));
        currentItem = null;
      } else {
        currentItem.lines.push(line);
      }
    }
  }

  if (currentItem) {
    items.push(finalizeAuditItem(currentItem));
  }

  return items;
}

/**
 * 解析单个 UAT 项的溯源 REQ 和 PRD 预期
 * hasExpected 判定逻辑与 uat-runner 的 finalizeParsedItem 保持一致：
 * 基于实际提取后的 expected 字段是否为非空字符串，而非仅正则扫描关键词
 */
function finalizeAuditItem(item) {
  const fullText = item.lines.join('\n');
  const reqMatches = fullText.match(/REQ-\d+/gi) || [];
  const uniqueReqs = [...new Set(reqMatches.map(r => r.toUpperCase()))];

  // 与 uat-runner.js 的 finalizeParsedItem 保持一致的提取逻辑
  let expected = '';
  item.lines.forEach(l => {
    const trimmed = l.trim().replace(/^[-*]\s*/, '');
    if (/PRD预期(?:对照)?|预期(?:对照|结果)?/i.test(trimmed)) {
      expected = trimmed.replace(/^.*?(?:PRD预期(?:对照)?|预期(?:对照|结果)?)[:：* ]*/i, '').trim();
    }
  });

  return {
    id: item.id,
    boundReqs: uniqueReqs,
    hasExpected: expected.length > 0,
    fullText
  };
}

/**
 * 解析单个 Task 项的溯源 REQ 列表与标题
 */
function finalizeParsedTask(item) {
  const fullText = item.lines.join('\n');
  const reqMatches = fullText.match(/REQ-\d+/gi) || [];
  const uniqueReqs = [...new Set(reqMatches.map(r => r.toUpperCase()))];

  return {
    id: item.id,
    title: item.title,
    boundReqs: uniqueReqs,
    fullText
  };
}

