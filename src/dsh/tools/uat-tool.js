import fs from 'fs';
import path from 'path';
import { defineTool } from '../compat.js';
import { YongleBridge } from '../../tools/yongle-bridge.js';
import { findActiveTaskOrPlanPath } from '../../core/uat-html-compiler.js';

export function createUatGateTool(config) {
  return defineTool({
    name: 'sansheng_uat_gate',
    description: '管理与断言三省六部 UAT 质量门禁清单 [UAT-xx]，支持列出验收项、判定通过与缺陷自愈记录。',
    permissionTier: 'workspace-write',
    riskLevel: 'medium',
    parameters: {
      action: {
        type: 'string',
        required: true,
        description: '操作类型: "list" (查询未验收项) | "pass" (判定指定项验收通过并打勾) | "defect" (记录缺陷并开启自愈修复)',
      },
      uatId: {
        type: 'string',
        required: false,
        description: '验收项编号或序号，如 "UAT-01" 或 "1"',
      },
      feedback: {
        type: 'string',
        required: false,
        description: '缺陷描述或验收反馈备注',
      },
      taskPath: {
        type: 'string',
        required: false,
        description: '自定义任务或测试计划路径 (如 test-plan.md)',
      },
      taskId: {
        type: 'string',
        required: false,
        description: '指定分片任务编号 (如 "TASK-01")',
      },
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          message: { type: 'string' },
          remainingUatCount: { type: 'number' },
          allPassed: { type: 'boolean' },
        },
      },
      render: (args, val) => [
        {
          type: 'text',
          text: `🎯 [UAT 门禁判定] ${val.message}${val.allPassed ? ' 🎉 本轮所有 UAT 验收项已 100% 达成交付标准！' : ''}`,
        },
      ],
    },
    async execute(args = {}) {
      const cwd = args.cwd || config?.cwd || process.cwd();
      const taskPath = findActiveTaskOrPlanPath(cwd, args.taskPath || args.taskId);

      if (!taskPath) {
        return { success: false, message: '未找到活跃 TASK.md 或 test-plan.md', remainingUatCount: 0, allPassed: false };
      }

      let content = fs.readFileSync(taskPath, 'utf-8');
      const lines = content.split('\n');

      if (args.action === 'list') {
        const { parseUATBlocks } = await import('../../core/uat-runner.js');
        const allItems = parseUATBlocks(content);
        const pending = allItems.filter(item => !item.passed);
        const detailList = pending.map(p => {
          let str = `  - [ ] [${p.id}] ${p.title}`;
          if (p.trace) str += ` (溯源: ${p.trace})`;
          if (p.expected) str += `\n      🎯 PRD预期: ${p.expected}`;
          return str;
        }).join('\n');

        return {
          success: true,
          message: `共 ${allItems.length} 个 UAT 验收项，剩余待验收: ${pending.length} 项。\n${detailList}`,
          remainingUatCount: pending.length,
          allPassed: pending.length === 0,
        };
      }

      if (args.action === 'pass' && args.uatId) {
        const { parseUATBlocks } = await import('../../core/uat-runner.js');
        const idRegex = new RegExp(`-\\s*\\[\\s*\\]\\s*.*?\\[?${args.uatId}\\]?`, 'i');
        let matched = false;
        const newLines = lines.map(line => {
          if (!matched && idRegex.test(line)) {
            matched = true;
            return line.replace(/-\s*\[\s*\]/, '- [x]');
          }
          return line;
        });

        if (matched) {
          const newContent = newLines.join('\n');
          fs.writeFileSync(taskPath, newContent, 'utf-8');
          const remaining = parseUATBlocks(newContent).filter(item => !item.passed).length;

          // 若配置了自动复盘且该项有修复反馈
          if (config?.yongleDadian?.autoPostmortemOnFix && args.feedback) {
            const yongle = new YongleBridge();
            await yongle.postmortem({ title: `UAT 验收修复经验 [${args.uatId}]: ${args.feedback.slice(0, 50)}` });
          }

          return {
            success: true,
            message: `已将 [${args.uatId}] 标记为已验收通过 ✅ (剩余待验: ${remaining})`,
            remainingUatCount: remaining,
            allPassed: remaining === 0,
          };
        } else {
          return {
            success: false,
            message: `未在 TASK.md 中找到未完成的 [${args.uatId}] 验收项`,
            remainingUatCount: parseUATBlocks(content).filter(item => !item.passed).length,
            allPassed: false,
          };
        }
      }

      if (args.action === 'defect') {
        return {
          success: true,
          message: `已记录 [${args.uatId || 'UAT'}] 缺陷反馈: "${args.feedback || '待修复'}"，请工兵针对该缺陷补齐测试并实施自愈修复。`,
          remainingUatCount: lines.filter(l => l.includes('[UAT-') && l.trim().startsWith('- [ ]')).length,
          allPassed: false,
        };
      }

      return { success: false, message: `未知 action: ${args.action}`, remainingUatCount: 0, allPassed: false };
    },
  });
}
