import fs from 'fs';
import path from 'path';
import { spawn, execSync } from 'child_process';
import { fileURLToPath } from 'url';

/**
 * 统一 Subagent 调度门面 (三省统领六部工兵)
 * 支持同步阻塞执行 (dispatchTask) 与全双工异步后台执行 (startJob / getJobStatus / stopJob)
 */
export class SubagentAdapter {
  constructor(config = {}, options = {}) {
    this.config = config && Object.keys(config).length > 0 ? config : {
      models: {
        architect_tier: 'gemini-3.7-flash',
        worker_tier: 'deepseek-v3',
        fallback_tier: 'gemini-3.7-flash'
      },
      escalation: { enabled: true, max_retries: 2 }
    };
    this.cwd = options.cwd || process.cwd();
    this.jobsDir = path.join(this.cwd, '.sansheng', 'jobs');
  }

  /**
   * 确保持久化 Job 目录存在
   */
  ensureJobsDir() {
    if (!fs.existsSync(this.jobsDir)) {
      fs.mkdirSync(this.jobsDir, { recursive: true });
    }
    return this.jobsDir;
  }

  /**
   * 探测进程是否仍在存活
   */
  isProcessAlive(pid) {
    if (!pid || typeof pid !== 'number' || pid <= 0) return false;
    try {
      process.kill(pid, 0);
      return true;
    } catch (err) {
      // EPERM 表示进程存在但无权发信号，依然视作存活
      return err && err.code === 'EPERM';
    }
  }

  /**
   * 派生纯净工兵执行单任务 (同步阻塞模式，向下完全兼容)
   */
  async dispatchTask(task) {
    let currentModel = this.config.models?.worker_tier || 'deepseek-v3';
    let retryCount = 0;
    const maxRetries = this.config.escalation?.max_retries ?? 2;

    while (retryCount <= maxRetries) {
      console.log(`👷 [六部工兵] 启动纯净上下文执行: ${task.title} (模型: ${currentModel})`);

      const success = await this.runHeadlessWorker(task, currentModel);
      if (success) {
        console.log(`✅ [六部工兵] 任务执行并通过测试: ${task.title}`);
        return { success: true, modelUsed: currentModel };
      }

      retryCount++;
      console.warn(`⚠️ [六部工兵] 任务自测失败，准备第 ${retryCount} 次自愈重试...`);

      if (retryCount >= maxRetries && this.config.escalation?.enabled) {
        const fallback = this.config.models?.fallback_tier || 'gemini-3.7-flash';
        console.log(`🚨 [自愈升配] 工兵连续失败，正在召唤【三省旗舰大脑 (${fallback})】介入救火...`);
        currentModel = fallback;
      }
    }

    return { success: false, error: '达到最大重试次数' };
  }

  /**
   * 运行 Headless 独立子进程工兵 (同步等待)
   */
  runHeadlessWorker(task, model) {
    return new Promise((resolve) => {
      const workerScript = fileURLToPath(new URL('../../bin/worker.js', import.meta.url));
      const child = spawn(process.execPath, [workerScript, '--task', JSON.stringify(task), '--model', model], {
        cwd: this.cwd,
        stdio: 'inherit'
      });

      child.on('close', (code) => {
        resolve(code === 0);
      });
      child.on('error', () => {
        resolve(false);
      });
    });
  }

