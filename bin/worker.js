#!/usr/bin/env node

import fs from 'fs';
import { execSync } from 'child_process';

/**
 * 六部工兵 (Headless Worker) 独立执行进程 (SPEC §16)
 * 仅携带单个 Task 与目标源码文件，0 历史 Token 负担
 */

const args = process.argv.slice(2);
let task = null;
let model = 'deepseek-v3';
let testCmd = null;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--task' && args[i + 1]) {
    try { task = JSON.parse(args[i + 1]); } catch (_) {}
    i++;
  } else if (args[i] === '--task-file' && args[i + 1]) {
    try {
      if (fs.existsSync(args[i + 1])) {
        task = JSON.parse(fs.readFileSync(args[i + 1], 'utf-8'));
      }
    } catch (_) {}
    i++;
  } else if (args[i] === '--model' && args[i + 1]) {
    model = args[i + 1];
    i++;
  } else if (args[i] === '--test-cmd' && args[i + 1]) {
    testCmd = args[i + 1];
    i++;
  }
}

if (!task) {
  console.log(`[Worker] 未检测到有效任务载荷，已安全退出。`);
  process.exit(0);
}

const taskId = task.id || 'TASK-WORKER';
const taskTitle = task.title || task.name || '单任务执行';
console.log(`👷 [六部工兵启动] 任务: [${taskId}] ${taskTitle} | 执行模型: ${model}`);

// 若指定了自测门禁命令，执行本地冒烟验证 (SPEC §16 & §17)
if (testCmd || task.testCmd) {
  const cmdToRun = testCmd || task.testCmd;
  console.log(`🧪 [工兵自测门禁] 正在运行测试命令: ${cmdToRun}`);
  try {
    execSync(cmdToRun, { stdio: 'inherit' });
    console.log(`✅ [工兵自测通过] 测试绿灯，任务交付。`);
    process.exit(0);
  } catch (err) {
    console.error(`❌ [工兵自测失败] 退出码非 0: ${err.message}`);
    process.exit(1); // 返回错误码以触发 SubagentAdapter 弹性升配
  }
} else {
  // 无附加验证命令时，标准执行完毕正常退出
  console.log(`✅ [六部工兵] 任务处理完成。`);
  process.exit(0);
}
