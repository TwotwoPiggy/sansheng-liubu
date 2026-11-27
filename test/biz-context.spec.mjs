import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import {
  createBizContext,
  linkBizContext,
  listBizContexts,
  findBizDocument,
  scanCodeAnchors,
  rebuildBizIndex,
  getFileBizBrief,
  getFileBizBadge,
  queryWhy,
  auditBizContext,
  extractCodebaseMap,
  queryFocusedMap,
  recallById,
  Shangshu,
  createMcpServer,
  collectBuiltinSkills,
} from '../src/index.js';

const cliPath = fileURLToPath(new URL('../bin/cli.js', import.meta.url));

function writeWorkspaceFile(root, relPath, content) {
  const full = path.join(root, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf-8');
  return full;
}

describe('业务需求、背景与代码逻辑双向溯源闭环 (BCT) 测试套件', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sansheng-biz-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (_) {}
  });

  it('1. 两栖独立模式：无 TASK.md 可直接建档、同日 ID 递增，并自动维护纵向演化链 (supersedes)', () => {
    const fixedDate = new Date('2026-11-28T10:00:00Z');
    const r1 = createBizContext(tmpDir, {
      title: '老渠道全量豁免税号',
      why: '2023年前老渠道历史订单无税号，月结导出报错',
      decisions: '先放开全部老渠道税号校验以应急止血',
      reqs: ['REQ-01'],
      rules: ['RULE-01'],
      files: ['src/tax.js'],
      date: fixedDate,
    });

    assert.strictEqual(r1.success, true);
    assert.strictEqual(r1.id, 'BIZ-20261128-01');
    assert.ok(fs.existsSync(path.join(tmpDir, r1.filePath)));

    // 新口径替代旧口径
    const r2 = createBizContext(tmpDir, {
      title: '老渠道仅2023年前订单豁免税号',
      why: '财务合规审计要求2023年后新单必须强制补录税号',
      decisions: '选A弃B：按渠道白名单 + 创建时间<2023-01-01双条件豁免',
      specialLogic: '[RULE-02] 仅 channel===Legacy 且 createdAt<2023-01-01 跳过校验',
      reqs: ['REQ-02'],
      rules: ['RULE-02'],
      files: ['src/tax.js'],
      supersedes: [r1.id],
      date: fixedDate,
    });

    assert.strictEqual(r2.id, 'BIZ-20261128-02');
    assert.deepStrictEqual(r2.supersededUpdated, ['BIZ-20261128-01']);

    // 校验旧档案已自动标为 superseded 并指向新档案
    const oldDoc = findBizDocument(tmpDir, 'BIZ-20261128-01');
    assert.strictEqual(oldDoc.status, 'superseded');
    assert.deepStrictEqual(oldDoc.supersededBy, ['BIZ-20261128-02']);

    // 仅查 active 档案时自动过滤已废止记录
    const activeList = listBizContexts(tmpDir, { status: 'active' });
    assert.strictEqual(activeList.length, 1);
    assert.strictEqual(activeList[0].id, 'BIZ-20261128-02');
  });

  it('2. 多语言 @biz / @why 锚点扫描与外层符号提取 (C# / TS / Vue / Python)', () => {
    writeWorkspaceFile(tmpDir, 'src/OrderService.cs', [
      'public class OrderService {',
      '  public bool ValidateTaxNo(Order order) {',
      '    // @biz BIZ-20261128-01 [RULE-01]: 老渠道历史单无税号豁免校验',
      '    if (order.IsLegacy) return true;',
      '    return !string.IsNullOrEmpty(order.TaxNo);',
      '  }',
      '}',
    ].join('\n'));

    writeWorkspaceFile(tmpDir, 'src/pay.ts', [
      'export async function handleCallback(evt: any) {',
      '  // @why: 第三方支付回调偶发乱序，必须先判终态再更新',
      '  if (evt.finalized) return;',
      '}',
    ].join('\n'));

    writeWorkspaceFile(tmpDir, 'src/OrderView.vue', [
      '<template>',
      '  <!-- @why: 兼容运营老浏览器，禁用虚拟滚动吸顶 -->',
      '  <div class="table"></div>',
      '</template>',
    ].join('\n'));

    writeWorkspaceFile(tmpDir, 'scripts/reconcile.py', [
      'def run_reconcile(rows):',
      '    # @biz BIZ-20261128-01: 财务对账按分取整防浮点误差',
      '    return sum(int(r * 100) for r in rows)',
    ].join('\n'));

    // 验证字符串字面量内的 "@biz" / "@why" 绝不被误扫描为真实注释锚点
    writeWorkspaceFile(tmpDir, 'src/logger.js', [
      'export function printTip() {',
      '  console.log("  // @biz BIZ-20261128-99: 字符串内假锚点不应命中");',
      "  const sample = '  // @why: 同样在字符串内部不应命中';",
      '  return sample;',
      '}',
    ].join('\n'));

    const anchors = scanCodeAnchors(tmpDir);
    assert.strictEqual(anchors.length, 4);

    const csAnchor = anchors.find(a => a.file === 'src/OrderService.cs');
    assert.strictEqual(csAnchor.kind, 'biz');
    assert.strictEqual(csAnchor.bizId, 'BIZ-20261128-01');
    assert.strictEqual(csAnchor.ruleRef, 'RULE-01');
    assert.strictEqual(csAnchor.line, 3);
    assert.strictEqual(csAnchor.symbol, 'ValidateTaxNo');

    const tsAnchor = anchors.find(a => a.file === 'src/pay.ts');
    assert.strictEqual(tsAnchor.kind, 'why');
    assert.strictEqual(tsAnchor.bizId, null);
    assert.strictEqual(tsAnchor.symbol, 'handleCallback');

    const pyAnchor = anchors.find(a => a.file === 'scripts/reconcile.py');
    assert.strictEqual(pyAnchor.symbol, 'run_reconcile');
  });

  it('3. queryWhy 四模式反查 + 真实 Git Commit Trailer + 行级 git log -L + 分页预算截断', () => {
    const fixedDate = new Date('2026-11-28T10:00:00Z');
    const biz = createBizContext(tmpDir, {
      title: '订单导出防OOM与老渠道豁免',
      why: '百万行月结导出易 OOM 且老渠道无税号',
      decisions: '采用流式分片导出 + 老渠道时间阈值豁免',
      reqs: ['REQ-01'],
      rules: ['RULE-01'],
      files: ['src/export.js'],
      symbols: ['validateTaxNo'],
      date: fixedDate,
    });

    writeWorkspaceFile(tmpDir, 'src/export.js', [
      'export function validateTaxNo(order) {',
      '  // @biz BIZ-20261128-01 [RULE-01]: 老渠道 2023 前订单豁免税号校验',
      '  if (order.channel === "legacy" && order.year < 2023) {',
      '    return true;',
      '  }',
      '  return Boolean(order.taxNo);',
      '}',
    ].join('\n'));

    // 初始化真实临时 Git 仓库并提交带 Biz-Context Trailer 的 Commit
    execFileSync('git', ['init'], { cwd: tmpDir, stdio: 'ignore', windowsHide: true });
    execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: tmpDir, stdio: 'ignore', windowsHide: true });
    execFileSync('git', ['config', 'user.name', 'Tester'], { cwd: tmpDir, stdio: 'ignore', windowsHide: true });
    execFileSync('git', ['add', '.'], { cwd: tmpDir, stdio: 'ignore', windowsHide: true });
    execFileSync('git', ['commit', '-m', 'feat: 订单导出老渠道税号豁免\n\nBiz-Context: BIZ-20261128-01\nReq-Id: REQ-01'], {
      cwd: tmpDir,
      stdio: 'ignore',
      windowsHide: true,
    });

    rebuildBizIndex(tmpDir, { includeGit: true });

    // 3.1 行级反查 file:line
    const lineRes = queryWhy(tmpDir, 'src/export.js:3');
    assert.strictEqual(lineRes.found, true);
    assert.strictEqual(lineRes.mode, 'line');
    assert.strictEqual(lineRes.enclosingSymbol, 'validateTaxNo');
    assert.ok(lineRes.content.includes('BIZ-20261128-01'));
    assert.ok(lineRes.content.includes('老渠道 2023 前订单豁免税号校验'));
    assert.ok(lineRes.content.includes('订单导出老渠道税号豁免'));

    // 3.2 符号反查
    const symRes = queryWhy(tmpDir, 'validateTaxNo');
    assert.strictEqual(symRes.found, true);
    assert.strictEqual(symRes.mode, 'symbol_or_keyword');
    assert.ok(symRes.content.includes('BIZ-20261128-01'));

    // 3.3 BIZ-ID 反查
    const bizRes = queryWhy(tmpDir, biz.id);
    assert.strictEqual(bizRes.found, true);
    assert.strictEqual(bizRes.mode, 'biz');
    assert.ok(bizRes.content.includes('src/export.js:L2'));
    assert.ok(bizRes.related.some(r => r.id === 'REQ-01'));

    // 3.4 Token 预算分页截断
    const pagedRes = queryWhy(tmpDir, 'src/export.js', { limit: 220 });
    assert.strictEqual(pagedRes.found, true);
    assert.strictEqual(pagedRes.truncated, true);
    assert.ok(Number.isInteger(pagedRes.nextOffset));
  });

  it('4. 代码依赖调用链穿透 (--chain) + map --focus 改前红线自动注入、微徽章预警与 0 膨胀护栏', () => {
    const fixedDate = new Date('2026-11-28T10:00:00Z');

    writeWorkspaceFile(tmpDir, 'src/taxValidator.js', [
      'export function validateTax(order) {',
      '  // @biz BIZ-20261128-02 [RULE-02]: 仅2023年前老渠道免税号',
      '  return order.legacy ? true : !!order.taxNo;',
      '}',
    ].join('\n'));

    writeWorkspaceFile(tmpDir, 'src/orderController.js', [
      "import { validateTax } from './taxValidator.js';",
      'export function submitOrder(order) {',
      '  return validateTax(order);',
      '}',
    ].join('\n'));

    writeWorkspaceFile(tmpDir, 'src/pureUtil.js', [
      'export function add(a, b) {',
      '  return a + b;',
      '}',
    ].join('\n'));

    // 先建旧口径再建新口径替代它（验证改前注入仅注入 active，过滤 superseded）
    createBizContext(tmpDir, {
      title: '旧口径全量免税号',
      why: '早期临时豁免全部老渠道',
      files: ['src/taxValidator.js'],
      date: fixedDate,
    });
    createBizContext(tmpDir, {
      title: '收紧老渠道税号口径',
      why: '财务审计要求仅 2023 年前订单豁免',
      rules: ['RULE-02'],
      files: ['src/taxValidator.js'],
      supersedes: ['BIZ-20261128-01'],
      date: fixedDate,
    });

    // 构建代码依赖图谱 (.sansheng/codebase_index.json)
    extractCodebaseMap(tmpDir, 4, { skipCache: true });

    // 4.1 聚焦有业务红线的目标文件：注入生效红线，且屏蔽已废止旧口径
    const taxSlice = queryFocusedMap(tmpDir, 'src/taxValidator.js');
    assert.ok(taxSlice.includes('业务背景与特殊逻辑红线'));
    assert.ok(taxSlice.includes('BIZ-20261128-02'));
    assert.ok(taxSlice.includes('仅2023年前老渠道免税号'));
    assert.ok(!taxSlice.includes('旧口径全量免税号'), '改前注入不应混入已废止 (superseded) 档案');

    // 4.2 聚焦上游调用方：自身无红线不膨胀，但下游依赖行挂出微徽章 ⚠️ [BIZ:1, @biz:1]
    const ctrlSlice = queryFocusedMap(tmpDir, 'src/orderController.js');
    assert.ok(!ctrlSlice.includes('业务背景与特殊逻辑红线'));
    assert.ok(ctrlSlice.includes('⚠️ [BIZ:1, @biz:1]'));
    assert.strictEqual(getFileBizBadge(tmpDir, 'src/taxValidator.js'), ' ⚠️ [BIZ:1, @biz:1]');
    assert.strictEqual(getFileBizBadge(tmpDir, 'src/pureUtil.js'), '');

    // 4.3 无业务记录的纯净文件：严格 0 字符膨胀
    const pureBrief = getFileBizBrief(tmpDir, 'src/pureUtil.js');
    assert.strictEqual(pureBrief, '');
    const pureSlice = queryFocusedMap(tmpDir, 'src/pureUtil.js');
    assert.ok(!pureSlice.includes('业务背景与特殊逻辑红线'));

    // 4.4 硬 Token 预算截断护栏验证
    const cappedBrief = getFileBizBrief(tmpDir, 'src/taxValidator.js', { maxChars: 240 });
    assert.ok(cappedBrief.length <= 260);
    assert.ok(cappedBrief.includes('Token 护栏已折叠'));

    // 4.5 调用链穿透：sansheng why orderController.js --chain 1 捕获下游 taxValidator.js 雷区
    const chainRes = queryWhy(tmpDir, 'src/orderController.js', { chainDepth: 1, includeGit: false });
    assert.strictEqual(chainRes.found, true);
    assert.ok(chainRes.content.includes('调用链关联业务红线'));
    assert.ok(chainRes.content.includes('src/taxValidator.js'));
    assert.ok(chainRes.content.includes('BIZ-20261128-02'));
  });

  it('5. 防腐化审计 auditBizContext：精准检出幽灵 @biz、指向已废止口径锚点与失联文件', () => {
    const fixedDate = new Date('2026-11-28T10:00:00Z');
    createBizContext(tmpDir, {
      title: '旧版折扣策略',
      why: '旧促销期特例',
      files: ['src/deletedFile.js'],
      date: fixedDate,
    });
    createBizContext(tmpDir, {
      title: '新版折扣策略',
      why: '统一折扣上限',
      supersedes: ['BIZ-20261128-01'],
      date: fixedDate,
    });

    writeWorkspaceFile(tmpDir, 'src/price.js', [
      'export function calc() {',
      '  // @biz BIZ-20261128-99: 指向不存在档案的幽灵引用',
      '  // @biz BIZ-20261128-01: 仍指向旧版已废止档案',
      '  return 1;',
      '}',
    ].join('\n'));

    const audit = auditBizContext(tmpDir);
    assert.strictEqual(audit.passed, false);
    assert.strictEqual(audit.orphanAnchors.length, 1);
    assert.strictEqual(audit.orphanAnchors[0].bizId, 'BIZ-20261128-99');
    assert.strictEqual(audit.supersededAnchors.length, 1);
    assert.strictEqual(audit.supersededAnchors[0].bizId, 'BIZ-20261128-01');
    assert.strictEqual(audit.missingFiles.length, 1);
    assert.strictEqual(audit.missingFiles[0].file, 'src/deletedFile.js');
    assert.strictEqual(audit.unlinkedActiveBiz.length, 1);
    assert.strictEqual(audit.unlinkedActiveBiz[0].id, 'BIZ-20261128-02');
  });

  it('6. 深度集成：recallById(BIZ/REQ) + 工兵红线注入 + 结项保留永久档案 + 永乐可配置双写', () => {
    const fixedDate = new Date('2026-11-28T10:00:00Z');
    writeWorkspaceFile(tmpDir, 'src/billing.js', [
      'export function settle() {',
      '  // @biz BIZ-20261128-01 [RULE-01]: 跨月结算必须在次月1日02:00后执行',
      '  return true;',
      '}',
    ].join('\n'));

    // 开启永乐双写建档
    const created = createBizContext(tmpDir, {
      title: '跨月结算时间窗口约束',
      why: '银行渠道T+1对账文件01:30才落盘',
      reqs: ['REQ-09'],
      rules: ['RULE-01'],
      files: ['src/billing.js'],
      syncToYongle: true,
      date: fixedDate,
    });
    assert.strictEqual(created.yongleResult.synced, true);
    assert.ok(fs.existsSync(path.join(tmpDir, '.planning', 'yongle', 'biz-context', 'BIZ-20261128-01.md')));
    assert.strictEqual(created.doc.yongleSynced, true);

    // 6.1 recallById 支持 BIZ-xxx 链式召回（含源码锚点与 REQ 下一跳）
    const bizRecall = recallById('BIZ-20261128-01', { cwd: tmpDir });
    assert.strictEqual(bizRecall.found, true);
    assert.strictEqual(bizRecall.type, 'BIZ');
    assert.ok(bizRecall.content.includes('src/billing.js:L2'));
    assert.ok(bizRecall.related.some(r => r.id === 'REQ-09' && r.type === 'REQ'));

    // 6.2 尚书省工兵微切片自动注入目标文件红线
    const shangshu = new Shangshu(tmpDir);
    const slice = shangshu.buildWorkerSliceContext(
      { id: 'TASK-01', title: '调整跨月结算', boundReqs: ['REQ-09'], targetFiles: ['src/billing.js'] },
      { cwd: tmpDir }
    );
    assert.ok(slice.includes('目标文件历史业务背景与特殊逻辑红线'));
    assert.ok(slice.includes('BIZ-20261128-01'));
    assert.ok(slice.includes('特殊逻辑红线保护'));

    // 6.3 尚书省结项归档清理 TASK.md，但必须永久保留 .sansheng/context/ 且支持结项后 REQ-09 穿透召回
    shangshu.yongle.syncKnowledge = () => false;
    shangshu.createTaskSlice({ id: 'TASK-01', title: '结算调整', boundReqs: ['REQ-09'] });
    shangshu.closeMilestone();
    assert.strictEqual(fs.existsSync(path.join(tmpDir, '.sansheng', 'TASK.md')), false);
    assert.strictEqual(fs.existsSync(path.join(tmpDir, '.sansheng', 'context', 'index.json')), true);
    assert.ok(findBizDocument(tmpDir, 'BIZ-20261128-01'));

    const postArchiveReqRecall = recallById('REQ-09', { cwd: tmpDir });
    assert.strictEqual(postArchiveReqRecall.found, true);
    assert.ok(postArchiveReqRecall.related.some(r => r.id === 'BIZ-20261128-01'));
  });

  it('7. CLI (sansheng biz / sansheng why) 与 MCP (sansheng_biz / sansheng_why) 及内置技能端到端验证', async () => {
    writeWorkspaceFile(tmpDir, 'src/auth.js', [
      'export function verifyToken(token) {',
      '  // @why: 兼容移动端旧版本 5 分钟时钟漂移',
      '  return Boolean(token);',
      '}',
    ].join('\n'));

    // 7.1 CLI sansheng biz create / link / why --json
    const createOut = execFileSync(process.execPath, [
      cliPath, 'biz', 'create',
      '--title', '移动端 Token 时钟漂移兼容',
      '--why', '部分老安卓机型系统时间慢 3~5 分钟',
      '--files', 'src/auth.js',
      '--json',
    ], { cwd: tmpDir, encoding: 'utf-8', windowsHide: true });
    const createJson = JSON.parse(createOut);
    assert.strictEqual(createJson.success, true);
    assert.ok(/^BIZ-\d{8}-01$/.test(createJson.id));

    const whyOut = execFileSync(process.execPath, [
      cliPath, 'why', 'src/auth.js:2', '--no-git', '--json',
    ], { cwd: tmpDir, encoding: 'utf-8', windowsHide: true });
    const whyJson = JSON.parse(whyOut);
    assert.strictEqual(whyJson.found, true);
    assert.ok(whyJson.content.includes('时钟漂移'));
    assert.ok(whyJson.content.includes(createJson.id));

    // 7.2 MCP Server tools/call 调用 sansheng_biz & sansheng_why
    const server = createMcpServer({ cwd: tmpDir });
    const bizListRes = await server.handleMessage({
      jsonrpc: '2.0',
      id: 10,
      method: 'tools/call',
      params: { name: 'sansheng_biz', arguments: { action: 'list' } },
    });
    assert.strictEqual(bizListRes.result.isError, false);
    assert.strictEqual(bizListRes.result.structuredContent.items.length, 1);

    const whyCallRes = await server.handleMessage({
      jsonrpc: '2.0',
      id: 11,
      method: 'tools/call',
      params: { name: 'sansheng_why', arguments: { target: 'verifyToken', includeGit: false } },
    });
    assert.strictEqual(whyCallRes.result.isError, false);
    assert.strictEqual(whyCallRes.result.structuredContent.found, true);
    assert.ok(whyCallRes.result.content[0].text.includes('时钟漂移'));

    // 7.3 内置技能清单包含 sansheng-why
    const skills = collectBuiltinSkills();
    assert.ok(skills.some(s => s.name === 'sansheng-why'));
  });
});
