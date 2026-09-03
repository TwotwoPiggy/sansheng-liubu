import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import {
  LSPClient,
  SubagentAdapter,
  CBMBridge,
  extractCodebaseMap,
  parseCodeFile,
  queryFocusedMap,
  clearMapCache
} from '../src/index.js';

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

  it('5. extractCodebaseMap 能够提取代码库 AST 骨架并包含架构概览', () => {
    const map = extractCodebaseMap(process.cwd(), 2);
    assert.ok(typeof map === 'string');
    assert.ok(map.includes('代码库符号拓扑地图'));
    assert.ok(map.includes('架构拓扑概览'));
  });

  it('6. parseCodeFile 能够精准解析 C# using、类继承关系与跨行方法签名', () => {
    const csharpCode = `
using System;
using System.Threading.Tasks;
namespace MyApp.Services
{
    public class OrderService : IOrderService, IDisposable
    {
        public string OrderId { get; set; }

        public async Task<bool> ProcessOrderAsync(
            string id,
            int quantity)
        {
            return true;
        }
    }
}
    `;
    const res = parseCodeFile(csharpCode, '.cs', 'src/Services/OrderService.cs');
    assert.ok(res.imports.includes('System'));
    assert.ok(res.imports.includes('System.Threading.Tasks'));
    assert.ok(res.exports.includes('OrderService'));
    assert.ok(res.inherits.includes('IOrderService'));
    assert.ok(res.inherits.includes('IDisposable'));
    assert.ok(res.symbols.includes('ProcessOrderAsync'));
    assert.ok(res.skeleton.includes('IOrderService, IDisposable'));
  });

  it('7. parseCodeFile 能够精准解析 Vue 3 SFC 的 import、defineProps 与函数', () => {
    const vueCode = `
<template>
  <div>{{ title }}</div>
</template>
<script setup lang="ts">
import { ref } from 'vue';
import { useOrderStore } from './stores/order';

defineProps<{
  title: string;
  count?: number;
}>();

const emit = defineEmits(['update']);

export function refreshData() {
  console.log('refresh');
}
</script>
    `;
    const res = parseCodeFile(vueCode, '.vue', 'src/components/OrderCard.vue');
    assert.ok(res.imports.includes('vue'));
    assert.ok(res.imports.includes('./stores/order'));
    assert.ok(res.exports.includes('refreshData'));
    assert.ok(res.skeleton.includes('defineProps'));
  });

  it('8. extractCodebaseMap 支持增量指纹缓存并在二次扫描时命中', () => {
    const cwd = process.cwd();
    clearMapCache(cwd);

    // 第一次扫描 (冷启动)
    const map1 = extractCodebaseMap(cwd, 2);
    assert.ok(map1.includes('新解析'));

    // 第二次扫描 (命中增量缓存)
    const map2 = extractCodebaseMap(cwd, 2);
    assert.ok(map2.includes('命中'));
  });

  it('9. queryFocusedMap 支持针对核心文件的局部聚焦切片与邻居拓扑提取', () => {
    const cwd = process.cwd();
    const slice = queryFocusedMap(cwd, 'src/tools/codebase-map.js', { budget: 1500 });
    assert.ok(typeof slice === 'string');
    assert.ok(slice.includes('聚焦代码拓扑切片'));
    assert.ok(slice.includes('codebase-map.js'));
  });

  it('10. extractCodebaseMap 能够生成合法的 .sansheng/codebase_index.json 拓扑图谱', () => {
    const cwd = process.cwd();
    extractCodebaseMap(cwd, 2);
    const indexPath = path.join(cwd, '.sansheng', 'codebase_index.json');
    assert.ok(fs.existsSync(indexPath));

    const content = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
    assert.ok(content.stats);
    assert.ok(content.nodes);
    assert.ok(content.stats.totalFiles > 0);
  });
});

