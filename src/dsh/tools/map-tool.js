import fs from 'fs';
import path from 'path';
import { defineTool } from '../compat.js';
import { extractCodebaseMap, queryFocusedMap } from '../../tools/codebase-map.js';

export function createCodebaseMapTool(config) {
  return defineTool({
    name: 'sansheng_codebase_map',
    description: '扫描当前项目源码并提取 AST 符号骨架地图 (类/接口/方法签名/Props)，Token 压缩率 > 95%，支持双向拓扑与局部焦点切片，用于中书省精准质询与依赖分析。',
    permissionTier: 'workspace-read',
    riskLevel: 'low',
    parameters: {
      maxDepth: {
        type: 'number',
        required: false,
        default: 4,
        description: '递归扫描的最大目录深度，默认 4 层',
      },
      saveToFile: {
        type: 'boolean',
        required: false,
        default: true,
        description: '是否自动将骨架持久化至 .sansheng/codebase_map.md 与 .sansheng/codebase_index.json',
      },
      focus: {
        type: 'string',
        required: false,
        description: '可选，指定聚焦的目标文件相对路径。若指定，将动态提取其上下游邻居切片 (JIT Slice)',
      },
      budget: {
        type: 'number',
        required: false,
        default: 2000,
        description: '可选，聚焦切片的最大 Token 预算，默认 2000',
      },
      overviewOnly: {
        type: 'boolean',
        required: false,
        default: false,
        description: '可选，仅返回架构顶层模块概览与拓扑枢纽统计',
      },
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          filePath: { type: 'string' },
          preview: { type: 'string' },
          mode: { type: 'string' },
        },
      },
      render: (args, val) => [
        {
          type: 'text',
          text: `🗺️ [三省六部] AST 代码拓扑提取完成 (${val.mode || 'full'})${val.filePath ? `，已保存至 ${val.filePath}` : ''}。\n${val.preview}`,
        },
      ],
    },
    async execute(args = {}) {
      const cwd = args.cwd || config?.cwd || process.cwd();
      const maxDepth = args.maxDepth ?? 4;
      const saveToFile = args.saveToFile ?? true;
      const focus = args.focus;
      const budget = args.budget ?? 2000;
      const overviewOnly = args.overviewOnly ?? false;

      if (focus) {
        // 焦点切片模式
        const sliceContent = queryFocusedMap(cwd, focus, { budget });
        return {
          success: true,
          mode: 'focused_slice',
          filePath: '',
          preview: sliceContent,
        };
      }

      const mapContent = extractCodebaseMap(cwd, maxDepth);

      let filePath = '';
      if (saveToFile) {
        const sanshengDir = path.join(cwd, '.sansheng');
        if (!fs.existsSync(sanshengDir)) fs.mkdirSync(sanshengDir, { recursive: true });
        filePath = path.join(sanshengDir, 'codebase_map.md');
        fs.writeFileSync(filePath, mapContent, 'utf-8');
      }

      let preview = '';
      if (overviewOnly) {
        const overviewEnd = mapContent.indexOf('## 📦 模块分层与代码骨架');
        preview = overviewEnd > -1 ? mapContent.slice(0, overviewEnd).trim() : mapContent.split('\n').slice(0, 20).join('\n');
      } else {
        const previewLines = mapContent.split('\n').slice(0, 25).join('\n');
        preview = previewLines + '\n...';
      }

      return {
        success: true,
        mode: overviewOnly ? 'overview' : 'full',
        filePath: filePath ? path.relative(cwd, filePath) : '',
        preview,
      };
    },
  });
}
