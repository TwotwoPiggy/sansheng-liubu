import { execSync } from 'child_process';

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
   * 执行单个 CLI 图谱查询工具 (单次直接返回 JSON)
   */
  static queryTool(toolName, args = {}) {
    try {
      const jsonArgs = JSON.stringify(args).replace(/"/g, '\\"');
      const cmd = `codebase-memory-mcp cli --json ${toolName} "${jsonArgs}"`;
      const output = execSync(cmd, { stdio: 'pipe', encoding: 'utf-8' });
      return JSON.parse(output);
    } catch (err) {
      return null;
    }
  }
}
