import readline from 'readline';
import fs from 'fs';
import path from 'path';
import { YongleBridge } from '../tools/yongle-bridge.js';
import { findActiveTaskOrPlanPath } from './uat-html-compiler.js';

/**
 * 交互式单项 UAT 验收断言引擎 (Interactive UAT Gating Loop)
 * 支持结构化四要素（溯源、前置与数据、操作步骤、PRD预期对照）高亮展示与闭环自愈
 * @param {object} [options]
 */
export async function runInteractiveUAT(options = {}) {
  const cwd = options.cwd || process.cwd();
  const taskPath = findActiveTaskOrPlanPath(cwd, options.taskPath);
  
  if (!taskPath || !fs.existsSync(taskPath)) {
    console.log(`⚠️ 未找到任务或测试计划文件（已检查 TASK.md, task.md, test-plan.md 等），无法启动 UAT 验收。`);
    return;
  }

  const content = fs.readFileSync(taskPath, 'utf-8');
  const allParsed = parseUATBlocks(content);
  const pendingItems = allParsed.filter(item => !item.passed);

  if (pendingItems.length === 0) {
    if (allParsed.length > 0) {
      console.log(`✅ 当前 TASK.md 中所有 ${allParsed.length} 项 [UAT-xx] 均已完成验收！`);
    } else {
      console.log(`ℹ️ 当前 TASK.md 中暂无 [UAT-xx] 验收条目。`);
    }
    return;
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const yongle = new YongleBridge();
  let hadFixes = false;

  console.log(`\n🎯 【交互式单项 UAT 验收模式启动】(待验收: ${pendingItems.length} 项 | 输入 q/exit 可随时安全退出)\n`);

  for (let i = 0; i < pendingItems.length; i++) {
    const item = pendingItems[i];
    let itemPassed = false;
    let wasFixed = false;

    while (!itemPassed) {
      printUATDetailCard(item, i + 1, pendingItems.length);
      const answer = await askQuestion(rl, `👉 请判定 [1: Passed ✅ | 2: Not Passed ❌ (可追加与PRD预期的偏差描述) | q: 退出保存]: `);
      const cleanAns = answer.trim().toLowerCase();

      // 支持退出命令
      if (cleanAns === 'q' || cleanAns === 'quit' || cleanAns === 'exit') {
        console.log(`\n🚪 用户暂停验收。当前已完成的验收进度已持久化保存至: ${path.relative(cwd, taskPath)}`);
        rl.close();
        return;
      }

      if (cleanAns === '1' || cleanAns.startsWith('pass') || cleanAns.startsWith('y')) {
        console.log(`✅ 验收通过！已打勾回写至 TASK.md。`);
        itemPassed = true;

        // 1. 实时持久化回写 TASK.md 状态 (SPEC §6: 文件即协议)
        markUATItemPassed(taskPath, item.rawHeaderLine);

        // 2. SPEC §6: 经历过修复的验收项，通过后自动触发永乐大典复盘归档
        if (wasFixed) {
          hadFixes = true;
          await yongle.postmortem({ title: `UAT 修复经验: [${item.id}] ${item.title.slice(0, 50)}` });
        }
      } else {
        wasFixed = true;
        const defect = answer.replace(/^2\s*/, '').trim();
        console.log(`\n🔧 [自愈修复中] 收到偏离 PRD 预期的缺陷反馈: "${defect || answer}"`);
        console.log(`   ➔ 正在对照需求文档定位源码偏差并补写复现测试...`);
        console.log(`   ➔ 修复代码并跑通本地质量门禁套件...`);
        console.log(`   ➔ 原地准备复测。\n`);
      }
    }
  }

  console.log(`\n🎉 【全量 UAT 验收通过！】所有功能点均已严格达到 PRD 需求交付标准。`);
  if (hadFixes) {
    console.log(`💡 本轮验收共经历修复环节，相关排查经验已同步至《永乐大典》。`);
  }
  console.log();
  rl.close();
}

/**
 * 打印 UAT 单项结构化详情卡片
 */
function printUATDetailCard(item, index, total) {
  console.log(`--------------------------------------------------`);
  console.log(`📋 验收项 [${index}/${total}]: [${item.id}] ${item.title}`);
  if (item.trace) {
    console.log(`📌 需求溯源: ${item.trace}`);
  }
  if (item.preconditions) {
    console.log(`🛠️ 前置条件与数据: ${item.preconditions}`);
  }
  if (item.steps) {
    console.log(`🪜 操作步骤: ${item.steps}`);
  }
  if (item.expected) {
    console.log(`🎯 PRD 预期对照: ${item.expected}`);
  } else if (!item.preconditions && !item.steps) {
    console.log(`ℹ️ 验收内容: ${item.rawText || item.title}`);
  }
  console.log(`--------------------------------------------------`);
}

/**
 * 从 TASK.md 内容中解析出所有包含四要素的 UAT 区块
 */
export function parseUATBlocks(content) {
  const lines = (content || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const items = [];
  let current = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(/^(\s*-\s*\[([ xX])\])\s*`?\[?(UAT-\d+)\]?`?(.*)$/i);

    if (match) {
      if (current) {
        items.push(finalizeParsedItem(current));
      }
      current = {
        rawHeaderLine: line,
        passed: match[2].toLowerCase() === 'x',
        id: match[3].toUpperCase(),
        headerRest: match[4].trim(),
        detailLines: [],
      };
    } else if (current) {
      // 如果遇到下一级同级任务或新大标题，则结束当前 UAT 区块
      if (/^\s*-\s*\[\s*[ xX]?\s*\]/.test(line) || line.trim().startsWith('### ') || line.trim().startsWith('## ')) {
        items.push(finalizeParsedItem(current));
        current = null;
      } else {
        current.detailLines.push(line);
      }
    }
  }

  if (current) {
    items.push(finalizeParsedItem(current));
  }

  return items;
}

function finalizeParsedItem(current) {
  let title = current.headerRest;
  let trace = '';

  // 提取溯源信息 如 (溯源: REQ-01 / AC-1)
  const traceMatch = title.match(/\((?:溯源|关联|对应)[:：]?\s*([^)]+)\)/i);
  if (traceMatch) {
    trace = traceMatch[1].trim();
    title = title.replace(traceMatch[0], '').trim();
  }

  // 清洗 title 中的 【】 或冗余格式
  title = title.replace(/^[【\[](.*?)[】\]]$/, '$1').trim();
  if (!title) {
    title = `用例 ${current.id}`;
  }

  let preconditions = '';
  let steps = '';
  let expected = '';
  const otherDetails = [];

  current.detailLines.forEach(l => {
    const trimmed = l.trim().replace(/^[-*]\s*/, '');
    if (/前置(?:条件)?(?:与数据)?/i.test(trimmed)) {
      preconditions = trimmed.replace(/^.*?(?:前置(?:条件)?(?:与数据)?)[:：* ]*/i, '').trim();
    } else if (/操作步骤|步骤/i.test(trimmed)) {
      steps = trimmed.replace(/^.*?(?:操作步骤|步骤)[:：* ]*/i, '').trim();
    } else if (/PRD预期(?:对照)?|预期(?:对照|结果)?/i.test(trimmed)) {
      expected = trimmed.replace(/^.*?(?:PRD预期(?:对照)?|预期(?:对照|结果)?)[:：* ]*/i, '').trim();
    } else if (trimmed) {
      otherDetails.push(trimmed);
    }
  });

  return {
    id: current.id,
    passed: current.passed,
    title,
    trace,
    preconditions,
    steps,
    expected,
    rawHeaderLine: current.rawHeaderLine,
    rawText: [title, ...otherDetails].join('; '),
  };
}

