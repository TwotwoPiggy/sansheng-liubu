import type { Context } from '@deepseek-ai/cordis';
import type { Schema } from '@deepseek-ai/schemastery';

export interface SanshengConfig {
  models?: {
    architectTier?: string;
    workerTier?: string;
    fallbackTier?: string;
  };
  escalationMaxRetries?: number;
  codeIntelligence?: {
    lspEnabled?: boolean;
    cbmEnabled?: boolean;
  };
  yongleDadian?: {
    enabled?: boolean;
    autoRecallOnAlign?: boolean;
    autoPostmortemOnFix?: boolean;
  };
}

/** 插件唯一标识 */
export declare const name: string;

/** 依赖的 Cordis 服务声明 */
export declare const inject: readonly ['tools', 'approval'];

/** 配置 Schema */
export declare const Config: Schema<SanshengConfig>;

/** 插件激活主入口 */
export declare function apply(ctx: Context, config?: SanshengConfig): void;

export { Zhongshu } from './core/zhongshu.js';
export { Menxia } from './core/menxia.js';
export { Shangshu, executeArchive } from './core/shangshu.js';
export { runInteractiveUAT, parseUATBlocks, markUATItemPassed } from './core/uat-runner.js';
export { compileUATToHtml, exportUATHtml, serveUATHtml, watchUATHtml, findActiveTaskOrPlanPath } from './core/uat-html-compiler.js';
export { extractCodebaseMap } from './tools/codebase-map.js';
export { LSPClient } from './tools/lsp-client.js';
export { SubagentAdapter } from './tools/subagent-adapter.js';
export { YongleBridge } from './tools/yongle-bridge.js';
export { checkYongleInstalled, promptAndInstallYongle } from './tools/yongle-installer.js';
export { CBMBridge } from './tools/cbm-bridge.js';
export { injectVSCodeEnhancements } from './tools/vscode-injector.js';
export { syncGlobalSkills, collectBuiltinSkills, getRuntimeSkillTargets } from './tools/skill-injector.js';
export { RuleSync } from './tools/rule-sync.js';
export { createUpdateTool } from './dsh/tools/update-tool.js';
export {
  runUpdate,
  upgradeNpmPackage,
  upgradeGitPackage,
  detectInstallMode,
  parseUpdateOptions,
  getLocalVersion,
  getRemoteVersion,
  compareVersions,
} from './core/updater.js';

