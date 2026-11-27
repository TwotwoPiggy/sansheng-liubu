import { defineTool } from '../compat.js';
import {
  createBizContext,
  linkBizContext,
  listBizContexts,
  rebuildBizIndex,
  auditBizContext,
} from '../../core/biz-context.js';

export function createBizTool(config) {
  return defineTool({
    name: 'sansheng_biz',
    description: '【业务背景档案管理】创建永久业务背景卡 (BIZ-YYYYMMDD-xx)、绑定改动文件/符号/Commit、列出档案、0-Token 重建倒排索引，或审计源码幽灵 @biz 锚点与过期引用。',
    permissionTier: 'workspace-write',
    riskLevel: 'medium',
    parameters: {
      action: {
        type: 'string',
        required: true,
        enum: ['create', 'link', 'list', 'reindex', 'audit'],
        description: '操作类型: "create" (新建业务背景档案) | "link" (绑定文件/符号/提交) | "list" (列表检索) | "reindex" (重建倒排索引) | "audit" (防腐化审计)',
      },
      id: {
        type: 'string',
        required: false,
        description: '业务档案 ID（link 时必填，如 "BIZ-20261128-01"；create 时可选指定）',
      },
      title: {
        type: 'string',
        required: false,
        description: 'create 时使用：业务需求/背景标题',
      },
      why: {
        type: 'string',
        required: false,
        description: 'create/link 时使用：业务背景与触发动因（多条可用换行分隔）',
      },
      decisions: {
        type: 'string',
        required: false,
        description: 'create/link 时使用：关键决策与方案取舍（为何选A弃B，多条可用换行分隔）',
      },
      specialLogic: {
        type: 'string',
        required: false,
        description: 'create/link 时使用：代码特殊逻辑与业务红线说明（多条可用换行分隔）',
      },
      reqs: {
        type: 'array',
        items: { type: 'string' },
        required: false,
        description: '关联的原子需求编号列表，如 ["REQ-01", "REQ-02"]',
      },
      rules: {
        type: 'array',
        items: { type: 'string' },
        required: false,
        description: '关联的业务边界铁律编号列表，如 ["RULE-01"]',
      },
      files: {
        type: 'array',
        items: { type: 'string' },
        required: false,
        description: '关联的源码文件相对路径列表',
      },
      symbols: {
        type: 'array',
        items: { type: 'string' },
        required: false,
        description: '关联的函数/类符号名称列表',
      },
      commits: {
        type: 'array',
        items: { type: 'string' },
        required: false,
        description: '关联的 Git Commit 短哈希列表',
      },
      supersedes: {
        type: 'array',
        items: { type: 'string' },
        required: false,
        description: '纵向演化链：当前新口径替代的旧 BIZ ID 列表（旧档案将自动标记为 superseded）',
      },
      relatedBiz: {
        type: 'array',
        items: { type: 'string' },
        required: false,
        description: '横向关联的其他 BIZ ID 列表',
      },
      externalRef: {
        type: 'string',
        required: false,
        description: '外部需求单/工单号（如 JIRA-1234 / 飞书需求链接）',
      },
      fromGit: {
        type: 'boolean',
        required: false,
        default: false,
        description: 'create/link 时自动从当前 git diff 与最新提交采集变动文件',
      },
      syncToYongle: {
        type: 'boolean',
        required: false,
        description: 'create 时是否同步双写沉淀至《永乐大典》缓冲区（缺省读取项目配置）',
      },
      status: {
        type: 'string',
        required: false,
        description: 'list 过滤状态或 link 修改状态: "active" | "superseded" | "deprecated" | "all"',
      },
      query: {
        type: 'string',
        required: false,
        description: 'list 时按关键词过滤',
      },
      includeGit: {
        type: 'boolean',
        required: false,
        default: false,
        description: 'reindex 时是否同时扫描近期 Git Commit Trailer',
      },
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          action: { type: 'string' },
          id: { type: 'string' },
          filePath: { type: 'string' },
          stats: { type: 'object' },
          items: { type: 'array' },
          audit: { type: 'object' },
          message: { type: 'string' },
        },
      },
      render: (args, val) => {
        const action = val.action || args.action;
        if (action === 'list') {
          const items = val.items || [];
          if (items.length === 0) {
            return [{ type: 'text', text: '📚 当前尚无业务背景档案（可通过 `sansheng_biz({ action: "create", ... })` 创建）。' }];
          }
          const lines = items.map(i => `- \`[${i.id}]\` (${i.status}) **${i.title}** — ${i.summaryLine || '无摘要'} [文件: ${i.files.length}]`);
          return [{ type: 'text', text: `📚 [业务背景档案列表] 共 ${items.length} 条:\n${lines.join('\n')}` }];
        }
        if (action === 'audit') {
          const a = val.audit || {};
          const head = a.passed ? '✅ [业务溯源审计通过]' : '⚠️ [业务溯源审计发现异常]';
          const parts = [
            `${head} 档案: ${a.stats?.totalBiz ?? 0} (生效 ${a.stats?.activeBiz ?? 0}) | 源码锚点: ${a.stats?.totalAnchors ?? 0}`,
          ];
          if ((a.orphanAnchors || []).length > 0) {
            parts.push(`- ❌ 幽灵 @biz 锚点 (${a.orphanAnchors.length}): ` + a.orphanAnchors.map(x => `${x.file}:L${x.line}→${x.bizId}`).join(', '));
          }
          if ((a.supersededAnchors || []).length > 0) {
            parts.push(`- 🔄 指向已废止档案的锚点 (${a.supersededAnchors.length}): ` + a.supersededAnchors.map(x => `${x.file}:L${x.line}→${x.bizId}(新:${(x.supersededBy || []).join(',') || '?'})`).join(', '));
          }
          if ((a.missingFiles || []).length > 0) {
            parts.push(`- 📂 失联文件路径 (${a.missingFiles.length}): ` + a.missingFiles.map(x => `${x.bizId}:${x.file}`).join(', '));
          }
          if ((a.unlinkedActiveBiz || []).length > 0) {
            parts.push(`- 📌 尚未绑定代码的生效档案 (${a.unlinkedActiveBiz.length}): ` + a.unlinkedActiveBiz.map(x => x.id).join(', '));
          }
          return [{ type: 'text', text: parts.join('\n') }];
        }
        if (!val.success) {
          return [{ type: 'text', text: `⚠️ [业务档案 ${action}] ${val.message || '操作失败'}` }];
        }
        return [{ type: 'text', text: `🧭 [业务档案 ${action}] ${val.message || '执行成功'}` }];
      },
    },
    async execute(args = {}) {
      const cwd = args.cwd || config?.cwd || process.cwd();
      const action = String(args.action || 'list').toLowerCase();

      if (action === 'create') {
        const res = createBizContext(cwd, args);
        const supNote = (res.supersededUpdated || []).length > 0
          ? `，已自动将旧口径 [${res.supersededUpdated.join(', ')}] 标记为 superseded`
          : '';
        return {
          success: true,
          action: 'create',
          id: res.id,
          filePath: res.filePath,
          supersededUpdated: res.supersededUpdated,
          yongleResult: res.yongleResult,
          stats: res.stats,
          message: `已创建永久业务背景档案 [${res.id}] (${res.filePath})${supNote}。`,
        };
      }

      if (action === 'link') {
        if (!args.id) {
          return { success: false, action: 'link', message: '请提供要绑定的目标档案 id（如 BIZ-20261128-01）' };
        }
        const res = linkBizContext(cwd, args.id, args);
        return {
          ...res,
          action: 'link',
          message: res.success
            ? `已更新 [${res.id}] 关联坐标（文件 ${res.files.length} 个 / 符号 ${res.symbols.length} 个 / 提交 ${res.commits.length} 个）。`
            : res.message,
        };
      }

      if (action === 'reindex') {
        const idx = rebuildBizIndex(cwd, { includeGit: Boolean(args.includeGit) });
        return {
          success: true,
          action: 'reindex',
          stats: idx.stats,
          message: `已完成 0-Token 业务索引重建（档案 ${idx.stats.totalBiz} 条，源码锚点 ${idx.stats.totalAnchors} 处，关联文件 ${idx.stats.linkedFiles} 个）。`,
        };
      }

      if (action === 'audit') {
        const audit = auditBizContext(cwd);
        return {
          success: audit.passed,
          action: 'audit',
          audit,
          stats: audit.stats,
          message: audit.passed ? '业务溯源审计通过，0 幽灵引用，0 失联文件。' : '检测到幽灵引用或失联文件，请核查。',
        };
      }

      const items = listBizContexts(cwd, { status: args.status, query: args.query });
      return {
        success: true,
        action: 'list',
        items,
        message: `共检索到 ${items.length} 条业务背景档案。`,
      };
    },
  });
}
