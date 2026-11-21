#!/usr/bin/env node

import fs from 'fs';
import { execSync } from 'child_process';

/**
 * 六部工兵 (Headless Worker) 独立执行进程 (SPEC §16)
 * 仅携带单个 Task 与目标源码文件，0 历史 Token 负担
 * 支持同步单次执行与异步 Job 持久化自愈升配模式
 */

const args = process.argv.slice(2);
let task = null;
let model = 'deepseek-v3';
let fallbackModel = null;
let maxRetries = 0;
let testCmd = null;
let jobFile = null;

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
  } else if (args[i] === '--fallback-model' && args[i + 1]) {
    fallbackModel = args[i + 1];
    i++;
  } else if (args[i] === '--max-retries' && args[i + 1]) {
    const parsed = parseInt(args[i + 1], 10);
    if (!Number.isNaN(parsed) && parsed >= 0) maxRetries = parsed;
    i++;
  } else if (args[i] === '--test-cmd' && args[i + 1]) {
    testCmd = args[i + 1];
    i++;
  } else if (args[i] === '--job-file' && args[i + 1]) {
    jobFile = args[i + 1];
    i++;
  }
}

function updateJobFile(patch) {
  if (!jobFile) return;
  try {
    let current = {};
    if (fs.existsSync(jobFile)) {
      current = JSON.parse(fs.readFileSync(jobFile, 'utf-8'));
    }
    const next = { ...current, ...patch, updatedAt: new Date().toISOString() };
    fs.writeFileSync(jobFile, JSON.stringify(next, null, 2), 'utf-8');
  } catch (_) {}
}

if (!task) {
  console.log(`[Worker] 未检测到有效任务载荷，已安全退出。`);
  updateJobFile({ status: 'completed', exitCode: 0, finishedAt: new Date().toISOString() });
  process.exit(0);
}

const taskId = task.id || 'TASK-WORKER';
const taskTitle = task.title || task.name || '单任务执行';
const cmdToRun = testCmd || task.testCmd;

let currentModel = model;
let retryCount = 0;

while (retryCount <= maxRetries) {
  console.log(`👷 [六部工兵启动] 任务: [${taskId}] ${taskTitle} | 执行模型: ${currentModel} (尝试 ${retryCount + 1}/${maxRetries + 1})`);
  updateJobFile({
    status: retryCount > 0 ? 'retrying' : 'running',
    model: currentModel,
    retryCount
  });

  if (!cmdToRun) {
    console.log(`✅ [六部工兵] 任务处理完成。`);
    updateJobFile({
      status: 'completed',
      exitCode: 0,
      modelUsed: currentModel,
      retryCount,
      finishedAt: new Date().toISOString()
    });
    process.exit(0);
  }

  console.log(`🧪 [工兵自测门禁] 正在运行测试命令: ${cmdToRun}`);
  try {
    execSync(cmdToRun, {
      stdio: ['ignore', 'inherit', 'inherit'],
      windowsHide: true
    });
    console.log(`✅ [工兵自测通过] 测试绿灯，任务交付。`);
    updateJobFile({
      status: 'completed',
      exitCode: 0,
      modelUsed: currentModel,
      retryCount,
      finishedAt: new Date().toISOString()
    });
    process.exit(0);
  } catch (err) {
    console.error(`❌ [工兵自测失败] 退出码非 0: ${err.message}`);
    retryCount++;
    if (retryCount <= maxRetries) {
      if (retryCount >= maxRetries && fallbackModel) {
        console.log(`🚨 [自愈升配] 工兵连续失败，正在切换至旗舰大脑 (${fallbackModel}) 重试...`);
        currentModel = fallbackModel;
      } else {
        console.warn(`⚠️ [六部工兵] 准备第 ${retryCount} 次自愈重试...`);
      }
      continue;
    }

    updateJobFile({
      status: 'failed',
      exitCode: typeof err.status === 'number' ? err.status : 1,
      error: err.message,
      modelUsed: currentModel,
      retryCount: retryCount - 1,
      finishedAt: new Date().toISOString()
    });
    process.exit(1);
  }
}
