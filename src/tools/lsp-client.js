import { spawn } from 'child_process';

/**
 * 极简通用 LSP 客户端接口封装
 */
export class LSPClient {
  constructor(serverCommand, serverArgs = []) {
    this.serverCommand = serverCommand;
    this.serverArgs = serverArgs;
    this.process = null;
    this.msgId = 0;
    this.pendingRequests = new Map();
  }

  /**
   * 启动 LSP 进程
   */
  start() {
    try {
      this.process = spawn(this.serverCommand, this.serverArgs, {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let buffer = '';
      this.process.stdout.on('data', (chunk) => {
        buffer += chunk.toString();
        // 处理 Content-Length 头和 JSON-RPC 消息体
        while (buffer.includes('\r\n\r\n')) {
          const headerEnd = buffer.indexOf('\r\n\r\n');
          const header = buffer.slice(0, headerEnd);
          const match = header.match(/Content-Length: (\d+)/i);
          if (!match) break;
          const contentLength = parseInt(match[1], 10);
          const bodyStart = headerEnd + 4;
          if (buffer.length < bodyStart + contentLength) break;

          const body = buffer.slice(bodyStart, bodyStart + contentLength);
          buffer = buffer.slice(bodyStart + contentLength);
          this.handleMessage(JSON.parse(body));
        }
      });

      return true;
    } catch (err) {
      console.warn(`[LSP] 未能启动本地 LSP 服务: ${this.serverCommand}`, err.message);
      return false;
    }
  }

  sendRequest(method, params) {
    const id = ++this.msgId;
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      const json = JSON.stringify({ jsonrpc: '2.0', id, method, params });
      const message = `Content-Length: ${Buffer.byteLength(json, 'utf8')}\r\n\r\n${json}`;
      if (this.process && this.process.stdin.writable) {
        this.process.stdin.write(message);
      } else {
        reject(new Error('LSP 进程未连接'));
      }
    });
  }

  handleMessage(msg) {
    if (msg.id && this.pendingRequests.has(msg.id)) {
      const { resolve, reject } = this.pendingRequests.get(msg.id);
      this.pendingRequests.delete(msg.id);
      if (msg.error) reject(msg.error);
      else resolve(msg.result);
    }
  }

  /**
   * 0 Token 原生符号重命名
   */
  async renameSymbol(filePath, line, character, newName) {
    return this.sendRequest('textDocument/rename', {
      textDocument: { uri: `file://${filePath}` },
      position: { line, character },
      newName
    });
  }

  /**
   * 查找所有引用 (影响面分析)
   */
  async findReferences(filePath, line, character) {
    return this.sendRequest('textDocument/references', {
      textDocument: { uri: `file://${filePath}` },
      position: { line, character },
      context: { includeDeclaration: true }
    });
  }

  stop() {
    if (this.process) {
      this.process.kill();
    }
  }
}
