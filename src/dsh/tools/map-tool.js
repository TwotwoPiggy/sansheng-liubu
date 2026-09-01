import fs from 'fs';
import path from 'path';
import { defineTool } from '../compat.js';
import { extractCodebaseMap } from '../../tools/codebase-map.js';

export function createCodebaseMapTool(config) {
  return defineTool({
    name: 'sansheng_codebase_map',
    description: '扫描当前项目源码并提取 AST 符号骨架地图 (类/接口/方法签名/Props)，Token 压缩率 > 95%，用于中书省精准质询与依赖分析。',
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
        description: '是否自动将骨架持久化至 .sansheng/codebase_map.md',
      },
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          filePath: { type: 'string' },
          preview: { type: 'string' },
        },
      },
      render: (args, val) => [
        {
          type: 'text',
          text: `🗺️ [三省六部] AST 代码拓扑提取完成${val.filePath ? `，已保存至 ${val.filePath}` : ''}。\n${val.preview}`,
        },
      ],
    },
    async execute(args) {
      const cwd = process.cwd();
      const maxDepth = args.maxDepth ?? 4;
      const saveToFile = args.saveToFile ?? true;

      const mapContent = extractCodebaseMap(cwd, maxDepth);

      let filePath = '';
      if (saveToFile) {
        const sanshengDir = path.join(cwd, '.sansheng');
        if (!fs.existsSync(sanshengDir)) fs.mkdirSync(sanshengDir, { recursive: true });
        filePath = path.join(sanshengDir, 'codebase_map.md');
        fs.writeFileSync(filePath, mapContent, 'utf-8');
      }

      const previewLines = mapContent.split('\n').slice(0, 15).join('\n');
      return {
        success: true,
        filePath: filePath ? path.relative(cwd, filePath) : '',
        preview: previewLines + '\n...',
      };
    },
  });
}
