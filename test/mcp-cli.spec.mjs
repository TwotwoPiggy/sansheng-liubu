import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { createMcpServer, Shangshu } from '../src/index.js';

const cliPath = fileURLToPath(new URL('../bin/cli.js', import.meta.url));

describe('DSH + Antigravity 双模兼容测试套件 (MCP Server & CLI)', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sansheng-mcp-cli-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (_) {}
  });

  it('1. createMcpServer 支持标准 MCP initialize 与 tools/list (同源暴露全部 8 个工具)', async () => {
    const server = createMcpServer({ cwd: tmpDir });

    const initRes = await server.handleMessage({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2024-11-05' },
    });
    assert.strictEqual(initRes.result.serverInfo.name, 'sansheng-liubu');
    assert.ok(initRes.result.capabilities.tools);

    const listRes = await server.handleMessage({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
    });
    const names = listRes.result.tools.map(t => t.name);
    assert.strictEqual(names.length, 8);
    assert.ok(names.includes('sansheng_recall'));
    assert.ok(names.includes('sansheng_dispatch_worker'));

    const recallTool = listRes.result.tools.find(t => t.name === 'sansheng_recall');
    assert.strictEqual(recallTool.inputSchema.type, 'object');
    assert.ok(recallTool.inputSchema.required.includes('id'));
  });

  it('2. createMcpServer tools/call 可直接执行 sansheng_recall 与 sansheng_task_status', async () => {
    const shangshu = new Shangshu(tmpDir);
    shangshu.createTaskSlice({
      id: 'TASK-01',
      title: 'MCP 兼容验证',
      boundReqs: ['REQ-01'],
    }, {
      reqs: [{ id: 'REQ-01', title: '支持 Antigravity MCP', acs: ['暴露全部工具'] }],
    });

    const server = createMcpServer({ cwd: tmpDir });
    const callRes = await server.handleMessage({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'sansheng_recall',
        arguments: { id: 'TASK-01' },
      },
    });

    assert.strictEqual(callRes.result.isError, false);
    assert.strictEqual(callRes.result.structuredContent.found, true);
    assert.ok(callRes.result.content[0].text.includes('MCP 兼容验证'));
  });

  it('3. CLI 支持 sansheng recall --json 与 sansheng worker status --json', () => {
    const shangshu = new Shangshu(tmpDir);
    shangshu.createTaskSlice({
      id: 'TASK-02',
      title: 'CLI 链式召回验证',
      boundReqs: ['REQ-02'],
    });

    const recallStdout = execFileSync(process.execPath, [cliPath, 'recall', 'TASK-02', '--json'], {
      cwd: tmpDir,
      encoding: 'utf-8',
      windowsHide: true,
    });
    const recallJson = JSON.parse(recallStdout);
    assert.strictEqual(recallJson.found, true);
    assert.strictEqual(recallJson.id, 'TASK-02');

    const workerStdout = execFileSync(process.execPath, [cliPath, 'worker', 'status', '--json'], {
      cwd: tmpDir,
      encoding: 'utf-8',
      windowsHide: true,
    });
    const workerJson = JSON.parse(workerStdout);
    assert.ok(Array.isArray(workerJson));
  });
});
