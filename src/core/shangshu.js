import fs from 'fs';
import path from 'path';
import { YongleBridge } from '../tools/yongle-bridge.js';

/**
 * 尚书省 (Shangshu) - 掌管执行与状态统领 (RUN 与归档阶段)
 * 职责: TASK.md 滑动窗口限制 (<150行)、分片轮转、两级归档
 */

export class Shangshu {
  constructor(cwd = process.cwd()) {
    this.cwd = cwd;
    const sanshengDir = path.join(cwd, '.sansheng');
    
    // 优先读取 .sansheng/TASK.md，向下兼容根目录 TASK.md
    const sanshengTask = path.join(sanshengDir, 'TASK.md');
    const rootTask = path.join(cwd, 'TASK.md');
    this.taskPath = fs.existsSync(sanshengTask) ? sanshengTask : (fs.existsSync(rootTask) ? rootTask : sanshengTask);

    // 优先读取 .sansheng/ROADMAP.md，向下兼容根目录 ROADMAP.md
    const sanshengRoadmap = path.join(sanshengDir, 'ROADMAP.md');
    const rootRoadmap = path.join(cwd, 'ROADMAP.md');
    this.roadmapPath = fs.existsSync(sanshengRoadmap) ? sanshengRoadmap : (fs.existsSync(rootRoadmap) ? rootRoadmap : sanshengRoadmap);

    this.archiveDir = path.join(sanshengDir, 'archive');
    this.sanshengDir = sanshengDir;
    this.yongle = new YongleBridge();
  }

  /**
   * 检查并确保 TASK.md 严格处于滑动窗口限制以内 (< 150 行)
   */
  enforceSlidingWindow(content) {
    const lines = content.split('\n');
    if (lines.length > 150) {
      console.warn(`⚠️ [尚书省警告] TASK.md 超过 150 行 (${lines.length} 行)，建议进行 Phase 切片归档以防上下文截断！`);
    }
    return lines.slice(0, 150).join('\n');
  }

  /**
   * 阶段滑动归档 (Phase Roll-over)
   */
  archivePhase(phaseName = 'current') {
    if (!fs.existsSync(this.archiveDir)) {
      fs.mkdirSync(this.archiveDir, { recursive: true });
    }

    if (fs.existsSync(this.taskPath)) {
      const timestamp = new Date().toISOString().slice(0, 10);
      const dest = path.join(this.archiveDir, `phase-${phaseName}-${timestamp}.md`);
      fs.copyFileSync(this.taskPath, dest);
      console.log(`📁 [尚书省归档] 当前阶段已安全归档至: ${path.relative(this.cwd, dest)}`);
    }
  }

  /**
   * 更新 ROADMAP.md：将当前活跃 Phase 标记为已完成 (SPEC §3)
   */
  markRoadmapPhaseComplete() {
    if (!fs.existsSync(this.roadmapPath)) return;
    try {
      let content = fs.readFileSync(this.roadmapPath, 'utf-8');
      const timestamp = new Date().toISOString().slice(0, 10);
      // 匹配第一个未完成且标记为活跃的 Phase 行
      const updated = content.replace(
        /- \[ \] (.+?)(?:\[(?:当前活跃|Active)\s*🔥\]|\`\[(?:当前活跃|Active)\s*🔥\]\`)/,
        `- [x] $1\`[COMPLETED ${timestamp} ✅]\``
      );
      if (updated !== content) {
        fs.writeFileSync(this.roadmapPath, updated, 'utf-8');
        console.log(`📋 [尚书省] 已在 ROADMAP.md 中标记当前阶段为完成。`);
      }
    } catch (_) {}
  }

  /**
   * 清理临时文件与缓存，确保代码仓库 100% 纯净 (SPEC §3)
   */
  cleanTemporaryFiles() {
    const tempFiles = ['codebase_map.md'];
    const tempDirs = ['cache'];
    let cleaned = 0;

    for (const f of tempFiles) {
      const p = path.join(this.sanshengDir, f);
      if (fs.existsSync(p)) {
        try { fs.unlinkSync(p); cleaned++; } catch (_) {}
      }
    }
    for (const d of tempDirs) {
      const p = path.join(this.sanshengDir, d);
      if (fs.existsSync(p)) {
        try { fs.rmSync(p, { recursive: true, force: true }); cleaned++; } catch (_) {}
      }
    }
    if (cleaned > 0) {
      console.log(`🧹 [尚书省纯净化] 已清理 ${cleaned} 个临时文件/目录，仓库恢复纯净。`);
    }
  }

  /**
   * 触发永乐大典同步 (SPEC §7)
   */
  syncToYongle() {
    console.log(`💡 正在检查《永乐大典》同步环境...`);
    this.yongle.syncKnowledge();
  }

  /**
   * 项目结项全量归档 (Milestone Close) (SPEC §3 完整实现)
   * 1. 归档 TASK.md → archive/
   * 2. 删除活跃 TASK.md
   * 3. 更新 ROADMAP.md 标记完成
   * 4. 清理临时文件恢复仓库纯净
   * 5. 触发永乐大典同步
   */
  closeMilestone() {
    // 1. 归档
    this.archivePhase('final');

    // 2. 清理活跃任务看板
    if (fs.existsSync(this.taskPath)) {
      try {
        fs.unlinkSync(this.taskPath);
        console.log(`🧹 [尚书省纯净化] 已安全清理当前活跃任务看板: ${path.relative(this.cwd, this.taskPath)}`);
      } catch (_) {}
    }

    // 3. 更新 ROADMAP.md
    this.markRoadmapPhaseComplete();

    // 4. 清理临时文件
    this.cleanTemporaryFiles();

    // 5. 触发永乐大典同步
    this.syncToYongle();

    console.log(`🎉 [尚书省结项] 项目开发全链路圆满完成！`);
  }
}

export function executeArchive() {
  const shangshu = new Shangshu();
  shangshu.closeMilestone();
}
