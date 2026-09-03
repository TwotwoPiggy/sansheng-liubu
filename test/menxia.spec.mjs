import { describe, it } from 'node:test';
import assert from 'node:assert';
import { Menxia } from '../src/index.js';

describe('门下省 (Menxia) 门禁审核与严格需求覆盖率对账测试套件', () => {
  const menxia = new Menxia();

  it('1. generateQualityGates 能够生成标准质量门禁契约', () => {
    const gates = menxia.generateQualityGates();
    assert.ok(gates.includes('验收标准与质量门禁'));
    assert.ok(gates.includes('dotnet test'));
    assert.ok(gates.includes('[UAT-01]'));
  });

  it('2. auditCoverage 能够正确计算 100% 覆盖情况', () => {
    const reqs = [{ id: 'REQ-01' }, { id: 'REQ-02' }];
    const tasks = [
      { id: 'TASK-01', boundReqs: ['REQ-01'] },
      { id: 'TASK-02', boundReqs: ['REQ-02'] }
    ];
    const res = menxia.auditCoverage(reqs, tasks);
    assert.strictEqual(res.passed, true);
    assert.strictEqual(res.total, 2);
    assert.strictEqual(res.covered, 2);
    assert.strictEqual(res.uncovered.length, 0);
    assert.strictEqual(res.rate, '100%');
  });

  it('3. auditCoverage 能够精确检测未覆盖需求', () => {
    const reqs = [{ id: 'REQ-01' }, { id: 'REQ-02' }, { id: 'REQ-03' }];
    const tasks = [
      { id: 'TASK-01', boundReqs: ['REQ-01'] }
    ];
    const res = menxia.auditCoverage(reqs, tasks);
    assert.strictEqual(res.passed, false);
    assert.strictEqual(res.total, 3);
    assert.strictEqual(res.covered, 1);
    assert.deepStrictEqual(res.uncovered, ['REQ-02', 'REQ-03']);
    assert.strictEqual(res.rate, '33%');
  });

  it('4. 审计漏洞修复验证：Task 绑定虚假 REQ ID 不能导致虚假通过', () => {
    const reqs = [{ id: 'REQ-01' }, { id: 'REQ-02' }];
    const tasks = [
      { id: 'TASK-01', boundReqs: ['REQ-01', 'REQ-99', 'REQ-88'] }
    ];
    const res = menxia.auditCoverage(reqs, tasks);
    assert.strictEqual(res.passed, false);
    assert.strictEqual(res.total, 2);
    assert.strictEqual(res.covered, 1);
    assert.deepStrictEqual(res.uncovered, ['REQ-02']);
    assert.ok(res.invalidBoundReqs.includes('REQ-99'));
    assert.ok(res.invalidBoundReqs.includes('REQ-88'));
  });

  it('5. auditCoverage 支持字符串数组形式的 REQ', () => {
    const reqs = ['REQ-01', 'REQ-02'];
    const tasks = [{ id: 'TASK-01', boundReqs: ['REQ-01', 'REQ-02'] }];
    const res = menxia.auditCoverage(reqs, tasks);
    assert.strictEqual(res.passed, true);
    assert.strictEqual(res.covered, 2);
  });

  it('6. auditCoverage 对空需求列表具有防御性', () => {
    const res = menxia.auditCoverage([], []);
    assert.strictEqual(res.passed, true);
    assert.strictEqual(res.total, 0);
  });

  it('7. generateQualityGates 支持传入 reqs 自动生成四要素 UAT 清单', () => {
    const reqs = [
      { id: 'REQ-01', title: '订单异步导出' },
      { id: 'REQ-02', title: '租户权限隔离' }
    ];
    const gates = menxia.generateQualityGates({ reqs });
    assert.ok(gates.includes('四要素'));
    assert.ok(gates.includes('[UAT-01]'));
    assert.ok(gates.includes('溯源: REQ-01 / AC-1'));
    assert.ok(gates.includes('PRD预期对照'));
    assert.ok(gates.includes('前置与数据'));
    assert.ok(gates.includes('操作步骤'));
  });

  it('8. auditUATCoverage 能够准确审计 100% 覆盖情况并验证 PRD 预期', () => {
    const reqs = ['REQ-01', 'REQ-02'];
    const uatMarkdown = `
### 4. 人工 UAT 交付验收准则清单
- [ ] \`[UAT-01]\` (溯源: REQ-01 / AC-1) 【订单导出正常流】
  - **前置与数据**：登录运营账号
  - **操作步骤**：点击批量导出
  - **PRD预期对照**：弹出成功提示且生成文件
- [ ] \`[UAT-02]\` (溯源: REQ-02 / AC-1) 【无权拦截】
  - **前置与数据**：访客账号
  - **操作步骤**：尝试导出
  - **PRD预期对照**：返回 403 页面
`;
    const res = menxia.auditUATCoverage(reqs, uatMarkdown);
    assert.strictEqual(res.passed, true);
    assert.strictEqual(res.totalReqs, 2);
    assert.strictEqual(res.coveredReqs, 2);
    assert.strictEqual(res.uncoveredReqs.length, 0);
    assert.strictEqual(res.untraceableUats.length, 0);
    assert.strictEqual(res.missingExpectedUats.length, 0);
    assert.strictEqual(res.rate, '100%');
  });

  it('9. auditUATCoverage 能够精准识别未覆盖需求、无源 UAT 以及缺失 PRD 预期的用例', () => {
    const reqs = ['REQ-01', 'REQ-02', 'REQ-03'];
    const uatMarkdown = `
- [ ] \`[UAT-01]\` (溯源: REQ-01) 【订单导出】
  - **操作步骤**：点击导出
- [ ] \`[UAT-02]\` 【无源测试】
  - **PRD预期对照**：显示错误提示
`;
    const res = menxia.auditUATCoverage(reqs, uatMarkdown);
    assert.strictEqual(res.passed, false);
    // 未覆盖需求 REQ-02, REQ-03
    assert.ok(res.uncoveredReqs.includes('REQ-02'));
    assert.ok(res.uncoveredReqs.includes('REQ-03'));
    // UAT-01 缺少 PRD 预期
    assert.ok(res.missingExpectedUats.includes('UAT-01'));
    // UAT-02 是无源测试
    assert.ok(res.untraceableUats.includes('UAT-02'));
  });
});

