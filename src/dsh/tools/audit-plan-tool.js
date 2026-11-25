import fs from 'fs';
import path from 'path';
import { defineTool } from '../compat.js';
import { Menxia } from '../../core/menxia.js';

export function createAuditPlanTool(config) {
  const menxia = new Menxia();

  return defineTool({
    name: 'sansheng_audit_plan',
    description: '门下省门禁：对开发计划 Plan 进行 100% 反向需求对账审计，检测遗漏项并生成《封驳差额单》或放行证书。',
    permissionTier: 'read-only',
    riskLevel: 'low',
    parameters: {
      type: 'object',
      properties: {
        requirements: {
          type: 'string',
          description: '原始原子需求清单 [REQ-xx] 或 PRD 需求文本。若留空则自动从 TASK.md 的 ALIGN 章节提取。',
        },
        plan: {
          type: 'string',
          description: '候选开发计划 Markdown。若留空则自动读取 .sansheng/TASK.md 或 TASK.md。',
        },
      },
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          passed: { type: 'boolean' },
          rate: { type: 'string' },
          totalReqs: { type: 'number' },
          coveredReqs: { type: 'number' },
          uncoveredReqs: { type: 'array', items: { type: 'string' } },
          report: { type: 'string' },
        },
      },
      render: (args, val) => [
        {
          type: 'text',
          text: val.report,
        },
      ],
    },
    async execute({ requirements = '', plan = '', cwd: argCwd } = {}) {
      const cwd = argCwd || config?.cwd || process.cwd();
      let planContent = plan;

      // 若未提供 plan，尝试从活跃 TASK.md 中读取
      if (!planContent) {
        const sanshengTask = path.join(cwd, '.sansheng', 'TASK.md');
        const rootTask = path.join(cwd, 'TASK.md');
        const taskPath = fs.existsSync(sanshengTask) ? sanshengTask : (fs.existsSync(rootTask) ? rootTask : null);
        if (taskPath) {
          planContent = fs.readFileSync(taskPath, 'utf-8');
        }
      }

      let reqsInput = requirements;
      // 若未显式传入 requirements，从 planContent 的需求章节尝试提取
      if (!reqsInput && planContent) {
        reqsInput = planContent;
      }

      const auditResult = menxia.auditPlan(reqsInput, planContent);
      const report = menxia.generateRejectionReport(auditResult);

      return {
        passed: auditResult.passed,
        rate: auditResult.rate,
        totalReqs: auditResult.totalReqs,
        coveredReqs: auditResult.coveredReqs,
        uncoveredReqs: auditResult.uncoveredReqs,
        report,
      };
    },
  });
}
