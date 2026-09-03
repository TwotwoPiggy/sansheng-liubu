import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { compileUATToHtml, exportUATHtml } from '../src/index.js';

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
});
