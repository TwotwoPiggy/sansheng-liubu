import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { compileUATToHtml, exportUATHtml, serveUATHtml, watchUATHtml, findActiveTaskOrPlanPath } from '../src/index.js';

describe('0 Token 本地 UAT HTML 验收看板编译器测试套件 (uat-html-compiler)', () => {
  const sampleMarkdown = `# 订单中心 Phase 2 开发看板

## 🎯 验收标准与质量门禁 (Verification & Quality Gates)

### 4. 人工 UAT 交付验收准则清单 (Human Sign-off Checklist)
- [ ] \`[UAT-01]\` (溯源: REQ-01 / AC-1) 【订单列表异步导出正常流】
  - **前置与数据**：登录 operator_test 运营账号，系统存在至少 1 笔“待发货”订单
  - **操作步骤**：进入【订单管理 ➔ 列表】➔ 勾选前 2 条 ➔ 点击右上角【批量导出】
  - **PRD预期对照**：1秒内弹出成功提示：“导出任务已提交”；进入【下载中心】可下载 Excel，手机号脱敏
- [x] \`[UAT-02]\` (溯源: REQ-01 / AC-2) 【超过阈值熔断拦截】
  - **前置与数据**：筛选超过 10,000 条订单
  - **操作步骤**：点击批量导出
  - **PRD预期对照**：前端直接弹出 Warning 提示，不触发后端接口
`;

  it('1. compileUATToHtml 能够将包含四要素的 TASK.md 编译为自包含交互式 HTML', () => {
    const html = compileUATToHtml(sampleMarkdown);

    // 结构完备性校验
    assert.ok(html.includes('<!DOCTYPE html>'));
    assert.ok(html.includes('<title>订单中心 Phase 2 开发看板</title>'));
    assert.ok(html.includes('0 Token 本地编译'));

    // 数据与四要素校验
    assert.ok(html.includes('UAT-01'));
    assert.ok(html.includes('UAT-02'));
    assert.ok(html.includes('operator_test'));
    assert.ok(html.includes('PRD预期'));
    assert.ok(html.includes('导出任务已提交'));

    // 前端核心能力集成校验
    assert.ok(html.includes('showOpenFilePicker')); // 现代浏览器文件直连
    assert.ok(html.includes('copyLatestMarkdown')); // 一键复制 Markdown
    assert.ok(html.includes('downloadMarkdown'));   // 一键下载备份
    assert.ok(html.includes('localStorage'));       // 本地缓存兜底
    assert.ok(html.includes('indexedDB'));          // IndexedDB 句柄持久化记忆
    assert.ok(html.includes('UATStorage'));         // 句柄存储适配器
    assert.ok(html.includes('sync-banner'));        // 防脱节横幅
    assert.ok(html.includes('queryPermission'));    // 权限自动探测
    assert.ok(html.includes('btn-reload-md'));      // 从本地 MD 重载更新按钮
    assert.ok(html.includes('btn-sync-to-md'));     // 立即同步到 MD 按钮
    assert.ok(html.includes('reloadFromLocalMarkdown')); // 重载函数
    assert.ok(html.includes('forceSyncToLocalMarkdown'));  // 强制写回函数
  });

  it('2. compileUATToHtml 对空输入与缺少用例情况具备防御性', () => {
    const html = compileUATToHtml('');
    assert.ok(html.includes('<!DOCTYPE html>'));
    assert.ok(html.includes('0 / 0 (100%)'));

    const htmlNoUat = compileUATToHtml('# 纯文本文档\n没有任务');
    assert.ok(htmlNoUat.includes('纯文本文档'));
  });

  it('3. exportUATHtml 能够准确将看板输出至磁盘并回传统计指标', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sansheng-html-'));
    const testTask = path.join(tmpDir, 'TASK.md');
    const targetHtml = path.join(tmpDir, 'uat.html');

    fs.writeFileSync(testTask, sampleMarkdown, 'utf-8');

    const res = exportUATHtml({
      cwd: tmpDir,
      outputPath: targetHtml
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.uatCount, 2);
    assert.strictEqual(fs.existsSync(targetHtml), true);

    const generatedHtml = fs.readFileSync(targetHtml, 'utf-8');
    assert.ok(generatedHtml.includes('UAT-01'));
    assert.ok(generatedHtml.includes('UAT-02'));

    // 清理临时文件
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('4. exportUATHtml 支持显式指定 taskPath 以及自动探测已有项目中的小写 task.md', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sansheng-legacy-'));
    const lowerTask = path.join(tmpDir, 'task.md');
    fs.writeFileSync(lowerTask, sampleMarkdown, 'utf-8');

    // 自动探测已有项目中的小写 task.md
    const resAuto = exportUATHtml({ cwd: tmpDir });
    assert.strictEqual(resAuto.success, true);
    assert.strictEqual(resAuto.uatCount, 2);
    assert.ok(fs.existsSync(path.join(tmpDir, 'uat.html')));

    // 显式指定自定义路径
    const customTask = path.join(tmpDir, 'custom-feature.md');
    fs.writeFileSync(customTask, sampleMarkdown, 'utf-8');
    const resCustom = exportUATHtml({
      cwd: tmpDir,
      taskPath: './custom-feature.md'
    });
    assert.strictEqual(resCustom.success, true);
    assert.strictEqual(resCustom.uatCount, 2);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('5. exportUATHtml 能够自动探测 test-plan.md 并动态注入文件名元数据', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sansheng-testplan-'));
    const testPlanPath = path.join(tmpDir, 'test-plan.md');
    fs.writeFileSync(testPlanPath, sampleMarkdown, 'utf-8');

    // 验证 findActiveTaskOrPlanPath 能够探测到 test-plan.md
    const detected = findActiveTaskOrPlanPath(tmpDir);
    assert.strictEqual(detected, testPlanPath);

    // 编译并输出
    const res = exportUATHtml({ cwd: tmpDir });
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.taskPath, testPlanPath);

    const generatedHtml = fs.readFileSync(res.outputPath, 'utf-8');
    // 验证 HTML 内部动态注入了 test-plan.md 元数据，而不是死板的 TASK.md
    assert.ok(generatedHtml.includes('SOURCE_FILE_NAME = "test-plan.md"'));
    assert.ok(generatedHtml.includes('关联本地 test-plan.md'));

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('6. serveUATHtml 能够启动本地微型热同步服务并通过 API 完成实时读写', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sansheng-serve-'));
    const testPlan = path.join(tmpDir, 'test-plan.md');
    fs.writeFileSync(testPlan, sampleMarkdown, 'utf-8');

    const port = 3999;
    const serverInstance = await serveUATHtml({
      cwd: tmpDir,
      taskPath: testPlan,
      port,
    });

    try {
      assert.strictEqual(serverInstance.port, port);
      assert.ok(serverInstance.url.includes('3999'));

      // 1. 测试 GET /api/status
      const statusRes = await fetch(`http://localhost:${port}/api/status`);
      assert.strictEqual(statusRes.status, 200);
      const statusData = await statusRes.json();
      assert.strictEqual(statusData.success, true);
      assert.strictEqual(statusData.fileName, 'test-plan.md');
      assert.ok(statusData.markdown.includes('UAT-01'));

      // 2. 测试 POST /api/save 静默持久化写回
      const updatedMarkdown = sampleMarkdown.replace(/-\s*\[\s*\]\s*`?\[UAT-01\]`?/, '- [x] `[UAT-01]`');
      const saveRes = await fetch(`http://localhost:${port}/api/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markdown: updatedMarkdown }),
      });
      assert.strictEqual(saveRes.status, 200);
      const saveData = await saveRes.json();
      assert.strictEqual(saveData.success, true);

      // 验证磁盘上的真实文件已经被持久化更新
      const diskContent = fs.readFileSync(testPlan, 'utf-8');
      assert.ok(diskContent.includes('- [x] `[UAT-01]`'));
    } finally {
      await serverInstance.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('7. watchUATHtml 能够监听文件变动并自动触发重新编译 uat.html', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sansheng-watch-'));
    const testTask = path.join(tmpDir, 'TASK.md');
    fs.writeFileSync(testTask, sampleMarkdown, 'utf-8');

    let rebuildCalled = false;
    let rebuildResult = null;

    const watcher = watchUATHtml({ cwd: tmpDir }, (res) => {
      rebuildCalled = true;
      rebuildResult = res;
    });

    try {
      assert.ok(fs.existsSync(watcher.outputPath));

      // 模拟外部修改 TASK.md
      const appendContent = sampleMarkdown + '\n- [ ] `[UAT-03]` (溯源: REQ-02) 【新增第三条验收项】\n';
      fs.writeFileSync(testTask, appendContent, 'utf-8');

      // 等待防抖触发 (约 300ms)
      await new Promise(resolve => setTimeout(resolve, 350));

      assert.strictEqual(rebuildCalled, true);
      assert.strictEqual(rebuildResult.uatCount, 3);
      const generated = fs.readFileSync(watcher.outputPath, 'utf-8');
      assert.ok(generated.includes('UAT-03'));
    } finally {
      watcher.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
