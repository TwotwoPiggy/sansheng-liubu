import { spawn, execSync } from 'child_process';
import path from 'path';
import { pathToFileURL, fileURLToPath } from 'url';

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
    this.initialized = false;
  }

  /**
   * 将本地文件路径规范化转换为符合 RFC 8089 的标准 file:// URI
   */
  static toURI(filePath) {
    if (!filePath) return '';
    if (filePath.startsWith('file://')) return filePath;
    return pathToFileURL(path.resolve(filePath)).href;
  }

  /**
   * 将 file:// URI 解析回本地文件系统绝对路径
   */
  static fromURI(uri) {
    if (!uri) return '';
    if (!uri.startsWith('file://')) return uri;
    try {
      return fileURLToPath(uri);
    } catch (_) {
      return uri.replace(/^file:\/\//, '');
    }
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
      if (this.process && this.process.stdin && this.process.stdin.writable) {
        this.process.stdin.write(message);
      } else {
        reject(new Error('LSP 进程未连接'));
      }
    });
  }

  sendNotification(method, params) {
    const json = JSON.stringify({ jsonrpc: '2.0', method, params });
    const message = `Content-Length: ${Buffer.byteLength(json, 'utf8')}\r\n\r\n${json}`;
    if (this.process && this.process.stdin && this.process.stdin.writable) {
      this.process.stdin.write(message);
    }
  }

  /**
   * 发送 LSP 标准 initialize 请求并发送 initialized 通知
   */
  async initialize(projectRoot = process.cwd()) {
    const rootUri = LSPClient.toURI(projectRoot);
    const result = await this.sendRequest('initialize', {
      processId: process.pid,
      rootUri,
      capabilities: {
        workspace: {
          applyEdit: true,
          workspaceEdit: { documentChanges: true }
        },
        textDocument: {
          synchronization: { dynamicRegistration: false, willSave: false, willSaveWaitUntil: false, didSave: true },
          completion: { dynamicRegistration: false, completionItem: { snippetSupport: true } },
          hover: { dynamicRegistration: false, contentFormat: ['markdown', 'plaintext'] },
          definition: { dynamicRegistration: false },
          references: { dynamicRegistration: false },
          documentSymbol: { dynamicRegistration: false },
          rename: { dynamicRegistration: false, prepareSupport: true }
        }
      }
    });
    this.sendNotification('initialized', {});
    this.initialized = true;
    return result;
  }

  /**
   * 发送 textDocument/didOpen 打开文档通知
   */
  openDocument(filePath, content = '', languageId = 'csharp') {
    const uri = LSPClient.toURI(filePath);
    this.sendNotification('textDocument/didOpen', {
      textDocument: {
        uri,
        languageId,
        version: 1,
        text: content
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
      textDocument: { uri: LSPClient.toURI(filePath) },
      position: { line, character },
      newName
    });
  }

  /**
   * 2. 全工程查找所有引用 (影响面与爆炸半径分析)
   */
  async findReferences(filePath, line, character) {
    return this.sendRequest('textDocument/references', {
      textDocument: { uri: LSPClient.toURI(filePath) },
      position: { line, character },
      context: { includeDeclaration: true }
    });
  }

  /**
   * 3. 0 毫秒秒级精准跳转定义 (Go to Definition)
   */
  async getDefinition(filePath, line, character) {
    return this.sendRequest('textDocument/definition', {
      textDocument: { uri: LSPClient.toURI(filePath) },
      position: { line, character }
    });
  }

  /**
   * 4. 提取单文件层级符号大纲 (Document Symbols)
   */
  async getDocumentSymbols(filePath) {
    return this.sendRequest('textDocument/documentSymbol', {
      textDocument: { uri: LSPClient.toURI(filePath) }
    });
  }

  /**
   * 5. 获取当前文件实时语法诊断报错 (秒级捕获类型错误)
   */
  getFileDiagnostics(filePath) {
    const uri = LSPClient.toURI(filePath);
    return this.diagnostics.get(uri) || [];
  }

  stop() {
    if (this.process) {
      try {
        this.sendNotification('exit', {});
        this.process.kill();
      } catch (_) {
        this.process.kill();
      }
    }
  }
}
