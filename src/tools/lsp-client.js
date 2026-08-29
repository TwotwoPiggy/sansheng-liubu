import { spawn, execSync } from 'child_process';
import path from 'path';

/**
 * 通用 LSP 语言服务器客户端 (深度适配 C# csharp-ls 与 Vue 3 Volar)
 */
export class LSPClient {
  constructor(serverCommand = 'csharp-ls', serverArgs = []) {
    this.serverCommand = serverCommand;
    this.serverArgs = serverArgs;
    this.process = null;
    this.msgId = 0;
    this.pendingRequests = new Map();
    this.diagnostics = new Map(); // 存储实时红波浪线报错
  }

  /**
   * 自动探测本地是否已安装语言服务器
   */
  static detectServer(lang = 'csharp') {
    const cmd = lang === 'csharp' ? 'csharp-ls' : 'vue-language-server';
    try {
      const checkCmd = process.platform === 'win32' ? `where ${cmd}` : `which ${cmd}`;
      execSync(checkCmd, { stdio: 'ignore' });
      return { installed: true, command: cmd };
    } catch (_) {
      return { installed: false, command: cmd, tip: lang === 'csharp' ? 'dotnet tool install -g csharp-ls' : 'npm install -g @vue/language-server' };
    }
  }

  /**
   * 启动 LSP 进程并监听 JSON-RPC
   */
  start() {
    try {
      this.process = spawn(this.serverCommand, this.serverArgs, {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let buffer = '';
      this.process.stdout.on('data', (chunk) => {
        buffer += chunk.toString();
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
      console.warn(`[LSP] 未能启动本地 LSP 服务 (${this.serverCommand}):`, err.message);
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
    if (msg.method === 'textDocument/publishDiagnostics') {
      // 实时接收语言服务器推送的语法与类型诊断红波浪线
      const { uri, diagnostics } = msg.params;
      this.diagnostics.set(uri, diagnostics);
    } else if (msg.id && this.pendingRequests.has(msg.id)) {
      const { resolve, reject } = this.pendingRequests.get(msg.id);
      this.pendingRequests.delete(msg.id);
      if (msg.error) reject(msg.error);
      else resolve(msg.result);
    }
  }

  /**
   * 1. 0-Token 跨文件原生符号重命名
   */
  async renameSymbol(filePath, line, character, newName) {
    return this.sendRequest('textDocument/rename', {
      textDocument: { uri: `file://${filePath}` },
      position: { line, character },
      newName
    });
  }

  /**
   * 2. 全工程查找所有引用 (影响面与爆炸半径分析)
   */
  async findReferences(filePath, line, character) {
    return this.sendRequest('textDocument/references', {
      textDocument: { uri: `file://${filePath}` },
      position: { line, character },
      context: { includeDeclaration: true }
    });
  }

  /**
   * 3. 0 毫秒秒级精准跳转定义 (Go to Definition)
   */
  async getDefinition(filePath, line, character) {
    return this.sendRequest('textDocument/definition', {
      textDocument: { uri: `file://${filePath}` },
      position: { line, character }
    });
  }

  /**
   * 4. 提取单文件层级符号大纲 (Document Symbols)
   */
  async getDocumentSymbols(filePath) {
    return this.sendRequest('textDocument/documentSymbol', {
      textDocument: { uri: `file://${filePath}` }
    });
  }

  /**
   * 5. 获取当前文件实时语法诊断报错 (秒级捕获类型错误)
   */
  getFileDiagnostics(filePath) {
    const uri = `file://${filePath}`;
    return this.diagnostics.get(uri) || [];
  }

  stop() {
    if (this.process) {
      this.process.kill();
    }
  }
}
