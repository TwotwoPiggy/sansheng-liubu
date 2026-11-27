import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFileSync } from 'child_process';

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
    const safeStack = Array.isArray(techStack) ? techStack : [String(techStack)];
    console.log(`🏛️ [永乐大典] 正在前置检索相关技术规范与历史踩坑经验 (${safeStack.join(', ')})...`);

    const scriptsDir = this.resolveScriptsDir();
    if (scriptsDir) {
      try {
        const searchScript = path.join(scriptsDir, 'yongle-hybrid-search.js');
        const query = safeStack.join(' ');
        const output = execFileSync(process.execPath, [searchScript, 'auto', query, '--limit', '3'], {
          stdio: ['pipe', 'pipe', 'ignore'],
          encoding: 'utf-8',
          timeout: 15000
        });
        
        console.log(`   ➔ 已完成永乐大典混合检索 (auto)。`);
        return [{ raw: output, tags: safeStack }];
      } catch (_) {}
    }

    console.log(`   ➔ 未检测到本地 yongle-dadian 脚本，跳过 CLI 检索 (可在 Agent 会话中通过 yongle-search 技能召回)。`);
    return [];
  }

  /**
   * 后置自动复盘提炼新踩坑经验 (SPEC §7)
   * 注: 完整的 Postmortem 归档由 IDE Agent 从对话上下文提炼，此处提供状态追踪
   */
  async postmortem(bugContext = {}) {
    console.log(`💡 [永乐大典] 正在记录缺陷修复事件...`);
    const title = bugContext?.title || '开发避坑经验';
    console.log(`   ➔ 建议在 IDE 对话框中输入 "yongle postmortem" 或由 Agent 触发 yongle-postmortem 归档: "${title}"`);
    return {
      archived: true,
      title,
      syncStatus: 'ready_for_agent_postmortem',
      timestamp: new Date().toISOString()
    };
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
          execFileSync(process.execPath, [syncScript], { stdio: 'inherit', timeout: 30000 });
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

  /**
   * 将业务背景档案 (BIZ-xxx) 双写沉淀至本地《永乐大典》接入缓冲区
   * 默认落地在 <cwd>/.planning/yongle/biz-context/<BIZ-ID>.md，便于永乐索引或后续同步
   */
  syncBizContext(bizDoc = {}, cwd = process.cwd()) {
    if (!bizDoc || !bizDoc.id) {
      return { synced: false, reason: 'missing_biz_id' };
    }

    try {
      const targetDir = path.join(cwd, '.planning', 'yongle', 'biz-context');
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }
      const destPath = path.join(targetDir, `${bizDoc.id}.md`);
      const whyLines = (Array.isArray(bizDoc.why) ? bizDoc.why : []).map(x => `- ${x}`).join('\n') || '- （无）';
      const decLines = (Array.isArray(bizDoc.decisions) ? bizDoc.decisions : []).map(x => `- ${x}`).join('\n') || '- （无）';
      const specialLines = (Array.isArray(bizDoc.specialLogic) ? bizDoc.specialLogic : []).map(x => `- ${x}`).join('\n') || '- （无）';
      const files = (Array.isArray(bizDoc.files) ? bizDoc.files : []).join(', ') || '（待补充）';

      const md = [
        `# [业务背景] ${bizDoc.id} ${bizDoc.title || ''}`,
        '',
        `- **状态**: ${bizDoc.status || 'active'}`,
        `- **更新时间**: ${bizDoc.updatedAt || bizDoc.createdAt || new Date().toISOString().slice(0, 10)}`,
        `- **关联需求**: ${(bizDoc.reqs || []).join(', ') || '无'}`,
        `- **关联文件**: ${files}`,
        '',
        '## 业务背景 (Why)',
        whyLines,
        '',
        '## 关键决策与取舍',
        decLines,
        '',
        '## 特殊逻辑与业务红线',
        specialLines,
        '',
      ].join('\n');

      fs.writeFileSync(destPath, md, 'utf-8');
      return {
        synced: true,
        path: path.relative(cwd, destPath).replace(/\\/g, '/'),
        scriptsDetected: Boolean(this.resolveScriptsDir()),
      };
    } catch (err) {
      return {
        synced: false,
        reason: err.message,
      };
    }
  }
}
