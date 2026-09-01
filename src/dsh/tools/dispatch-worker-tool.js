import { defineTool } from '../compat.js';
import { SubagentAdapter } from '../../tools/subagent-adapter.js';

export function createDispatchWorkerTool(ctx, config) {
  return defineTool({
    name: 'sansheng_dispatch_worker',
    description: '【尚书省与六部】派生纯净上下文的独立工兵执行单项 Task，自动运行单元测试门禁并在失败时启动自愈重试与模型升配。',
    permissionTier: 'dangerous',
    riskLevel: 'high',
    parameters: {
      taskId: {
        type: 'string',
        required: true,
        description: '任务编号，如 "TASK-01" 或 "REQ-01"',
      },
      taskTitle: {
        type: 'string',
        required: true,
        description: '任务简要标题与目标',
      },
      files: {
        type: 'array',
        items: { type: 'string' },
        required: false,
        default: [],
        description: '派生执行时仅携带的 1-2 个关键源码文件（物理压榨 Token）',
      },
      description: {
        type: 'string',
        required: false,
        description: '任务详细要求与挂载的 RULE 边界规则',
      },
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          taskId: { type: 'string' },
          modelUsed: { type: 'string' },
          message: { type: 'string' },
        },
      },
      render: (args, val) => [
        {
          type: 'text',
          text: val.success
            ? `👷 [六部工兵] 任务 [${args.taskId}] 执行完成并已通过本地自动化门禁 (使用模型: ${val.modelUsed})。`
            : `🚨 [六部工兵] 任务 [${args.taskId}] 执行失败: ${val.message}`,
        },
      ],
    },
    async execute(args) {
      // 1. Fail-Closed 显式安全审批校验 (SPEC §15 / DSH Guide §7)
      if (ctx?.approval?.requestApproval) {
        ctx.logger?.info?.(`[Security] 触发六部工兵高危执行审批: ${args.taskId}`);
        const decision = await ctx.approval.requestApproval({
          actionType: 'agent/worker-execution',
          riskLevel: 'high',
          title: `【尚书省】申请派生工兵执行任务: ${args.taskId} - ${args.taskTitle}`,
          details: {
            taskId: args.taskId,
            taskTitle: args.taskTitle,
            files: args.files || [],
            description: args.description || '',
            timestamp: new Date().toISOString(),
          },
          timeoutMs: 30000,
        });

        if (!decision || !decision.approved) {
          const reason = decision?.reason || '审批超时或用户手动拒绝';
          ctx.logger?.warn?.(`[Security] 工兵执行被拒绝: ${reason}`);
          throw new Error(`安全阻断：工兵执行未获授权 (${reason})`);
        }
        ctx.logger?.info?.(`[Security] 审批通过，开始调度工兵...`);
      }

      // 2. 调度 Subagent 执行
      const adapterConfig = {
        models: {
          architect_tier: config?.models?.architectTier || 'gemini-3.7-flash',
          worker_tier: config?.models?.workerTier || 'deepseek-v3',
          fallback_tier: config?.models?.fallbackTier || 'gemini-3.7-flash',
        },
        escalation: {
          enabled: true,
          max_retries: config?.escalationMaxRetries ?? 2,
        },
      };

      const adapter = new SubagentAdapter(adapterConfig);
      const task = {
        id: args.taskId,
        title: args.taskTitle,
        files: args.files || [],
        description: args.description || '',
      };

      const result = await adapter.dispatchTask(task);
      return {
        success: result.success,
        taskId: args.taskId,
        modelUsed: result.modelUsed || config?.models?.workerTier || 'default',
        message: result.success ? '执行并通过测试' : (result.error || '执行异常'),
      };
    },
  });
}
