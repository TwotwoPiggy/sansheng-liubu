import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';

/**
 * 永乐大典双向连接器 (Yongle Dadian Bridge)
 * 职责: 开工前前置静默召回、修复后即时复盘归档
 * 架构说明: 
 *   1. 永乐大典核心为 AI Agent 技能套件与 Node.js 检索/同步脚本 (位于 yongle-dadian/scripts/)
 *   2. 本模块优先定位本地 yongle-dadian 脚本执行直调 (hybrid-search / sync-knowledge)
 *   3. 在 IDE Agent 交互中，由 Agent 直接调用 yongle-search / yongle-postmortem / yongle-sync 技能
 */

export class YongleBridge {
  constructor() {
    this._scriptsDir = null; // 缓存定位到的 scripts 目录
  }

  /**
   * 探测永乐大典的 scripts 脚本目录路径
   */
  resolveScriptsDir() {
    if (this._scriptsDir) return this._scriptsDir;

    const candidates = [
      process.env.YONGLE_HOME ? path.join(process.env.YONGLE_HOME, 'scripts') : null,
      path.resolve(process.cwd(), '../yongle-dadian/scripts'),
      path.resolve(process.cwd(), '../../yongle-dadian/scripts'),
      path.join('D:', 'Computers', 'AIDevelop', 'Tools', 'Skills', 'yongle-dadian', 'scripts'),
      path.join(os.homedir(), '.gemini', 'antigravity', 'skills', 'yongle-dadian', 'scripts'),
      path.join(os.homedir(), '.gemini', 'config', 'plugins', 'yongle-plugin', 'scripts')
    ].filter(Boolean);

    for (const p of candidates) {
      if (fs.existsSync(p) && fs.existsSync(path.join(p, 'yongle-hybrid-search.js'))) {
        this._scriptsDir = p;
        return p;
      }
    }
    return null;
  }

  /**
   * 前置召回历史踩坑经验与团队规范 (SPEC §7)
   * 优先调用 yongle-hybrid-search.js 混合检索核心
   */
  async preRecall(techStack = ['dotnet', 'vue3']) {
    console.log(`🏛️ [永乐大典] 正在前置检索相关技术规范与历史踩坑经验 (${techStack.join(', ')})...`);

    const scriptsDir = this.resolveScriptsDir();
    if (scriptsDir) {
      try {
        const searchScript = path.join(scriptsDir, 'yongle-hybrid-search.js');
        const query = techStack.join(' ');
        const output = execSync(`node "${searchScript}" auto "${query}" --limit 3`, {
          stdio: 'pipe',
          encoding: 'utf-8',
          timeout: 15000
        });
        
        console.log(`   ➔ 已完成永乐大典混合检索 (auto)。`);
        return [{ raw: output, tags: techStack }];
      } catch (_) {}
    }

    console.log(`   ➔ 未检测到本地 yongle-dadian 脚本，跳过 CLI 检索 (可在 Agent 会话中通过 yongle-search 技能召回)。`);
    return [];
  }

  /**
   * 后置自动复盘提炼新踩坑经验 (SPEC §7)
   * 注: 完整的 Postmortem 归档由 IDE Agent 从对话上下文提炼，此处提供状态追踪
   */
  async postmortem(bugContext) {
    console.log(`💡 [永乐大典] 正在记录缺陷修复事件...`);
    const title = bugContext.title || '开发避坑经验';
    console.log(`   ➔ 建议在 IDE 对话框中输入 "yongle postmortem" 或由 Agent 触发 yongle-postmortem 归档: "${title}"`);
    return { archived: true, title, syncStatus: 'ready_for_agent_postmortem' };
  }

  /**
   * 触发知识库同步 (yongle-sync-knowledge.js)
   */
  syncKnowledge() {
    const scriptsDir = this.resolveScriptsDir();
    if (scriptsDir) {
      const syncScript = path.join(scriptsDir, 'yongle-sync-knowledge.js');
      if (fs.existsSync(syncScript)) {
        try {
          execSync(`node "${syncScript}"`, { stdio: 'inherit', timeout: 30000 });
          console.log(`✅ [永乐大典] 知识库同步已完成。`);
          return true;
        } catch (e) {
          console.warn(`⚠️ [永乐大典] 知识库同步遇到警告/跳过:`, e.message);
        }
      }
    }
    console.log(`ℹ️ [永乐大典] 未找到 yongle-sync-knowledge.js，可在 IDE 对话框中使用 yongle-sync 技能同步。`);
    return false;
  }
}