  /**
   * 全双工异步派生工兵 (立即返回 Started 与 jobId，不阻塞主会话)
   */
  startJob(task = {}, options = {}) {
    this.ensureJobsDir();
    const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const hasExplicitId = Boolean(task.id && String(task.id).trim());
    const taskId = hasExplicitId
      ? String(task.id).trim().toUpperCase()
      : `TASK-AUTO-${suffix.toUpperCase()}`;

    // 防重复重入：仅当显式指定 taskId 时，检查同任务是否已有活跃 running/retrying Job
    if (hasExplicitId) {
      const activeJobs = this.listJobs().filter(
        j => j.taskId === taskId && (j.status === 'running' || j.status === 'retrying')
      );
      if (activeJobs.length > 0 && !options.allowDuplicate) {
        return {
          started: false,
          conflict: true,
          existingJobId: activeJobs[0].jobId,
          taskId,
          status: activeJobs[0].status,
          message: `任务 [${taskId}] 已有活跃后台工兵 (${activeJobs[0].jobId}) 正在运行`
        };
      }
    }

    const safeTaskSlug = taskId.replace(/[^A-Z0-9_-]/gi, '-');
    const jobId = `JOB-${safeTaskSlug}-${suffix}`;
    const jobFile = path.join(this.jobsDir, `${jobId}.json`);
    const taskFile = path.join(this.jobsDir, `${jobId}.task.json`);
    const logPath = path.join(this.jobsDir, `${jobId}.log`);

    const workerModel = options.model || this.config.models?.worker_tier || 'deepseek-v3';
    const fallbackModel = this.config.escalation?.enabled !== false
      ? (this.config.models?.fallback_tier || 'gemini-3.7-flash')
      : '';
    const maxRetries = this.config.escalation?.max_retries ?? 2;

    const taskTitle = task.title || task.name || (task.testCmd ? `执行: ${task.testCmd}` : '单任务执行');
    const taskPayload = { ...task, id: taskId, title: taskTitle };
    fs.writeFileSync(taskFile, JSON.stringify(taskPayload, null, 2), 'utf-8');

    const now = new Date().toISOString();
    const initialJob = {
      jobId,
      taskId,
      taskTitle,
      status: 'running',
      pid: null,
      model: workerModel,
      fallbackModel,
      maxRetries,
      retryCount: 0,
      files: Array.isArray(task.files) ? task.files : [],
      logPath: path.relative(this.cwd, logPath),
      taskFile: path.relative(this.cwd, taskFile),
      startedAt: now,
      updatedAt: now
    };
    fs.writeFileSync(jobFile, JSON.stringify(initialJob, null, 2), 'utf-8');

    const workerScript = fileURLToPath(new URL('../../bin/worker.js', import.meta.url));
    const workerArgs = [
      workerScript,
      '--task-file', taskFile,
      '--job-file', jobFile,
      '--model', workerModel,
      '--max-retries', String(maxRetries)
    ];
    if (fallbackModel) {
      workerArgs.push('--fallback-model', fallbackModel);
    }

    const outFd = fs.openSync(logPath, 'a');
    let child;
    try {
      child = spawn(process.execPath, workerArgs, {
        cwd: this.cwd,
        detached: true,
        windowsHide: true,
        stdio: ['ignore', outFd, outFd]
      });
      child.unref();
    } finally {
      fs.closeSync(outFd);
    }

    initialJob.pid = child.pid || null;
    // 合并写回 pid，避免子进程极快退出时被父进程覆盖终态
    try {
      const latest = fs.existsSync(jobFile) ? JSON.parse(fs.readFileSync(jobFile, 'utf-8')) : {};
      const merged = { ...initialJob, ...latest, pid: initialJob.pid };
      fs.writeFileSync(jobFile, JSON.stringify(merged, null, 2), 'utf-8');
    } catch (_) {
      fs.writeFileSync(jobFile, JSON.stringify(initialJob, null, 2), 'utf-8');
    }

    return {
      started: true,
      jobId,
      taskId,
      pid: initialJob.pid,
      status: 'running',
      model: workerModel,
      logPath: initialJob.logPath,
      message: `已异步派生工兵 [${jobId}] 处理任务 [${taskId}]`
    };
  }

