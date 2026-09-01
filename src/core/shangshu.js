import fs from 'fs';
import path from 'path';

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
   * 项目结项全量归档 (Milestone Close)
   */
  closeMilestone() {
    this.archivePhase('final');
    if (fs.existsSync(this.taskPath)) {
      try {
        fs.unlinkSync(this.taskPath);
        console.log(`🧹 [尚书省纯净化] 已安全清理当前活跃任务看板: ${path.relative(this.cwd, this.taskPath)}`);
      } catch (_) {}
    }
    console.log(`🎉 [尚书省结项] 项目开发全链路圆满完成！`);
    console.log(`💡 正在触发《永乐大典》云端双向同步 (yongle-sync)...`);
  }
}

export function executeArchive() {
  const shangshu = new Shangshu();
  shangshu.closeMilestone();
}
