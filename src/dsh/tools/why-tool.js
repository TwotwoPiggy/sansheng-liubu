import { defineTool } from '../compat.js';
import { queryWhy } from '../../core/biz-context.js';

export function createWhyTool(config) {
  return defineTool({
    name: 'sansheng_why',
    description: '【业务背景与特殊逻辑反查】输入文件路径、文件:行号、函数/类符号名、BIZ-YYYYMMDD-xx 或关键词，自动聚合源码 @biz/@why 锚点、永久业务背景档案与 Git Trailer 历史，支持可选调用链穿透 (chainDepth: 1..2) 与 Token 预算分页。',
    permissionTier: 'read-only',
    riskLevel: 'low',
    parameters: {
      target: {
        type: 'string',
        required: true,
        description: '查询目标，如 "src/Services/OrderService.cs:45"、"src/Services/OrderService.cs"、"ValidateTaxNo" 或 "BIZ-20261128-01"',
      },
      chainDepth: {
        type: 'number',
        required: false,
        default: 0,
        description: '可选：沿 codebase_index.json 双向依赖链穿透上下游业务红线的跳数（0=仅本文件, 1~2=含上下游调用链）',
      },
      includeGit: {
        type: 'boolean',
        required: false,
        default: true,
        description: '可选：是否附带只读 Git 提交历史与 Biz-Context Trailer（默认 true）',
      },
      offset: {
        type: 'number',
        required: false,
        default: 0,
        description: '分页续读起始字符偏移量（默认 0）',
      },
      limit: {
        type: 'number',
        required: false,
        default: 2400,
        description: '单次返回最大字符预算（默认 2400 ≈ 600 Token，防撑爆上下文）',
      },
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          found: { type: 'boolean' },
          mode: { type: 'string' },
          target: { type: 'string' },
          source: { type: 'string' },
          content: { type: 'string' },
          offset: { type: 'number' },
          totalLength: { type: 'number' },
          truncated: { type: 'boolean' },
          nextOffset: { type: ['number', 'null'] },
          related: { type: 'array' },
          message: { type: 'string' },
        },
      },
      render: (args, val) => {
        if (!val.found) {
          return [{ type: 'text', text: `⚠️ [业务溯源 why] ${val.message || '未检索到关联业务背景'}` }];
        }
        const relatedLines = (val.related || []).length > 0
          ? `\n\n🔗 **下一跳关联指针 (Chain of Recall)**:\n` + val.related.map(r => `- \`${r.id}\` (${r.type}): ${r.summary}`).join('\n')
          : '';
        const pageHint = val.truncated
          ? `\n\n📄 *已截断 (当前 ${val.offset}~${val.offset + val.content.length} / 共 ${val.totalLength} 字符)，传入 \`offset: ${val.nextOffset}\` 可续读。*`
          : '';
        return [{
          type: 'text',
          text: `${val.content}${pageHint}${relatedLines}`,
        }];
      },
    },
    async execute(args = {}) {
      const cwd = args.cwd || config?.cwd || process.cwd();
      return queryWhy(cwd, args.target, {
        chainDepth: args.chainDepth ?? 0,
        includeGit: args.includeGit ?? true,
        offset: args.offset ?? 0,
        limit: args.limit ?? 2400,
      });
    },
  });
}
