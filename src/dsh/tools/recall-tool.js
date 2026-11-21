import { defineTool } from '../compat.js';
import { recallById } from '../../core/recall.js';

export function createRecallTool(config) {
  return defineTool({
    name: 'sansheng_recall',
    description: '【Inline & Spill 链式召回】按唯一 ID (TASK-xx / REQ-xx / UAT-xx / JOB-xx / ARCHIVE) 按需展开被 Spill 的完整上下文，支持 offset/limit 分页续读并内联下一跳关联指针。',
    permissionTier: 'read-only',
    riskLevel: 'low',
    parameters: {
      id: {
        type: 'string',
        required: true,
        description: '目标对象唯一标识，如 "TASK-01"、"REQ-02"、"UAT-01"、"JOB-xxx"、"ARCHIVE" 或 "ARCHIVE/tasks/xxx.md"',
      },
      offset: {
        type: 'number',
        required: false,
        default: 0,
        description: '分页续读起始字符偏移量 (默认 0)',
      },
      limit: {
        type: 'number',
        required: false,
        default: 2000,
        description: '单次返回最大字符预算 (默认 2000，防止撑爆上下文窗口)',
      },
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          found: { type: 'boolean' },
          id: { type: 'string' },
          type: { type: 'string' },
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
          return [{ type: 'text', text: `⚠️ [链式召回] ${val.message || '未找到指定对象'}` }];
        }
        const relatedLines = (val.related || []).length > 0
          ? `\n\n🔗 **下一跳关联指针 (Chain of Recall)**:\n` + val.related.map(r => `- \`${r.id}\` (${r.type}): ${r.summary}`).join('\n')
          : '';
        const pageHint = val.truncated
          ? `\n\n📄 *已截断 (当前 ${val.offset}~${val.offset + val.content.length} / 共 ${val.totalLength} 字符)，传入 \`offset: ${val.nextOffset}\` 可续读。*`
          : '';
        return [{
          type: 'text',
          text: `🔍 [链式召回: ${val.id}] (${val.type} | 来源: ${val.source})\n\n${val.content}${pageHint}${relatedLines}`,
        }];
      },
    },
    async execute(args = {}) {
      const cwd = config?.cwd || process.cwd();
      return recallById(args.id, {
        cwd,
        offset: args.offset ?? 0,
        limit: args.limit ?? 2000,
      });
    },
  });
}