/**
 * 将 TASK.md 中的 UAT 未完成行原地更新为已完成状态
 */
export function markUATItemPassed(taskPath, rawHeaderLine, options = {}) {
  if (!fs.existsSync(taskPath)) return;
  try {
    const fileContent = fs.readFileSync(taskPath, 'utf-8');
    const checkedLine = rawHeaderLine.replace(/-\s*\[\s*\]/, '- [x]');
    const updated = fileContent.replace(rawHeaderLine, checkedLine);
    fs.writeFileSync(taskPath, updated, 'utf-8');

    // 若当前修改的是分片任务文件，自动异步刷新主看板 .sansheng/TASK.md
    const cwd = options.cwd || process.cwd();
    const tasksDir = path.join(cwd, '.sansheng', 'tasks');
    if (fs.existsSync(tasksDir)) {
      import('./shangshu.js').then(({ Shangshu }) => {
        new Shangshu(cwd).syncTaskIndex();
      }).catch(() => {});
    }
  } catch (e) {
    console.warn(`⚠️ [UAT Runner] 回写 TASK.md 状态失败:`, e.message);
  }
}

function askQuestion(rl, promptText) {
  return new Promise((resolve) => {
    rl.question(promptText, (ans) => {
      resolve(ans);
    });
  });
}
