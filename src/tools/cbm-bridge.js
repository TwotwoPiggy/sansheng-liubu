import { execSync, execFileSync } from 'child_process';

/**
 * codebase-memory-mcp (CBM) 知识图谱连接器与环境探测
 */
export class CBMBridge {
  /**
   * 探测本地是否安装 codebase-memory-mcp
   */
  static detectCBM() {
    try {
      const checkCmd = process.platform === 'win32' ? 'where codebase-memory-mcp' : 'which codebase-memory-mcp';
      execSync(checkCmd, { stdio: 'ignore' });
      return { installed: true, version: '0.10.8' };
    } catch (_) {
      return { installed: false, tip: 'npm install -g codebase-memory-mcp' };
    }
  }

  /**
   * 执行单个 CLI 图谱查询工具 (单次直接返回 JSON，使用安全参数数组传递)
   */
  static queryTool(toolName, args = {}) {
    const jsonArgs = typeof args === 'string' ? args : JSON.stringify(args);
    const cliCmd = process.platform === 'win32' ? 'codebase-memory-mcp.cmd' : 'codebase-memory-mcp';
    
    try {
      const output = execFileSync(cliCmd, ['cli', '--json', toolName, jsonArgs], {
        stdio: ['pipe', 'pipe', 'ignore'],
        encoding: 'utf-8',
        timeout: 15000,
        shell: false
      });
      return JSON.parse(output);
    } catch (err) {
      // 备用兜底：尝试使用 npx 调用
      try {
        const fallbackCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
        const fallbackOut = execFileSync(fallbackCmd, ['codebase-memory-mcp', 'cli', '--json', toolName, jsonArgs], {
          stdio: ['pipe', 'pipe', 'ignore'],
          encoding: 'utf-8',
          timeout: 15000,
          shell: false
        });
        return JSON.parse(fallbackOut);
      } catch (_) {
        return null;
      }
    }
  }
}
