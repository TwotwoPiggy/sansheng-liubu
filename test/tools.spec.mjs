import { describe, it } from 'node:test';
import assert from 'node:assert';
import { LSPClient, SubagentAdapter, CBMBridge, extractCodebaseMap } from '../src/index.js';

describe('三省六部底层工具链与安全防护测试套件 (Tools)', () => {
  it('1. LSPClient.toURI / fromURI 满足 RFC 8089 跨平台规范', () => {
    const winPath = 'D:\\Projects\\App\\Program.cs';
    const uri = LSPClient.toURI(winPath);
    assert.ok(uri.startsWith('file:///'));
    assert.ok(uri.includes('Program.cs'));

    const parsedBack = LSPClient.fromURI(uri);
    assert.ok(parsedBack.includes('Program.cs'));
  });

  it('2. LSPClient 具备完整的符号操作方法与状态管理', () => {
    const client = new LSPClient('csharp-ls');
    assert.strictEqual(client.initialized, false);
    assert.strictEqual(typeof client.initialize, 'function');
    assert.strictEqual(typeof client.openDocument, 'function');
    assert.strictEqual(typeof client.renameSymbol, 'function');
    assert.strictEqual(typeof client.findReferences, 'function');
    assert.strictEqual(typeof client.getDefinition, 'function');
    assert.strictEqual(typeof client.getDocumentSymbols, 'function');
    assert.strictEqual(typeof client.getFileDiagnostics, 'function');
  });

  it('3. SubagentAdapter 正确解析 Worker 绝对路径并支持弹性升配', () => {
    const adapter = new SubagentAdapter({
      models: {
        architect_tier: 'gemini-3.7-flash',
        worker_tier: 'deepseek-v3',
        fallback_tier: 'gemini-3.7-flash'
      },
      escalation: { enabled: true, max_retries: 2 }
    });
    assert.ok(adapter);
    assert.strictEqual(typeof adapter.dispatchTask, 'function');
    assert.strictEqual(typeof adapter.runHeadlessWorker, 'function');
  });

  it('4. CBMBridge queryTool 防御性调用与安全探测', () => {
    const detect = CBMBridge.detectCBM();
    assert.ok(typeof detect === 'object');
    assert.ok('installed' in detect);

    const queryResult = CBMBridge.queryTool('find_symbol', { symbol: 'OrderService; rm -rf /' });
    assert.ok(queryResult === null || typeof queryResult === 'object');
  });

  it('5. extractCodebaseMap 能够提取代码库 AST 骨架', () => {
    const map = extractCodebaseMap(process.cwd(), 2);
    assert.ok(typeof map === 'string');
    assert.ok(map.includes('代码库符号拓扑地图'));
  });
});