  /**
   * 查询单个异步 Job 状态并附带日志尾行摘要
   */
  getJobStatus(jobId, tailLines = 20) {
    if (!jobId) return { found: false, message: '缺少 jobId' };
    const cleanId = String(jobId).trim().replace(/\.json$/i, '');
    const jobFile = path.join(this.jobsDir, `${cleanId}.json`);
    if (!fs.existsSync(jobFile)) {
      return { found: false, jobId: cleanId, message: `未找到 Job [${cleanId}]` };
    }

    let job;
    try {
      job = JSON.parse(fs.readFileSync(jobFile, 'utf-8'));
    } catch (err) {
      return { found: false, jobId: cleanId, message: `Job 状态文件损坏: ${err.message}` };
    }

    // 存活校验：若记录为运行中但进程已退出，则修正为 failed
    if ((job.status === 'running' || job.status === 'retrying') && job.pid && !this.isProcessAlive(job.pid)) {
      job.status = 'failed';
      job.error = job.error || '后台进程已意外退出';
      job.finishedAt = job.finishedAt || new Date().toISOString();
      job.updatedAt = new Date().toISOString();
      try {
        fs.writeFileSync(jobFile, JSON.stringify(job, null, 2), 'utf-8');
      } catch (_) {}
    }

    const absLogPath = path.isAbsolute(job.logPath || '')
      ? job.logPath
      : path.join(this.cwd, job.logPath || path.join('.sansheng', 'jobs', `${cleanId}.log`));
    let logTail = '';
    if (fs.existsSync(absLogPath)) {
      try {
        const lines = fs.readFileSync(absLogPath, 'utf-8').replace(/\r\n/g, '\n').split('\n');
        logTail = lines.slice(-Math.max(1, tailLines)).join('\n').trim();
      } catch (_) {}
    }

    return {
      found: true,
      ...job,
      alive: job.pid ? this.isProcessAlive(job.pid) : false,
      logTail
    };
  }

  /**
   * 列出全部已记录的异步 Job (按更新时间倒序)
   */
  listJobs() {
    if (!fs.existsSync(this.jobsDir)) return [];
    let files = [];
    try {
      files = fs.readdirSync(this.jobsDir).filter(f => f.endsWith('.json') && !f.endsWith('.task.json'));
    } catch (_) {
      return [];
    }

    const jobs = [];
    for (const f of files) {
      const id = f.replace(/\.json$/i, '');
      const status = this.getJobStatus(id, 5);
      if (status.found) jobs.push(status);
    }

    return jobs.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
  }

  /**
   * 主动终止指定异步 Job (跨平台清理进程树)
   */
  stopJob(jobId) {
    const current = this.getJobStatus(jobId, 10);
    if (!current.found) {
      return { stopped: false, found: false, jobId, message: current.message };
    }

    if (current.status !== 'running' && current.status !== 'retrying') {
      return {
        stopped: false,
        found: true,
        alreadyFinished: true,
        jobId: current.jobId,
        status: current.status,
        message: `Job [${current.jobId}] 已处于终态 (${current.status})`
      };
    }

    if (current.pid && this.isProcessAlive(current.pid)) {
      try {
        if (process.platform === 'win32') {
          execSync(`taskkill /pid ${current.pid} /T /F`, { stdio: 'ignore', windowsHide: true });
        } else {
          try {
            process.kill(-current.pid, 'SIGTERM');
          } catch (_) {
            process.kill(current.pid, 'SIGKILL');
          }
        }
      } catch (_) {
        // 忽略竞态下进程刚好退出的异常
      }
    }

    const jobFile = path.join(this.jobsDir, `${current.jobId}.json`);
    const next = {
      ...current,
      status: 'stopped',
      finishedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    delete next.found;
    delete next.alive;
    delete next.logTail;

    fs.writeFileSync(jobFile, JSON.stringify(next, null, 2), 'utf-8');

    return {
      stopped: true,
      found: true,
      jobId: current.jobId,
      taskId: current.taskId,
      status: 'stopped',
      message: `已成功终止后台工兵 [${current.jobId}]`
    };
  }
}
