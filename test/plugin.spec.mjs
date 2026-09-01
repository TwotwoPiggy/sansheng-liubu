import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import * as SanshengPlugin from '../src/index.js';

describe('DeepSeek Harness (DSH) / Cordis 插件规范测试套件', () => {
  let mockContext;
  let mockTools = [];
  let approvalCalls = [];
  let disposeCalled = false;
  let readyCalled = false;
  let approvalShouldPass = true;

  beforeEach(() => {
    mockTools = [];
    approvalCalls = [];
    disposeCalled = false;
    readyCalled = false;
    approvalShouldPass = true;

    // 构造模拟的 Cordis Context 沙箱
    mockContext = {
      tools: {
        register: (tool) => {
          mockTools.push(tool);
        }
      },
      approval: {
        requestApproval: async (req) => {
          approvalCalls.push(req);
          if (!approvalShouldPass) {
            return { approved: false, reason: '用户手动拒绝高危操作' };
          }
          return { approved: true };
        }
      },
      logger: {
        info: () => {},
        warn: () => {},
        debug: () => {},
        error: () => {}
      },
      on: (event, handler) => {
        if (event === 'ready') readyCalled = true;
        if (event === 'dispose') disposeCalled = true;
      }
    };
  });

  it('1. 必须严格遵守 DSH 核心四要素具名导出规范 (严禁 export default)', () => {
    assert.strictEqual(SanshengPlugin.name, 'sansheng-liubu');
    assert.ok(Array.isArray(SanshengPlugin.inject));
    assert.ok(SanshengPlugin.inject.includes('tools'));
    assert.ok(SanshengPlugin.inject.includes('approval'));
    assert.ok(SanshengPlugin.Config, '必须导出 Config Schema');
    assert.strictEqual(typeof SanshengPlugin.apply, 'function', '必须导出 apply 函数');
    assert.strictEqual(SanshengPlugin.default, undefined, '严禁包含 export default');
  });

  it('2. apply 必须成功向 ctx.tools 注册全量 6 大三省六部核心工具', () => {
    SanshengPlugin.apply(mockContext, {
      models: {
        architectTier: 'gemini-3.7-flash',
        workerTier: 'deepseek-v3',
        fallbackTier: 'gemini-3.7-flash'
      },
      escalationMaxRetries: 2
    });

    assert.strictEqual(mockTools.length, 6, '应注册 6 个核心 Tool');
    
    const toolNames = mockTools.map(t => t.name);
    assert.ok(toolNames.includes('sansheng_codebase_map'));
    assert.ok(toolNames.includes('sansheng_task_status'));
    assert.ok(toolNames.includes('sansheng_uat_gate'));
    assert.ok(toolNames.includes('sansheng_archive'));
    assert.ok(toolNames.includes('sansheng_sync_rules'));
    assert.ok(toolNames.includes('sansheng_dispatch_worker'));
  });

  it('3. 所有工具必须遵循 DSH 权限分级与安全等级元数据标准', () => {
    SanshengPlugin.apply(mockContext, {});

    const mapTool = mockTools.find(t => t.name === 'sansheng_codebase_map');
    assert.strictEqual(mapTool.permissionTier, 'workspace-read');
    assert.strictEqual(mapTool.riskLevel, 'low');

    const statusTool = mockTools.find(t => t.name === 'sansheng_task_status');
    assert.strictEqual(statusTool.permissionTier, 'read-only');
    assert.strictEqual(statusTool.riskLevel, 'low');

    const uatTool = mockTools.find(t => t.name === 'sansheng_uat_gate');
    assert.strictEqual(uatTool.permissionTier, 'workspace-write');
    assert.strictEqual(uatTool.riskLevel, 'medium');

    const archiveTool = mockTools.find(t => t.name === 'sansheng_archive');
    assert.strictEqual(archiveTool.permissionTier, 'workspace-write');
    assert.strictEqual(archiveTool.riskLevel, 'medium');

    const syncTool = mockTools.find(t => t.name === 'sansheng_sync_rules');
    assert.strictEqual(syncTool.permissionTier, 'workspace-write');
    assert.strictEqual(syncTool.riskLevel, 'medium');

    const workerTool = mockTools.find(t => t.name === 'sansheng_dispatch_worker');
    assert.strictEqual(workerTool.permissionTier, 'dangerous');
    assert.strictEqual(workerTool.riskLevel, 'high');
  });

  it('4. 高危工兵调度 (sansheng_dispatch_worker) 必须满足 Fail-Closed 审批阻断原则', async () => {
    SanshengPlugin.apply(mockContext, {});
    const workerTool = mockTools.find(t => t.name === 'sansheng_dispatch_worker');

    // 审批被拒绝模式
    approvalShouldPass = false;
    await assert.rejects(
      async () => {
        await workerTool.execute({
          taskId: 'TASK-01',
          taskTitle: '测试未授权高危任务',
          files: ['src/core.js']
        });
      },
      (err) => {
        assert.ok(err.message.includes('安全阻断'));
        assert.ok(err.message.includes('未获授权'));
        return true;
      }
    );

    assert.strictEqual(approvalCalls.length, 1);
    assert.strictEqual(approvalCalls[0].riskLevel, 'high');
  });

  it('5. 代码拓扑地图工具 (sansheng_codebase_map) 必须能成功执行并输出规约结构', async () => {
    SanshengPlugin.apply(mockContext, {});
    const mapTool = mockTools.find(t => t.name === 'sansheng_codebase_map');

    const result = await mapTool.execute({ maxDepth: 2, saveToFile: false });
    assert.strictEqual(result.success, true);
    assert.ok(result.preview);
    assert.ok(typeof result.preview === 'string');

    // 测试 UI render 管道
    const rendered = mapTool.output.render({}, result);
    assert.ok(Array.isArray(rendered));
    assert.strictEqual(rendered[0].type, 'text');
  });

  it('6. 跨 IDE 规则同步工具 (sansheng_sync_rules) 必须能正常触发', async () => {
    SanshengPlugin.apply(mockContext, {});
    const syncTool = mockTools.find(t => t.name === 'sansheng_sync_rules');

    const result = await syncTool.execute({});
    assert.strictEqual(result.success, true);
    assert.strictEqual(typeof result.totalDetected, 'number');
  });
});
