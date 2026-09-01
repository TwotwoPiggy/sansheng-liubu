/**
 * DSH Tool 定义辅助兼容层 (基于 @deepseek-ai/dsh-tools defineTool)
 */

let dshDefineTool;
try {
  const dshToolsPkg = await import('@deepseek-ai/dsh-tools');
  dshDefineTool = dshToolsPkg.defineTool || dshToolsPkg.default?.defineTool;
} catch (_) {
  // 当在独立环境/单测 Mock 中运行时，提供标准包装
  dshDefineTool = (toolDef) => {
    return {
      ...toolDef,
      __isDshTool: true
    };
  };
}

export function defineTool(toolDef) {
  // 校验必须具备的 DSH 核心元数据
  if (!toolDef.name) throw new Error('Tool 必须包含 name');
  if (!toolDef.description) throw new Error(`Tool [${toolDef.name}] 必须包含 description`);
  if (!toolDef.permissionTier) throw new Error(`Tool [${toolDef.name}] 必须声明 permissionTier`);
  if (!toolDef.riskLevel) throw new Error(`Tool [${toolDef.name}] 必须声明 riskLevel`);
  if (typeof toolDef.execute !== 'function') throw new Error(`Tool [${toolDef.name}] 必须提供 execute 实现`);

  return dshDefineTool(toolDef);
}
