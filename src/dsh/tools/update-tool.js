import { defineTool } from '../compat.js';
import { runUpdate } from '../../core/updater.js';

export function createUpdateTool(config = {}) {
  return defineTool({
    name: 'sansheng_update',
    description: '自动识别 Git/npm 安装模式检查并升级 sansheng-liubu 至最新版本（支持指定版本/Tag、失败回滚），并将最新 Skills 重注入全局 AI 运行时（Antigravity/Claude/Cursor/Trae 等）及当前工作区。',
    permissionTier: 'workspace-write',
    riskLevel: 'medium',
    parameters: {
      action: {
        type: 'string',
        required: false,
        default: 'update',
        description: '执行动作: "check" (仅检查版本) | "update" (检查并升级+同步技能与工作区) | "sync-skills" (跳过拉包，仅重注入全局 Skills 与工作区配置)',
      },
      targetVersion: {
        type: 'string',
        required: false,
        description: '可选：指定目标版本号、Git Tag 或分支名（如 "1.5.0"、"v1.5.0"、"main"）',
      },
      force: {
        type: 'boolean',
        required: false,
        default: false,
        description: '可选：强制执行覆盖升级/重装（默认 false）',
      },
      mode: {
        type: 'string',
        required: false,
        description: '可选：强制指定更新模式 "git" 或 "npm"（留空自动识别）',
      },
      skipSkills: {
        type: 'boolean',
        required: false,
        default: false,
        description: '可选：跳过全局 AI 运行时 Skills 重注入',
      },
      skipWorkspace: {
        type: 'boolean',
        required: false,
        default: false,
        description: '可选：跳过当前工作区配置与 IDE 规则同步',
      },
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          mode: { type: 'string' },
          checkOnly: { type: 'boolean' },
          previousVersion: { type: 'string' },
          currentVersion: { type: 'string' },
          pkgResult: { type: 'object' },
          skillsResult: { type: 'object' },
          workspaceSynced: { type: 'boolean' },
          message: { type: 'string' },
        },
      },
      render: (_args, val) => [
        {
          type: 'text',
          text: `🚀 [三省六部升级引擎 | ${val.mode}] ${val.message}`,
        },
      ],
    },
    async execute(args = {}) {
      const action = (args.action || 'update').toLowerCase();
      const cwd = args.cwd || config.cwd || process.cwd();

      const updateOpts = {
        cwd,
        silent: true,
        checkOnly: action === 'check',
        skipNpm: action === 'sync-skills',
        skipSkills: Boolean(args.skipSkills),
        skipWorkspace: Boolean(args.skipWorkspace),
        force: Boolean(args.force),
        targetVersion: args.targetVersion || undefined,
        mode: args.mode || undefined,
        ...(config.packageRoot ? { packageRoot: config.packageRoot } : {}),
        ...(config.homeDir ? { homeDir: config.homeDir } : {}),
      };

      const res = await runUpdate(updateOpts);
      const pkgStatus = res.pkgResult?.status || 'unknown';
      const skillsCount = res.skillsResult?.updatedRuntimes?.length || 0;
      const skillsNames = (res.skillsResult?.skills || []).join(', ');

      let message;
      if (action === 'check') {
        if (res.pkgResult?.hasNewerVersion) {
          message = `检测到新版本可用 (${res.pkgResult.latestInfo || `v${res.pkgResult.remoteVersion}`})，当前 v${res.currentVersion}。`;
        } else {
          message = `当前已是最新状态 (v${res.currentVersion} | 状态: ${pkgStatus})。`;
        }
      } else if (action === 'sync-skills') {
        message = `已完成技能与配置同步 (v${res.currentVersion})，已同步 ${skillsCount} 个全局 AI 运行时 [${skillsNames}]，工作区同步: ${res.workspaceSynced ? '已刷新' : '已跳过'}。`;
      } else if (!res.success) {
        message = `升级未完全成功 (状态: ${pkgStatus}${res.pkgResult?.error ? `, 原因: ${res.pkgResult.error}` : ''})。`;
      } else {
        message = `v${res.previousVersion} ➔ v${res.currentVersion} (包状态: ${pkgStatus})，已同步 ${skillsCount} 个全局运行时 [${skillsNames}]，工作区同步: ${res.workspaceSynced ? '已刷新' : '已跳过'}。`;
      }

      return {
        ...res,
        message,
      };
    },
  });
}
