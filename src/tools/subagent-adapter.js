import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * 统一 Subagent 调度门面 (三省统领六部工兵)
 */
export class SubagentAdapter {
  constructor(config) {
    this.config = config || {
      models: {
        architect_tier: "gemini-3.7-flash",
        worker_tier: "deepseek-v3",
        fallback_tier: "gemini-3.7-flash"
      },
      escalation: { enabled: true, max_retries: 2 }
    };
  }

  /**
   * 派生纯净工兵执行单任务 (自动处理重试与弹性升配)
   */
  async dispatchTask(task) {
    let currentModel = this.config.models.worker_tier;
    let retryCount = 0;
    const maxRetries = this.config.escalation.max_retries || 2;

    while (retryCount <= maxRetries) {
      console.log(`👷 [六部工兵] 启动纯净上下文执行: ${task.title} (模型: ${currentModel})`);

      const success = await this.runHeadlessWorker(task, currentModel);
      if (success) {
        console.log(`✅ [六部工兵] 任务执行并通过测试: ${task.title}`);
        return { success: true, modelUsed: currentModel };
      }

      retryCount++;
      console.warn(`⚠️ [六部工兵] 任务自测失败，准备第 ${retryCount} 次自愈重试...`);

      if (retryCount >= maxRetries && this.config.escalation.enabled) {
        console.log(`🚨 [自愈升配] 工兵连续失败，正在召唤【三省旗舰大脑 (${this.config.models.fallback_tier})】介入救火...`);
        currentModel = this.config.models.fallback_tier;
      }
    }

    return { success: false, error: '达到最大重试次数' };
  }

  /**
   * 运行 Headless 独立子进程工兵
   */
  runHeadlessWorker(task, model) {
    return new Promise((resolve) => {
      const workerScript = fileURLToPath(new URL('../../bin/worker.js', import.meta.url));
      const child = spawn(process.execPath, [workerScript, '--task', JSON.stringify(task), '--model', model], {
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
}
