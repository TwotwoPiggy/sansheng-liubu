import { defineTool } from '../compat.js';
import { RuleSync } from '../../tools/rule-sync.js';

export function createSyncRulesTool(config) {
  return defineTool({
    name: 'sansheng_sync_rules',
    description: '自动嗅探工作区中存在的各家 AI IDE 规则文件 (Trae / CatPaw / Qoder / Cursor / Windsurf / Claude)，并智能转译同步至统一的 .sansheng/rules/。',
    permissionTier: 'workspace-write',
    riskLevel: 'medium',
    parameters: {
      exportTarget: {
        type: 'string',
        required: false,
        description: '可选：反向导出至指定第三方 IDE 规则格式 (如 "trae", "catpaw", "qoder", "cursor", "copilot")',
      },
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          totalDetected: { type: 'number' },
          globalRules: { type: 'number' },
          instructionRules: { type: 'number' },
          promptRules: { type: 'number' },
          message: { type: 'string' },
        },
      },
      render: (args, val) => [
        {
          type: 'text',
          text: `🔄 [跨 IDE 规则同步] ${val.message}`,
        },
      ],
    },
    async execute(args = {}) {
      const cwd = args.cwd || config?.cwd || process.cwd();

      if (args.exportTarget) {
        RuleSync.exportToIDE(args.exportTarget, cwd);
        return {
          success: true,
          totalDetected: 0,
          globalRules: 0,
          instructionRules: 0,
          promptRules: 0,
          message: `已成功将规则反向导出至目标 IDE: ${args.exportTarget}`,
        };
      }

      const res = RuleSync.syncAll(cwd);
      return {
        success: true,
        totalDetected: res.totalDetected,
        globalRules: res.globalRules,
        instructionRules: res.instructionRules || 0,
        promptRules: res.promptRules,
        message: `检测到 ${res.totalDetected} 个外部规则源，已将 ${res.globalRules} 条全局规则、${res.instructionRules || 0} 条条件指令与 ${res.promptRules} 条 Prompt 规则归档并同步。`,
      };
    },
  });
}
