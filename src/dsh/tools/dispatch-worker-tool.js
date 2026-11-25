import { defineTool } from '../compat.js';
import { SubagentAdapter } from '../../tools/subagent-adapter.js';

export function createDispatchWorkerTool(ctx, config) {
  return defineTool({
    name: 'sansheng_dispatch_worker',
    description: '【尚书省与六部】派生纯净上下文的独立工兵执行单项 Task，支持同步执行 (sync) 与全双工异步调度 (start / status / stop)。',
    permissionTier: 'dangerous',
    riskLevel: 'high',
    parameters: {
      action: {
        type: 'string',
        required: false,
        default: 'sync',
        description: '调度动作: "sync" (默认同步阻塞) | "start" (异步启动并立即返回 jobId) | "status" (查询异步 Job 状态) | "stop" (终止异步 Job)',
      },
      jobId: {
        type: 'string',
        required: false,
        description: '异步任务标识 (action 为 status 或 stop 时使用；status 省略则列出全部 Job)',
      },
      taskId: {
        type: 'string',
        required: false,
        description: '可选任务编号，如 "TASK-01" 或 "REQ-01"（省略时自动生成唯一编号）',
      },
      taskTitle: {
        type: 'string',
        required: false,
        description: '任务简要标题与目标（省略时自动从 testCmd / description 推导或使用默认标题）',
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
      testCmd: {
        type: 'string',
        required: false,
        description: '可选的工兵自测门禁命令，例如 "npm test"',
      },
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          action: { type: 'string' },
          taskId: { type: 'string' },
          jobId: { type: 'string' },
          status: { type: 'string' },
          modelUsed: { type: 'string' },
          jobs: { type: 'array' },
          logTail: { type: 'string' },
          message: { type: 'string' },
        },
      },
      render: (args, val) => {
        const action = val.action || args.action || 'sync';
        if (action === 'start') {
          return [{
            type: 'text',
            text: val.success
              ? `🚀 [六部异步工兵已启动] Job: [${val.jobId}] | 任务: [${val.taskId}] | 模型: ${val.modelUsed}\n使用 action: "status", jobId: "${val.jobId}" 可随时查看进度，或 action: "stop" 终止。`
              : `⚠️ [六部异步工兵] 启动未执行: ${val.message}`,
          }];
        }
        if (action === 'status') {
          if (val.jobs) {
            const summary = val.jobs.length > 0
              ? val.jobs.slice(0, 10).map(j => `- [${j.jobId}] (${j.taskId}) ${j.status} | 模型: ${j.model}`).join('\n')
              : '当前无后台工兵记录。';
            return [{ type: 'text', text: `📊 [六部后台工兵看板] 共 ${val.jobs.length} 条记录：\n${summary}` }];
          }
          return [{
            type: 'text',
            text: val.success
              ? `📊 [Job ${val.jobId}] 状态: ${val.status} | 任务: [${val.taskId}]\n${val.logTail ? `最近日志:\n${val.logTail}` : '(暂无日志输出)'}`
              : `⚠️ ${val.message}`,
          }];
        }
        if (action === 'stop') {
          return [{ type: 'text', text: `🛑 [六部工兵控制] ${val.message}` }];
        }
        return [{
          type: 'text',
          text: val.success
            ? `👷 [六部工兵] 任务 [${val.taskId || args.taskId || 'TASK-AUTO'}] 执行完成并已通过本地自动化门禁 (使用模型: ${val.modelUsed})。`
            : `🚨 [六部工兵] 任务 [${val.taskId || args.taskId || 'TASK-AUTO'}] 执行失败: ${val.message}`,
        }];
      },
    },
    async execute(args = {}) {
      const action = args.action || 'sync';
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
      const adapter = new SubagentAdapter(adapterConfig, { cwd: args.cwd || config?.cwd || process.cwd() });

      // status 为纯只读观测，免高危审批
      if (action === 'status') {
        if (args.jobId) {
          const info = adapter.getJobStatus(args.jobId);
          return {
            success: info.found,
            action: 'status',
            jobId: args.jobId,
            taskId: info.taskId || '',
            status: info.status || 'unknown',
            modelUsed: info.modelUsed || info.model || '',
            logTail: info.logTail || '',
            message: info.found ? `状态: ${info.status}` : info.message,
          };
        }
        const jobs = adapter.listJobs();
        return {
          success: true,
          action: 'status',
          jobs: jobs.map(j => ({
            jobId: j.jobId,
            taskId: j.taskId,
            status: j.status,
            model: j.modelUsed || j.model,
            updatedAt: j.updatedAt,
          })),
          message: `共查询到 ${jobs.length} 个后台 Job`,
        };
      }

      // 1. Fail-Closed 显式安全审批校验 (SPEC §15 / DSH Guide §7)
      if (ctx?.approval?.requestApproval) {
        const targetLabel = action === 'stop' ? (args.jobId || 'unknown-job') : `${args.taskId || 'TASK'} - ${args.taskTitle || ''}`;
        ctx.logger?.info?.(`[Security] 触发六部工兵高危操作审批 (${action}): ${targetLabel}`);
        const decision = await ctx.approval.requestApproval({
          actionType: 'agent/worker-execution',
          riskLevel: 'high',
          title: `【尚书省】申请六部工兵操作 (${action}): ${targetLabel}`,
          details: {
            action,
            jobId: args.jobId || '',
            taskId: args.taskId || '',
            taskTitle: args.taskTitle || '',
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
        ctx.logger?.info?.(`[Security] 审批通过，开始执行 (${action})...`);
      }

      if (action === 'stop') {
        if (!args.jobId) {
          return { success: false, action: 'stop', message: '终止后台工兵必须提供 jobId' };
        }
        const stopRes = adapter.stopJob(args.jobId);
        return {
          success: stopRes.stopped,
          action: 'stop',
          jobId: args.jobId,
          taskId: stopRes.taskId || '',
          status: stopRes.status || '',
          message: stopRes.message,
        };
      }

      if (!args.taskTitle && !args.testCmd && !args.description && !args.taskId && !(args.files && args.files.length > 0)) {
        throw new Error(`工兵调度 (${action}) 请至少提供 taskTitle、testCmd 或 description 之一`);
      }

      const resolvedTitle = args.taskTitle
        || (args.testCmd ? `执行: ${args.testCmd}` : '')
        || (args.description ? String(args.description).trim().slice(0, 60) : '')
        || args.taskId
        || '单任务执行';

      const task = {
        ...(args.taskId ? { id: args.taskId } : {}),
        title: resolvedTitle,
        files: args.files || [],
        description: args.description || '',
        ...(args.testCmd ? { testCmd: args.testCmd } : {}),
      };

      if (action === 'start') {
        const startRes = adapter.startJob(task);
        return {
          success: startRes.started,
          action: 'start',
          taskId: startRes.taskId,
          jobId: startRes.jobId || startRes.existingJobId || '',
          status: startRes.status,
          modelUsed: startRes.model || adapterConfig.models.worker_tier,
          message: startRes.message,
        };
      }

      // 默认 sync 同步阻塞模式 (向下完全兼容)
      const syncTaskId = args.taskId || `TASK-AUTO-${Date.now().toString(36).toUpperCase()}`;
      const result = await adapter.dispatchTask({ ...task, id: syncTaskId });
      return {
        success: result.success,
        action: 'sync',
        taskId: syncTaskId,
        status: result.success ? 'completed' : 'failed',
        modelUsed: result.modelUsed || config?.models?.workerTier || 'default',
        message: result.success ? '执行并通过测试' : (result.error || '执行异常'),
      };
    },
  });
}
