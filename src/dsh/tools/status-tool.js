import fs from 'fs';
import path from 'path';
import { defineTool } from '../compat.js';
import { Shangshu } from '../../core/shangshu.js';

export function createTaskStatusTool(config) {
  return defineTool({
    name: 'sansheng_task_status',
    description: '查看当前活跃阶段的 3 行 HUD 极简任务看板状态（支持 .sansheng/tasks/*.md 多任务分片池与 TASK.md 滑动窗口，<150行）。',
    permissionTier: 'read-only',
    riskLevel: 'low',
    parameters: {},
    output: {
      schema: {
        type: 'object',
        properties: {
          exists: { type: 'boolean' },
          filePath: { type: 'string' },
          isSharded: { type: 'boolean' },
          activeTaskId: { type: 'string' },
          totalTasks: { type: 'number' },
          completedTasks: { type: 'number' },
          lineCount: { type: 'number' },
          hudSummary: { type: 'string' },
        },
      },
      render: (args, val) => [
        {
          type: 'text',
          text: val.exists
            ? (val.isSharded
                ? `📦 [三省六部 HUD 分片看板 (${val.filePath})] 总分片: ${val.totalTasks}, 已完成: ${val.completedTasks}, 活跃任务: [${val.activeTaskId || '无'}]\n${val.hudSummary}`
                : `📦 [三省六部 HUD 任务状态 (${val.filePath})] 总数: ${val.totalTasks}, 已完成: ${val.completedTasks}, 活跃行数: ${val.lineCount}/150\n${val.hudSummary}`)
            : `⚠️ 当前未检测到活跃的 TASK.md 或任务分片。请直接在对话框输入需求开启中书省 ALIGN 对齐。`,
        },
      ],
    },
    async execute(args = {}) {
      const cwd = args.cwd || config?.cwd || process.cwd();
      const shangshu = new Shangshu(cwd);

      if (shangshu.isShardedMode()) {
        const tasks = shangshu.listTasks();
        const activeTaskId = shangshu.getActiveTaskId();
        const completed = tasks.filter(t => t.completed).length;
        const hudList = tasks.slice(0, 10).map(t => {
          const mark = t.completed ? 'x' : ' ';
          const activeMark = t.isActive ? ' 🔥 [活跃]' : (t.completed ? ' ✅' : '');
          return `  - [${mark}] [${t.id}] ${t.title}${activeMark}`;
        }).join('\n');

        const hudSummary = hudList + (tasks.length > 10 ? `\n  ... 还有 ${tasks.length - 10} 个任务分片` : '');
        const relPath = path.relative(cwd, shangshu.taskPath) || '.sansheng/TASK.md';

        return {
          exists: true,
          filePath: relPath,
          isSharded: true,
          activeTaskId: activeTaskId || (tasks[0]?.id || ''),
          totalTasks: tasks.length,
          completedTasks: completed,
          lineCount: fs.existsSync(shangshu.taskPath) ? fs.readFileSync(shangshu.taskPath, 'utf-8').split('\n').length : 0,
          hudSummary,
        };
      }

      // 单文件模式兜底 (向下完全兼容)
      const sanshengTask = path.join(cwd, '.sansheng', 'TASK.md');
      const rootTask = path.join(cwd, 'TASK.md');
      const taskPath = fs.existsSync(sanshengTask) ? sanshengTask : (fs.existsSync(rootTask) ? rootTask : null);

      if (!taskPath) {
        return {
          exists: false,
          filePath: '',
          isSharded: false,
          activeTaskId: '',
          totalTasks: 0,
          completedTasks: 0,
          lineCount: 0,
          hudSummary: '未找到活跃 TASK.md',
        };
      }

      const content = fs.readFileSync(taskPath, 'utf-8');
      const lines = content.split('\n');
      const taskLines = lines.filter(l => l.trim().startsWith('- [ ]') || l.trim().startsWith('- [x]'));
      const completed = taskLines.filter(l => l.trim().startsWith('- [x]')).length;

      const hudSummary = taskLines.slice(0, 10).map(l => `  ${l.trim()}`).join('\n');

      return {
        exists: true,
        filePath: path.relative(cwd, taskPath),
        isSharded: false,
        activeTaskId: '',
        totalTasks: taskLines.length,
        completedTasks: completed,
        lineCount: lines.length,
        hudSummary: hudSummary + (taskLines.length > 10 ? `\n  ... 还有 ${taskLines.length - 10} 项` : ''),
      };
    },
  });
}
