import { Config } from './schema.js';
import { registerSanshengTools } from './dsh/index.js';

// ==========================================
// 1. DeepSeek Harness (dsh) / Cordis 插件核心四要素
// ==========================================

/** 插件唯一标识 (kebab-case) */
export const name = 'sansheng-liubu';

/** 依赖的 Cordis 服务声明 (只读元组) */
export const inject = ['tools', 'approval'];

/** 导出配置 Schema (供 DSH Web UI 表单渲染与配置校验) */
export { Config };

/**
 * 插件应用入口主函数 (在依赖服务就绪后被 Cordis IoC 容器激活)
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {any} config
 */
export function apply(ctx, config = {}) {
  // 1. 注册三省六部核心 Tool 工具集
  registerSanshengTools(ctx, config);

  // 2. 注册服务就绪生命周期
  if (ctx && typeof ctx.on === 'function') {
    ctx.on('ready', async () => {
      ctx.logger?.info?.(`[${name}] 🏛️ 三省六部工作流插件已激活 (架构师: ${config?.models?.architectTier || 'gemini-3.7-flash'}, 工兵: ${config?.models?.workerTier || 'deepseek-v3'})`);
    });

    // 3. 注册卸载/热重载自清理生命周期
    ctx.on('dispose', () => {
      ctx.logger?.info?.(`[${name}] 插件正在卸载，安全清理运行时作用域资源...`);
    });
  }
}

// ==========================================
// 2. 编程式 API 导出 (向下完全兼容 Node.js / CLI 脚本)
// ==========================================

export { Zhongshu } from './core/zhongshu.js';
export { Menxia } from './core/menxia.js';
export { Shangshu, executeArchive } from './core/shangshu.js';
export { runInteractiveUAT, parseUATBlocks, markUATItemPassed } from './core/uat-runner.js';
export { compileUATToHtml, exportUATHtml, serveUATHtml, watchUATHtml, findActiveTaskOrPlanPath } from './core/uat-html-compiler.js';
export { extractCodebaseMap, queryFocusedMap, parseCodeFile, buildCodebaseGraph, clearMapCache } from './tools/codebase-map.js';
export { LSPClient } from './tools/lsp-client.js';
export { SubagentAdapter } from './tools/subagent-adapter.js';
export { YongleBridge } from './tools/yongle-bridge.js';
export { checkYongleInstalled, promptAndInstallYongle } from './tools/yongle-installer.js';
export { CBMBridge } from './tools/cbm-bridge.js';
export { injectVSCodeEnhancements } from './tools/vscode-injector.js';
export { RuleSync } from './tools/rule-sync.js';
export { createAuditPlanTool } from './dsh/tools/audit-plan-tool.js';
export { runUpdate, upgradeNpmPackage, getLocalVersion, getRemoteVersion, compareVersions } from './core/updater.js';
