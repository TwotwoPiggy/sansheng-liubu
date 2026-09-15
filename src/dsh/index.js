import { createCodebaseMapTool } from './tools/map-tool.js';
import { createTaskStatusTool } from './tools/status-tool.js';
import { createUatGateTool } from './tools/uat-tool.js';
import { createArchiveTool } from './tools/archive-tool.js';
import { createSyncRulesTool } from './tools/sync-rules-tool.js';
import { createDispatchWorkerTool } from './tools/dispatch-worker-tool.js';
import { createAuditPlanTool } from './tools/audit-plan-tool.js';

/**
 * 注册三省六部全量 DSH 工具集至 Cordis 上下文
 */
export function registerSanshengTools(ctx, config) {
  if (!ctx || !ctx.tools || typeof ctx.tools.register !== 'function') {
    return [];
  }

  const tools = [
    createCodebaseMapTool(config),
    createTaskStatusTool(config),
    createAuditPlanTool(config),
    createUatGateTool(config),
    createArchiveTool(config),
    createSyncRulesTool(config),
    createDispatchWorkerTool(ctx, config),
  ];

  tools.forEach(tool => {
    ctx.tools.register(tool);
  });

  return tools;
}
