import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { Shangshu, Menxia, findActiveTaskOrPlanPath, markUATItemPassed } from '../src/index.js';
import { createTaskStatusTool } from '../src/dsh/tools/status-tool.js';
import { createArchiveTool } from '../src/dsh/tools/archive-tool.js';

describe('三省六部任务分片池架构测试套件 (Tasks Sharding & Multi-Task Isolation)', () => {
  it('1. isShardedMode 在无分片目录时返回 false，创建分片后正确识别为 true', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sansheng-shard-'));
    const shangshu = new Shangshu(tmpDir);

    assert.strictEqual(shangshu.isShardedMode(), false);

    // 创建分片
    shangshu.createTaskSlice({
      id: 'TASK-01',
      title: '订单列表流式导出',
      boundReqs: ['REQ-01'],
      rules: ['RULE-01'],
    });

    assert.strictEqual(shangshu.isShardedMode(), true);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('2. createTaskSlice 能够生成标准的独立任务分片文件并包含四要素 UAT', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sansheng-shard-'));
    const shangshu = new Shangshu(tmpDir);

    const taskPath = shangshu.createTaskSlice({
      id: 'TASK-01',
      title: '用户权限认证与脱敏',
      boundReqs: ['REQ-01', 'REQ-02'],
      rules: ['RULE-01'],
      testCommand: 'dotnet test --filter Category=Auth',
    }, {
      reqs: [
        { id: 'REQ-01', title: 'Token 鉴权', acs: ['携带有效 Token 正常访问'] },
        { id: 'REQ-02', title: '手机号脱敏', acs: ['中间四位星号脱敏'] }
      ],
      rules: [
        { id: 'RULE-01', content: '必须拦截无权请求' }
      ]
    });

    assert.ok(fs.existsSync(taskPath));
    const content = fs.readFileSync(taskPath, 'utf-8');

    assert.ok(content.includes('# 🎯 [TASK-01] 用户权限认证与脱敏'));
    assert.ok(content.includes('`[REQ-01]`'));
    assert.ok(content.includes('`[REQ-02]`'));
    assert.ok(content.includes('RULE-01'));
    assert.ok(content.includes('UAT-01'));
    assert.ok(content.includes('UAT-02'));
    assert.ok(content.includes('dotnet test --filter Category=Auth'));

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('3. listTasks 能够准确提取多任务分片元数据、完成状态与活跃指针', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sansheng-shard-'));
    const shangshu = new Shangshu(tmpDir);

    shangshu.createTaskSlice({ id: 'TASK-01', title: '用户登录', boundReqs: ['REQ-01'] });
    shangshu.createTaskSlice({ id: 'TASK-02', title: '订单导出', boundReqs: ['REQ-02'] });

    const tasks = shangshu.listTasks();
    assert.strictEqual(tasks.length, 2);
    assert.strictEqual(tasks[0].id, 'TASK-01');
    assert.strictEqual(tasks[1].id, 'TASK-02');
    assert.strictEqual(tasks[0].boundReqs[0], 'REQ-01');
    assert.strictEqual(tasks[1].boundReqs[0], 'REQ-02');

    // 默认第一个未完成任务为活跃
    assert.strictEqual(tasks[0].isActive, true);
    assert.strictEqual(tasks[1].isActive, false);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('4. setActiveTask 支持多任务无损切换并联动更新主看板高亮', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sansheng-shard-'));
    const shangshu = new Shangshu(tmpDir);

    shangshu.createTaskSlice({ id: 'TASK-01', title: '模块A' });
    shangshu.createTaskSlice({ id: 'TASK-02', title: '紧急P0修复' });

    // 切换到 TASK-02
    shangshu.setActiveTask('TASK-02');
    assert.strictEqual(shangshu.getActiveTaskId(), 'TASK-02');

    const tasks = shangshu.listTasks();
    const t2 = tasks.find(t => t.id === 'TASK-02');
    assert.strictEqual(t2.isActive, true);

    // 主看板中应高亮 TASK-02 为当前活跃
    const boardContent = fs.readFileSync(shangshu.taskPath, 'utf-8');
    assert.ok(boardContent.includes('当前活跃: `TASK-02`'));
    assert.ok(boardContent.includes('`[TASK-02]` 紧急P0修复') && boardContent.includes('🔥 `[当前活跃]`'));

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('5. 门下省 (Menxia) auditShardedPlan 能够对分片任务池进行 100% 需求对账与封驳', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sansheng-shard-'));
    const shangshu = new Shangshu(tmpDir);
    const menxia = new Menxia();

    shangshu.createTaskSlice({ id: 'TASK-01', title: '支付网关', boundReqs: ['REQ-01'] });

    const fullReqs = [
      { id: 'REQ-01', title: '微信支付' },
      { id: 'REQ-02', title: '支付宝支付' }
    ];

    // 尚有 REQ-02 未覆盖，应被门下省封驳拦截
    const rejectAudit = menxia.auditShardedPlan(fullReqs, shangshu);
    assert.strictEqual(rejectAudit.passed, false);
    assert.strictEqual(rejectAudit.coveredReqs, 1);
    assert.deepStrictEqual(rejectAudit.uncoveredReqs, ['REQ-02']);

    // 补齐 TASK-02
    shangshu.createTaskSlice({ id: 'TASK-02', title: '支付宝渠道', boundReqs: ['REQ-02'] });

    // 再次审计，100% 覆盖放行
    const passAudit = menxia.auditShardedPlan(fullReqs, shangshu);
    assert.strictEqual(passAudit.passed, true);
    assert.strictEqual(passAudit.coveredReqs, 2);
    assert.strictEqual(passAudit.rate, '100%');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('6. findActiveTaskOrPlanPath 支持通过 taskId 直接定位到独立分片文件', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sansheng-shard-'));
    const shangshu = new Shangshu(tmpDir);

    const p1 = shangshu.createTaskSlice({ id: 'TASK-01', title: '任务一' });
    const p2 = shangshu.createTaskSlice({ id: 'TASK-02', title: '任务二' });

    const foundPath1 = findActiveTaskOrPlanPath(tmpDir, 'TASK-01');
    assert.strictEqual(foundPath1, p1);

    const foundPath2 = findActiveTaskOrPlanPath(tmpDir, 'TASK-02');
    assert.strictEqual(foundPath2, p2);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('7. markUATItemPassed 精准打勾目标分片，不影响其它分片且自动联动刷新主看板', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sansheng-shard-'));
    const shangshu = new Shangshu(tmpDir);

    const p1 = shangshu.createTaskSlice({ id: 'TASK-01', title: '订单' });
    const p2 = shangshu.createTaskSlice({ id: 'TASK-02', title: '库存' });

    const t1 = shangshu.listTasks().find(t => t.id === 'TASK-01');
    assert.strictEqual(t1.uats.length, 2);

    // 仅打勾 TASK-01 的第一个 UAT
    markUATItemPassed(p1, t1.uats[0].rawHeaderLine, { cwd: tmpDir });

    const updatedContent1 = fs.readFileSync(p1, 'utf-8');
    assert.ok(updatedContent1.includes('- [x] `[UAT-01]`'));
    assert.ok(updatedContent1.includes('- [ ] `[UAT-02]`'));

    // TASK-02 保持完全未动
    const content2 = fs.readFileSync(p2, 'utf-8');
    assert.ok(content2.includes('- [ ] `[UAT-01]`'));
    assert.ok(content2.includes('- [ ] `[UAT-02]`'));

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('8. archiveTask 支持单任务归档，closeMilestone 支持全量分片结项归档并纯净化仓库', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sansheng-shard-'));
    const shangshu = new Shangshu(tmpDir);
    shangshu.syncToYongle = () => {}; // 避免单测触发远端 git push 耗时

    shangshu.createTaskSlice({ id: 'TASK-01', title: '已完工任务' });
    shangshu.createTaskSlice({ id: 'TASK-02', title: '下一个任务' });

    // 单任务归档 TASK-01
    const ok = shangshu.archiveTask('TASK-01');
    assert.strictEqual(ok, true);

    const remaining = shangshu.listTasks();
    assert.strictEqual(remaining.length, 1);
    assert.strictEqual(remaining[0].id, 'TASK-02');

    // 检查归档目录
    const archiveFiles = fs.readdirSync(path.join(tmpDir, '.sansheng', 'archive', 'tasks'));
    assert.ok(archiveFiles.some(f => f.includes('TASK-01')));

    // 结项全量归档
    shangshu.closeMilestone();
    assert.strictEqual(fs.existsSync(shangshu.tasksDir), false);
    assert.strictEqual(fs.existsSync(shangshu.taskPath), false);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('9. sansheng_task_status 工具能够在分片模式下输出多任务分片 HUD 指标', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sansheng-shard-'));
    const shangshu = new Shangshu(tmpDir);

    shangshu.createTaskSlice({ id: 'TASK-01', title: '用户中心' });
    shangshu.createTaskSlice({ id: 'TASK-02', title: '商品中心' });

    const originalCwd = process.cwd();
    try {
      process.chdir(tmpDir);
      const statusTool = createTaskStatusTool();
      const result = await statusTool.execute();

      assert.strictEqual(result.exists, true);
      assert.strictEqual(result.isSharded, true);
      assert.strictEqual(result.totalTasks, 2);
      assert.strictEqual(result.completedTasks, 0);
      assert.strictEqual(result.activeTaskId, 'TASK-01');
      assert.ok(result.hudSummary.includes('[TASK-01] 用户中心'));
      assert.ok(result.hudSummary.includes('[TASK-02] 商品中心'));
    } finally {
      process.chdir(originalCwd);
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('10. sansheng_archive 工具支持 mode: "task" 单任务归档', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sansheng-shard-'));
    const shangshu = new Shangshu(tmpDir);

    shangshu.createTaskSlice({ id: 'TASK-01', title: '结算台' });

    const originalCwd = process.cwd();
    try {
      process.chdir(tmpDir);
      const archiveTool = createArchiveTool();
      const res = await archiveTool.execute({ mode: 'task', taskId: 'TASK-01' });

      assert.strictEqual(res.success, true);
      assert.strictEqual(res.mode, 'task');
      assert.ok(res.message.includes('已成功归档'));
    } finally {
      process.chdir(originalCwd);
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
