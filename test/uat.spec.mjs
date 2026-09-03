import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { parseUATBlocks, markUATItemPassed } from '../src/index.js';

describe('交互式四要素 UAT 引擎与 PRD 预期解析测试套件 (UAT Runner)', () => {
  it('1. parseUATBlocks 能够正确解析多行四要素 UAT 清单', () => {
    const md = `
## 🎯 验收标准与质量门禁

### 4. 人工 UAT 交付验收准则清单 (Human Sign-off Checklist)
- [ ] \`[UAT-01]\` (溯源: REQ-01 / AC-1) 【订单列表异步导出正常流】
  - **前置与数据**：登录 operator_test 运营账号，存在待发货订单
  - **操作步骤**：进入列表 ➔ 勾选 ➔ 点击批量导出
  - **PRD预期对照**：1秒内弹出成功提示，下载中心解压无乱码且手机号脱敏
- [x] \`[UAT-02]\` (溯源: REQ-01 / AC-2) 【超过阈值熔断拦截】
  - **前置与数据**：筛选超过 10,000 条订单
  - **操作步骤**：点击批量导出
  - **PRD预期对照**：前端弹出 Warning 提示，不发起请求
`;

    const blocks = parseUATBlocks(md);
    assert.strictEqual(blocks.length, 2);

    const uat1 = blocks[0];
    assert.strictEqual(uat1.id, 'UAT-01');
    assert.strictEqual(uat1.passed, false);
    assert.strictEqual(uat1.trace, 'REQ-01 / AC-1');
    assert.ok(uat1.title.includes('订单列表异步导出正常流'));
    assert.ok(uat1.preconditions.includes('operator_test'));
    assert.ok(uat1.steps.includes('进入列表'));
    assert.ok(uat1.expected.includes('1秒内弹出成功提示'));

    const uat2 = blocks[1];
    assert.strictEqual(uat2.id, 'UAT-02');
    assert.strictEqual(uat2.passed, true);
    assert.strictEqual(uat2.trace, 'REQ-01 / AC-2');
  });

  it('2. parseUATBlocks 向下兼容单行一句话用例', () => {
    const md = `
- [ ] [UAT-01] 基础正常路径业务验证通过。
- [ ] [UAT-02] 异常与边界提示验证通过。
`;
    const blocks = parseUATBlocks(md);
    assert.strictEqual(blocks.length, 2);
    assert.strictEqual(blocks[0].id, 'UAT-01');
    assert.strictEqual(blocks[0].passed, false);
    assert.ok(blocks[0].title.includes('基础正常路径业务验证通过'));
  });

  it('3. markUATItemPassed 精确更新主任务勾选状态且保留多行四要素详情', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sansheng-uat-'));
    const testTaskFile = path.join(tmpDir, 'TASK.md');

    const originalContent = `## 🎯 验收标准
- [ ] \`[UAT-01]\` (溯源: REQ-01 / AC-1) 【导出测试】
  - **前置与数据**：测试账号
  - **操作步骤**：点击按钮
  - **PRD预期对照**：显示成功
`;
    fs.writeFileSync(testTaskFile, originalContent, 'utf-8');

    const blocks = parseUATBlocks(originalContent);
    assert.strictEqual(blocks[0].passed, false);

    markUATItemPassed(testTaskFile, blocks[0].rawHeaderLine);

    const updatedContent = fs.readFileSync(testTaskFile, 'utf-8');
    assert.ok(updatedContent.includes('- [x] `[UAT-01]` (溯源: REQ-01 / AC-1) 【导出测试】'));
    assert.ok(updatedContent.includes('PRD预期对照'));
    assert.ok(updatedContent.includes('前置与数据'));

    // 清理临时文件
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
