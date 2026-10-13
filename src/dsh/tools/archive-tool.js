import { defineTool } from '../compat.js';
import { Shangshu } from '../../core/shangshu.js';

export function createArchiveTool(config) {
  return defineTool({
    name: 'sansheng_archive',
    description: '触发两级归档协议：将指定任务分片或当前阶段滑动归档至 .sansheng/archive/，或执行结项全量归档、清理临时文件并同步至《永乐大典》。',
    permissionTier: 'workspace-write',
    riskLevel: 'medium',
    parameters: {
      mode: {
        type: 'string',
        required: false,
        default: 'milestone',
        description: '归档模式: "milestone" (结项全量归档并纯净化仓库) | "phase" (仅当前阶段滑动切片归档) | "task" (归档单个独立任务分片)',
      },
      phaseName: {
        type: 'string',
        required: false,
        default: 'current',
        description: '阶段名称标识 (用于 phase 模式)',
      },
      taskId: {
        type: 'string',
        required: false,
        description: '任务编号 (用于 task 模式，如 "TASK-01")',
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

      if (mode === 'task') {
        const targetId = args.taskId || shangshu.getActiveTaskId();
        if (!targetId) {
          return {
            success: false,
            mode: 'task',
            message: '未指定 taskId，且当前未检测到活跃任务分片。',
          };
        }
        const ok = shangshu.archiveTask(targetId);
        return {
          success: ok,
          mode: 'task',
          message: ok
            ? `任务分片 [${targetId}] 已成功归档至 .sansheng/archive/tasks/。`
            : `未找到任务分片 [${targetId}]，归档失败。`,
        };
      } else if (mode === 'phase') {
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
          message: '项目已完成结项全量归档！已更新总纲、归档全部分片、清理临时状态板并同步至《永乐大典》。',
        };
      }
    },
  });
}
