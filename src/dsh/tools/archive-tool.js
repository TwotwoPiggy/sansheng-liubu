import { defineTool } from '../compat.js';
import { Shangshu } from '../../core/shangshu.js';

export function createArchiveTool(config) {
  return defineTool({
    name: 'sansheng_archive',
    description: '触发两级归档协议：将当前阶段滑动归档至 .sansheng/archive/，或执行结项全量归档、清理临时文件并同步至《永乐大典》。',
    permissionTier: 'workspace-write',
    riskLevel: 'medium',
    parameters: {
      mode: {
        type: 'string',
        required: false,
        default: 'milestone',
        description: '归档模式: "milestone" (结项全量归档并纯净化仓库) | "phase" (仅当前阶段滑动切片归档)',
      },
      phaseName: {
        type: 'string',
        required: false,
        default: 'current',
        description: '阶段名称标识 (用于 phase 模式)',
      },
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          mode: { type: 'string' },
          message: { type: 'string' },
        },
      },
      render: (args, val) => [
        {
          type: 'text',
          text: `📁 [尚书省归档] ${val.message}`,
        },
      ],
    },
    async execute(args) {
      const shangshu = new Shangshu();
      const mode = args.mode || 'milestone';

      if (mode === 'phase') {
        shangshu.archivePhase(args.phaseName || 'current');
        return {
          success: true,
          mode: 'phase',
          message: `阶段 [${args.phaseName || 'current'}] 已成功切片归档至 .sansheng/archive/。`,
        };
      } else {
        shangshu.closeMilestone();
        return {
          success: true,
          mode: 'milestone',
          message: '项目已完成结项全量归档！已更新总纲、清理临时状态板并同步至《永乐大典》。',
        };
      }
    },
  });
}
