import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { SubagentAdapter, Shangshu, recallById, apply } from '../src/index.js';

describe('全双工异步工兵调度与 Inline/Spill 链式召回测试套件', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sansheng-async-recall-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (_) {}
  });

  it('1. SubagentAdapter.startJob 立即返回 Started，并持久化 Job 状态与日志', async () => {
    const adapter = new SubagentAdapter({}, { cwd: tmpDir });
    const startRes = adapter.startJob({
      id: 'TASK-01',
      title: '异步工兵测试任务',
      testCmd: `"${process.execPath}" -e "console.log('ASYNC_OK');"`
    });

    assert.strictEqual(startRes.started, true);
    assert.ok(startRes.jobId.startsWith('JOB-TASK-01-'));
    assert.strictEqual(startRes.status, 'running');
    assert.ok(startRes.pid > 0);

    // 轮询等待短暂进程自然完成
    let status = adapter.getJobStatus(startRes.jobId);
    const deadline = Date.now() + 5000;
    while (status.status === 'running' && Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 80));
      status = adapter.getJobStatus(startRes.jobId);
    }

    assert.strictEqual(status.found, true);
    assert.strictEqual(status.status, 'completed');
    assert.ok(status.logTail.includes('ASYNC_OK'));
  });

  it('2. 同一 taskId 防重复启动，且不同 taskId 支持并发异步运行与 stopJob 终止', async () => {
    const adapter = new SubagentAdapter({}, { cwd: tmpDir });
    const longCmd = `"${process.execPath}" -e "setTimeout(() => {}, 15000)"`;

    const j1 = adapter.startJob({ id: 'TASK-01', title: '长任务1', testCmd: longCmd });
    assert.strictEqual(j1.started, true);

    // 同一 taskId 再次启动应被拦截
    const j1Dup = adapter.startJob({ id: 'TASK-01', title: '长任务1重复', testCmd: longCmd });
    assert.strictEqual(j1Dup.started, false);
    assert.strictEqual(j1Dup.conflict, true);
    assert.strictEqual(j1Dup.existingJobId, j1.jobId);

    // 不同 taskId 可并发启动
    const j2 = adapter.startJob({ id: 'TASK-02', title: '长任务2', testCmd: longCmd });
    assert.strictEqual(j2.started, true);
    assert.strictEqual(adapter.listJobs().length, 2);

    // 主动终止两个后台进程
    const stop1 = adapter.stopJob(j1.jobId);
    const stop2 = adapter.stopJob(j2.jobId);
    assert.strictEqual(stop1.stopped, true);
    assert.strictEqual(stop2.stopped, true);
    assert.strictEqual(adapter.getJobStatus(j1.jobId).status, 'stopped');
  });

  it('3. sansheng_dispatch_worker 工具支持 action: start / status / stop 且 status 免高危审批', async () => {
    const tools = [];
    let approvalCount = 0;
    apply({
      tools: { register: t => tools.push(t) },
      approval: {
        requestApproval: async () => {
          approvalCount++;
          return { approved: true };
        }
      }
    }, { cwd: tmpDir });

    const workerTool = tools.find(t => t.name === 'sansheng_dispatch_worker');
    const longCmd = `"${process.execPath}" -e "setTimeout(() => {}, 10000)"`;

    const startOut = await workerTool.execute({
      action: 'start',
      taskId: 'TASK-09',
      taskTitle: 'DSH 异步测试',
      testCmd: longCmd
    });
    assert.strictEqual(startOut.success, true);
    assert.strictEqual(startOut.action, 'start');
    assert.strictEqual(approvalCount, 1);

    // status 不应触发审批
    const statusOut = await workerTool.execute({ action: 'status', jobId: startOut.jobId });
    assert.strictEqual(statusOut.success, true);
    assert.strictEqual(approvalCount, 1);

    // stop 触发审批并终止
    const stopOut = await workerTool.execute({ action: 'stop', jobId: startOut.jobId });
    assert.strictEqual(stopOut.success, true);
    assert.strictEqual(approvalCount, 2);
  });

  it('4. recallById 支持 TASK / REQ / UAT / JOB / ARCHIVE 五类对象与 Chain of Recall 下一跳指针', () => {
    const shangshu = new Shangshu(tmpDir);
    shangshu.createTaskSlice({
      id: 'TASK-01',
      title: '订单导出异步化',
      boundReqs: ['REQ-01'],
      rules: ['RULE-01 禁止阻塞主线程']
    }, {
      reqs: [{ id: 'REQ-01', title: '订单异步导出', acs: ['立即返回任务ID', '支持分页查询'] }]
    });

    const taskRecall = recallById('TASK-01', { cwd: tmpDir });
    assert.strictEqual(taskRecall.found, true);
    assert.strictEqual(taskRecall.type, 'TASK');
    assert.ok(taskRecall.content.includes('订单导出异步化'));
    assert.ok(taskRecall.related.some(r => r.id === 'REQ-01' && r.type === 'REQ'));
    assert.ok(taskRecall.related.some(r => r.id === 'UAT-01' && r.type === 'UAT'));

    const reqRecall = recallById('REQ-01', { cwd: tmpDir });
    assert.strictEqual(reqRecall.found, true);
    assert.strictEqual(reqRecall.type, 'REQ');
    assert.ok(reqRecall.content.includes('订单异步导出'));
    assert.ok(reqRecall.related.some(r => r.id === 'TASK-01'));

    const uatRecall = recallById('UAT-01', { cwd: tmpDir });
    assert.strictEqual(uatRecall.found, true);
    assert.strictEqual(uatRecall.type, 'UAT');
    assert.ok(uatRecall.related.some(r => r.id === 'REQ-01'));

    // 归档与 ARCHIVE 召回
    shangshu.archiveTask('TASK-01');
    const archiveIndex = recallById('ARCHIVE', { cwd: tmpDir });
    assert.strictEqual(archiveIndex.found, true);
    assert.ok(archiveIndex.related.length >= 1);

    const firstArchiveId = archiveIndex.related[0].id;
    const archiveDoc = recallById(firstArchiveId, { cwd: tmpDir });
    assert.strictEqual(archiveDoc.found, true);
    assert.ok(archiveDoc.content.includes('订单导出异步化'));
  });

  it('5. recallById 支持 Spill 分页续读 (offset/limit/nextOffset)、路径穿越拦截与缺失降级', () => {
    const archiveDir = path.join(tmpDir, '.sansheng', 'archive');
    fs.mkdirSync(archiveDir, { recursive: true });
    const longBody = 'A'.repeat(250) + 'B'.repeat(150);
    fs.writeFileSync(path.join(archiveDir, 'long.md'), longBody, 'utf-8');

    const page1 = recallById('ARCHIVE/long.md', { cwd: tmpDir, offset: 0, limit: 200 });
    assert.strictEqual(page1.found, true);
    assert.strictEqual(page1.truncated, true);
    assert.strictEqual(page1.content.length, 200);
    assert.strictEqual(page1.nextOffset, 200);

    const page2 = recallById('ARCHIVE/long.md', { cwd: tmpDir, offset: page1.nextOffset, limit: 200 });
    assert.strictEqual(page2.found, true);
    assert.strictEqual(page2.truncated, false);
    assert.strictEqual(page2.content.length, 200);
    assert.strictEqual(page1.content + page2.content, longBody);

    // 路径穿越安全拦截
    const traversal = recallById('ARCHIVE/../../etc/passwd', { cwd: tmpDir });
    assert.strictEqual(traversal.found, false);
    assert.ok(traversal.message.includes('安全阻断'));

    // 缺失对象优雅降级
    const missing = recallById('TASK-999', { cwd: tmpDir });
    assert.strictEqual(missing.found, false);
  });

  it('6. 省略 taskId 与 taskTitle 时自动生成唯一 TASK-AUTO 编号且支持并发启动', async () => {
    const adapter = new SubagentAdapter({}, { cwd: tmpDir });
    const longCmd = `"${process.execPath}" -e "setTimeout(() => {}, 10000)"`;

    const a1 = adapter.startJob({ testCmd: longCmd });
    const a2 = adapter.startJob({ title: '仅传标题任务', testCmd: longCmd });
    assert.strictEqual(a1.started, true);
    assert.strictEqual(a2.started, true);
    assert.ok(a1.taskId.startsWith('TASK-AUTO-'));
    assert.ok(a2.taskId.startsWith('TASK-AUTO-'));
    assert.notStrictEqual(a1.taskId, a2.taskId);

    const tools = [];
    apply({
      tools: { register: t => tools.push(t) },
      approval: { requestApproval: async () => ({ approved: true }) }
    }, { cwd: tmpDir });
    const workerTool = tools.find(t => t.name === 'sansheng_dispatch_worker');

    const mcpOut = await workerTool.execute({ action: 'start', testCmd: longCmd });
    assert.strictEqual(mcpOut.success, true);
    assert.ok(mcpOut.taskId.startsWith('TASK-AUTO-'));

    adapter.stopJob(a1.jobId);
    adapter.stopJob(a2.jobId);
    adapter.stopJob(mcpOut.jobId);
  });
});
