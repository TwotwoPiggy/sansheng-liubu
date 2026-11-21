import readline from 'readline';
import { registerSanshengTools } from '../dsh/index.js';
import { getLocalVersion } from '../core/updater.js';

/**
 * 将 DSH 工具的 parameters 定义转换为标准 MCP JSON Schema (inputSchema)
 */
function toJsonSchema(parameters = {}) {
  const properties = {};
  const required = [];

  for (const [key, def] of Object.entries(parameters || {})) {
    const prop = {
      type: def.type === 'array' ? 'array' : (def.type || 'string'),
      description: def.description || '',
    };
    if (def.items) prop.items = def.items;
    if (def.default !== undefined) prop.default = def.default;
    properties[key] = prop;

    if (def.required === true) {
      required.push(key);
    }
  }

  return {
    type: 'object',
    properties,
    ...(required.length > 0 ? { required } : {}),
  };
}

/**
 * 创建同源复用 DSH 工具集的轻量级 MCP Server 实例 (零第三方依赖)
 * @param {object} [config]
 */
export function createMcpServer(config = {}) {
  const registeredTools = [];
  const mockCtx = {
    tools: {
      register: (tool) => registeredTools.push(tool),
    },
    logger: {
      info: () => {},
      warn: () => {},
      debug: () => {},
      error: () => {},
    },
  };

  registerSanshengTools(mockCtx, config);
  const toolMap = new Map(registeredTools.map(t => [t.name, t]));

  /**
   * 处理单条 JSON-RPC 2.0 请求，返回响应对象 (通知类消息返回 null)
   */
  async function handleMessage(msg) {
    if (!msg || typeof msg !== 'object') {
      return {
        jsonrpc: '2.0',
        id: null,
        error: { code: -32600, message: 'Invalid Request' },
      };
    }

    const { id, method, params = {} } = msg;

    // 通知类消息（无 id）无需回包
    if (id === undefined || id === null) {
      return null;
    }

    try {
      if (method === 'initialize') {
        return {
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: params.protocolVersion || '2024-11-05',
            capabilities: { tools: {} },
            serverInfo: {
              name: 'sansheng-liubu',
              version: getLocalVersion(),
            },
          },
        };
      }

      if (method === 'ping') {
        return { jsonrpc: '2.0', id, result: {} };
      }

      if (method === 'tools/list') {
        return {
          jsonrpc: '2.0',
          id,
          result: {
            tools: registeredTools.map(t => ({
              name: t.name,
              description: t.description || '',
              inputSchema: toJsonSchema(t.parameters),
            })),
          },
        };
      }

      if (method === 'tools/call') {
        const toolName = params.name;
        const toolArgs = params.arguments || {};
        const tool = toolMap.get(toolName);
        if (!tool) {
          return {
            jsonrpc: '2.0',
            id,
            error: { code: -32602, message: `未知工具: ${toolName}` },
          };
        }

        const result = await tool.execute(toolArgs);
        let content;
        if (tool.output && typeof tool.output.render === 'function') {
          content = tool.output.render(toolArgs, result);
        } else {
          content = [{ type: 'text', text: JSON.stringify(result, null, 2) }];
        }

        return {
          jsonrpc: '2.0',
          id,
          result: {
            content,
            structuredContent: result,
            isError: false,
          },
        };
      }

      return {
        jsonrpc: '2.0',
        id,
        error: { code: -32601, message: `Method not found: ${method}` },
      };
    } catch (err) {
      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [{ type: 'text', text: `❌ 工具执行失败: ${err.message}` }],
          isError: true,
        },
      };
    }
  }

  return {
    tools: registeredTools,
    handleMessage,
  };
}

/**
 * 启动 stdio 模式 MCP Server (供 Antigravity / VS Code / Claude 等接入)
 */
export function startMcpServer(config = {}) {
  const server = createMcpServer(config);
  const rl = readline.createInterface({
    input: process.stdin,
    crlfDelay: Infinity,
  });

  rl.on('line', async (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    let msg;
    try {
      msg = JSON.parse(trimmed);
    } catch (err) {
      process.stdout.write(JSON.stringify({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32700, message: `Parse error: ${err.message}` },
      }) + '\n');
      return;
    }

    const reply = await server.handleMessage(msg);
    if (reply) {
      process.stdout.write(JSON.stringify(reply) + '\n');
    }
  });

  return server;
}
