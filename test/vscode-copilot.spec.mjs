import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import {
  parseJsonc,
  collectBuiltinAgents,
  collectBuiltinSkills,
  syncGlobalSkills,
  injectVSCodeEnhancements,
  syncGlobalVSCodeCopilot,
  inspectVSCodeCopilotStatus,
  RuleSync,
  createMcpServer,
  Shangshu,
  runUpdate,
} from '../src/index.js';

const cliPath = fileURLToPath(new URL('../bin/cli.js', import.meta.url));

describe('VS Code GitHub Copilot 原生全栈支持测试套件', () => {
  const tempDirs = [];
  const makeTmp = (prefix) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    tempDirs.push(dir);
    return dir;
  };

  afterEach(() => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch (_) {}
    }
  });

  it('1. parseJsonc 能够安全解析注释、字符串内 URL 与尾随逗号，且对损坏文本安全降级', () => {
    const raw = `{
      // VS Code 用户注释
      "editor.tabSize": 2,
      /* 块注释 */
      "homepage": "https://example.com/a//b/*c*/",
      "arr": [1, 2,],
    }`;
    const parsed = parseJsonc(raw);
    assert.strictEqual(parsed.ok, true);
    assert.strictEqual(parsed.data['editor.tabSize'], 2);
    assert.strictEqual(parsed.data.homepage, 'https://example.com/a//b/*c*/');
    assert.deepStrictEqual(parsed.data.arr, [1, 2]);

    const broken = parseJsonc('{ "a": 1, broken }');
    assert.strictEqual(broken.ok, false);
    assert.ok(broken.error);
  });

  it('2. injectVSCodeEnhancements 完整注入 Instructions / Skills / Custom Agents / Prompts / MCP / Settings / Tasks', () => {
    const ws = makeTmp('sansheng-copilot-ws-');
    const fakeHome = makeTmp('sansheng-copilot-home-');

    const res = injectVSCodeEnhancements(ws, {
      homeDir: fakeHome,
      includeGlobal: false,
      silent: true,
      commandExists: (cmd) => cmd === 'sansheng-mcp',
    });

    assert.strictEqual(res.success, true);

    // 2.1 Custom Instructions (带锚点)
    const instPath = path.join(ws, '.github', 'copilot-instructions.md');
    const instContent = fs.readFileSync(instPath, 'utf-8');
    assert.ok(instContent.includes('<!-- sansheng-liubu:start -->'));
    assert.ok(instContent.includes('<!-- sansheng-liubu:end -->'));
    assert.ok(instContent.includes('sansheng_audit_plan'));

    // 2.2 Workspace Agent Skills (.github/skills/)
    const builtinSkills = collectBuiltinSkills();
    assert.ok(builtinSkills.length >= 4);
    for (const skill of builtinSkills) {
      assert.ok(
        fs.existsSync(path.join(ws, '.github', 'skills', skill.name, 'SKILL.md')),
        `缺少工作区技能: ${skill.name}`
      );
    }

    // 2.3 Workspace Custom Agents (.github/agents/*.agent.md)
    const builtinAgents = collectBuiltinAgents();
    const agentNames = builtinAgents.map(a => a.name);
    assert.deepStrictEqual(agentNames.sort(), ['menxia', 'sansheng', 'shangshu', 'zhongshu']);
    for (const agent of builtinAgents) {
      const dest = path.join(ws, '.github', 'agents', agent.fileName);
      assert.ok(fs.existsSync(dest), `缺少 Custom Agent: ${agent.fileName}`);
      const body = fs.readFileSync(dest, 'utf-8');
      assert.ok(body.includes(`name: ${agent.name}`));
      assert.ok(body.includes('handoffs:'));
    }

    // 2.4 Prompt Files 使用官方 agent: 'agent' 而非废弃 mode:
    const promptBody = fs.readFileSync(path.join(ws, '.github', 'prompts', 'sansheng.prompt.md'), 'utf-8');
    assert.ok(promptBody.includes("agent: 'agent'"));
    assert.ok(!/^mode:/m.test(promptBody));

    // 2.5 .vscode/mcp.json 采用官方 servers + stdio 格式并挂载 sansheng-liubu
    const mcpJson = JSON.parse(fs.readFileSync(path.join(ws, '.vscode', 'mcp.json'), 'utf-8'));
    assert.ok(mcpJson.servers);
    assert.strictEqual(mcpJson.mcpServers, undefined);
    assert.strictEqual(mcpJson.servers['sansheng-liubu'].type, 'stdio');
    assert.strictEqual(mcpJson.servers['sansheng-liubu'].command, 'sansheng-mcp');
    assert.strictEqual(mcpJson.servers['sansheng-liubu'].cwd, '${workspaceFolder}');
    // 未安装 codebase-memory-mcp 时不应硬塞报错配置
    assert.strictEqual(mcpJson.servers['codebase-memory'], undefined);

    // 2.6 .vscode/settings.json 同时开启 chat.promptFiles 与 chat.useAgentSkills
    const settingsJson = JSON.parse(fs.readFileSync(path.join(ws, '.vscode', 'settings.json'), 'utf-8'));
    assert.strictEqual(settingsJson['chat.promptFiles'], true);
    assert.strictEqual(settingsJson['chat.useAgentSkills'], true);
  });

  it('3. 无损合并保护用户数据：JSONC 注释保留、旧 mcpServers 自动迁移、旧 Instructions 平滑升级、损坏文件不覆写', () => {
    const ws = makeTmp('sansheng-copilot-merge-');
    fs.mkdirSync(path.join(ws, '.github'), { recursive: true });
    fs.mkdirSync(path.join(ws, '.vscode'), { recursive: true });

    // 3.1 预置用户自定义 + 带注释的 settings.json
    fs.writeFileSync(
      path.join(ws, '.vscode', 'settings.json'),
      `{\n  // 用户自定义主题\n  "workbench.colorTheme": "Default Dark Modern",\n  "editor.fontSize": 14,\n}\n`,
      'utf-8'
    );

    // 3.2 预置旧版错误键 mcpServers 的 .vscode/mcp.json
    fs.writeFileSync(
      path.join(ws, '.vscode', 'mcp.json'),
      JSON.stringify({
        mcpServers: {
          'my-custom-mcp': { command: 'custom-bin', args: ['--flag'] },
        },
      }, null, 2),
      'utf-8'
    );

    // 3.3 预置旧版无锚点三省指令 + 外部同步规则
    fs.writeFileSync(
      path.join(ws, '.github', 'copilot-instructions.md'),
      `# GitHub Copilot Custom Instructions: 三省六部 (sansheng-liubu) 引擎\n\n旧版内容\n\n## 🔄 [多 AI IDE 外部同步规则集 (Auto-Synced)]\n### 📌 [CURSOR] my-rule\n保留我\n`,
      'utf-8'
    );

    // 3.4 预置用户自定义 tasks.json
    fs.writeFileSync(
      path.join(ws, '.vscode', 'tasks.json'),
      JSON.stringify({
        version: '2.0.0',
        tasks: [{ label: 'My Custom Build', type: 'shell', command: 'echo build' }],
      }, null, 2),
      'utf-8'
    );

    const res = injectVSCodeEnhancements(ws, {
      includeGlobal: false,
      silent: true,
      commandExists: () => false,
    });
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.mcp.migratedFromLegacy, true);

    // settings.json 原有键值 100% 保留
    const mergedSettings = JSON.parse(fs.readFileSync(path.join(ws, '.vscode', 'settings.json'), 'utf-8'));
    assert.strictEqual(mergedSettings['workbench.colorTheme'], 'Default Dark Modern');
    assert.strictEqual(mergedSettings['editor.fontSize'], 14);
    assert.strictEqual(mergedSettings['chat.promptFiles'], true);
    assert.strictEqual(mergedSettings['chat.useAgentSkills'], true);

    // mcp.json 自动迁移旧 mcpServers -> servers，且保留用户 custom server，无全局命令时回退 npx
    const mergedMcp = JSON.parse(fs.readFileSync(path.join(ws, '.vscode', 'mcp.json'), 'utf-8'));
    assert.strictEqual(mergedMcp.mcpServers, undefined);
    assert.strictEqual(mergedMcp.servers['my-custom-mcp'].type, 'stdio');
    assert.strictEqual(mergedMcp.servers['my-custom-mcp'].command, 'custom-bin');
    assert.strictEqual(mergedMcp.servers['sansheng-liubu'].command, 'npx');

    // copilot-instructions.md 平滑升级带锚点并保留 RuleSync 外部规则
    const upgradedInst = fs.readFileSync(path.join(ws, '.github', 'copilot-instructions.md'), 'utf-8');
    assert.ok(upgradedInst.includes('<!-- sansheng-liubu:start -->'));
    assert.ok(upgradedInst.includes('保留我'));
    assert.ok(!upgradedInst.includes('旧版内容'));

    // tasks.json 保留用户任务并追加三省任务
    const mergedTasks = JSON.parse(fs.readFileSync(path.join(ws, '.vscode', 'tasks.json'), 'utf-8'));
    assert.ok(mergedTasks.tasks.some(t => t.label === 'My Custom Build'));
    assert.ok(mergedTasks.tasks.some(t => t.command === 'sansheng map'));

    // 3.5 严重损坏的 settings.json 绝对不得覆盖清空
    const brokenContent = '{ invalid json !!!';
    fs.writeFileSync(path.join(ws, '.vscode', 'settings.json'), brokenContent, 'utf-8');
    const brokenRes = injectVSCodeEnhancements(ws, { includeGlobal: false, silent: true });
    assert.strictEqual(brokenRes.settings.status, 'skipped_invalid');
    assert.strictEqual(fs.readFileSync(path.join(ws, '.vscode', 'settings.json'), 'utf-8'), brokenContent);
  });

  it('4. 全局同步支持 ~/.copilot/skills、~/.agents/skills、~/.copilot/agents、mcp-config.json 与 Code/User/mcp.json', () => {
    const fakeHome = makeTmp('sansheng-copilot-global-');
    const ws = makeTmp('sansheng-copilot-ws-check-');
    const vscodeUserDir = path.join(fakeHome, 'AppData', 'Roaming', 'Code', 'User');
    fs.mkdirSync(path.join(fakeHome, '.copilot'), { recursive: true });
    fs.mkdirSync(path.join(fakeHome, '.agents'), { recursive: true });
    fs.mkdirSync(vscodeUserDir, { recursive: true });

    // 4.1 syncGlobalSkills 自动发现 copilot 与 agents
    const skillsRes = syncGlobalSkills({ homeDir: fakeHome, silent: true });
    assert.ok(skillsRes.detectedRuntimes.includes('copilot'));
    assert.ok(skillsRes.detectedRuntimes.includes('agents'));
    assert.ok(fs.existsSync(path.join(fakeHome, '.copilot', 'skills', 'sansheng-liubu', 'SKILL.md')));
    assert.ok(fs.existsSync(path.join(fakeHome, '.agents', 'skills', 'sansheng-recall', 'SKILL.md')));

    // 4.2 syncGlobalVSCodeCopilot 写入全局 Agents、Prompts、~/.copilot/mcp-config.json 与 Code/User/mcp.json
    const globalRes = syncGlobalVSCodeCopilot({
      homeDir: fakeHome,
      platform: 'win32',
      includeGlobalMcp: true,
      commandExists: () => false, // 模拟 Git 本地开发无全局命令，自动指向 bin/mcp.js
      silent: true,
    });

    assert.strictEqual(globalRes.warnings.length, 0);
    assert.ok(fs.existsSync(path.join(fakeHome, '.copilot', 'agents', 'sansheng.agent.md')));
    assert.ok(fs.existsSync(path.join(fakeHome, '.copilot', 'agents', 'menxia.agent.md')));
    assert.ok(fs.existsSync(path.join(vscodeUserDir, 'prompts', 'sansheng.prompt.md')));
    // 未安装 Insiders 时不应凭空创建
    assert.strictEqual(fs.existsSync(path.join(fakeHome, 'AppData', 'Roaming', 'Code - Insiders')), false);

    const copilotMcp = JSON.parse(fs.readFileSync(path.join(fakeHome, '.copilot', 'mcp-config.json'), 'utf-8'));
    assert.ok(copilotMcp.mcpServers['sansheng-liubu']);
    assert.ok(copilotMcp.mcpServers['sansheng-liubu'].args[0].endsWith(path.join('bin', 'mcp.js')));

    const userMcp = JSON.parse(fs.readFileSync(path.join(vscodeUserDir, 'mcp.json'), 'utf-8'));
    assert.strictEqual(userMcp.servers['sansheng-liubu'].type, 'stdio');
    assert.ok(userMcp.servers['sansheng-liubu'].args[0].endsWith(path.join('bin', 'mcp.js')));

    // 4.3 inspectVSCodeCopilotStatus 完整诊断工作区与全局状态
    const beforeStatus = inspectVSCodeCopilotStatus(ws, { homeDir: fakeHome, platform: 'win32' });
    assert.strictEqual(beforeStatus.workspaceReady, false);
    assert.strictEqual(beforeStatus.globalReady, true);

    injectVSCodeEnhancements(ws, { homeDir: fakeHome, platform: 'win32', includeGlobal: false, silent: true });
    const afterStatus = inspectVSCodeCopilotStatus(ws, { homeDir: fakeHome, platform: 'win32' });
    assert.strictEqual(afterStatus.workspaceReady, true);
    assert.strictEqual(afterStatus.globalReady, true);
  });

  it('5. RuleSync 将带 globs 的外部规则规范转译为 .github/instructions/*.instructions.md，并支持导出至 copilot', () => {
    const ws = makeTmp('sansheng-rulesync-copilot-');
    fs.mkdirSync(path.join(ws, '.cursor', 'rules'), { recursive: true });
    fs.mkdirSync(path.join(ws, '.catpaw', 'prompts'), { recursive: true });

    // 全局常驻规则
    fs.writeFileSync(path.join(ws, '.cursorrules'), 'Always use strict TypeScript types.\n', 'utf-8');
    // 带 globs 的条件规则 -> 必须落盘至 .github/instructions/
    fs.writeFileSync(
      path.join(ws, '.cursor', 'rules', 'vue-rules.mdc'),
      `---\ndescription: Vue 3 编写规范\nglobs: "**/*.vue"\n---\n使用 script setup 语法。\n`,
      'utf-8'
    );
    // 手动 Prompt -> 落盘至 .github/prompts/
    fs.writeFileSync(
      path.join(ws, '.catpaw', 'prompts', 'review.md'),
      `---\ndescription: 代码审查模板\n---\n检查潜在安全风险。\n`,
      'utf-8'
    );

    const res = RuleSync.syncAll(ws, { includeGlobalPrompts: false });
    assert.strictEqual(res.totalDetected, 3);
    assert.strictEqual(res.globalRules, 1);
    assert.strictEqual(res.instructionRules, 1);
    assert.strictEqual(res.promptRules, 1);

    // 校验 .github/instructions/vue-rules.instructions.md
    const instFile = path.join(ws, '.github', 'instructions', 'vue-rules.instructions.md');
    assert.ok(fs.existsSync(instFile));
    const instText = fs.readFileSync(instFile, 'utf-8');
    assert.ok(instText.includes('applyTo: "**/*.vue"'));
    // 不应错写到 .github/prompts/
    assert.strictEqual(fs.existsSync(path.join(ws, '.github', 'prompts', 'vue-rules.prompt.md')), false);

    // 校验 .github/prompts/review.prompt.md 使用 agent: 'agent'
    const promptFile = path.join(ws, '.github', 'prompts', 'review.prompt.md');
    assert.ok(fs.existsSync(promptFile));
    assert.ok(fs.readFileSync(promptFile, 'utf-8').includes("agent: 'agent'"));

    // 校验反向导出到 copilot
    RuleSync.exportToIDE('copilot', ws);
    assert.ok(fs.readFileSync(path.join(ws, '.github', 'copilot-instructions.md'), 'utf-8').includes('Always use strict TypeScript'));
  });

  it('6. MCP Server 修复 sansheng_audit_plan inputSchema 并支持多工作区 cwd 透传', async () => {
    const serverWs = makeTmp('sansheng-mcp-default-');
    const targetWs = makeTmp('sansheng-mcp-target-');

    const shangshu = new Shangshu(targetWs);
    shangshu.createTaskSlice({
      id: 'TASK-09',
      title: '多工作区 Copilot MCP 测试',
      boundReqs: ['REQ-09'],
    });

    const server = createMcpServer({ cwd: serverWs });
    const listRes = await server.handleMessage({ jsonrpc: '2.0', id: 1, method: 'tools/list' });

    const auditTool = listRes.result.tools.find(t => t.name === 'sansheng_audit_plan');
    assert.ok(auditTool);
    assert.ok(auditTool.inputSchema.properties.requirements, 'sansheng_audit_plan 必须暴露 requirements 参数');
    assert.ok(auditTool.inputSchema.properties.plan, 'sansheng_audit_plan 必须暴露 plan 参数');
    assert.strictEqual(auditTool.inputSchema.properties.properties, undefined, '不得存在损坏的 properties 参数');

    // 所有 9 个工具均具备合法 schema 与可选 cwd 参数
    for (const tool of listRes.result.tools) {
      assert.strictEqual(tool.inputSchema.type, 'object');
      assert.ok(tool.inputSchema.properties.cwd, `${tool.name} 应支持可选 cwd 参数`);
      for (const prop of Object.values(tool.inputSchema.properties)) {
        if (prop.type === 'array') {
          assert.ok(prop.items, `${tool.name} 的 array 参数必须包含 items`);
        }
      }
    }

    // 通过 arguments.cwd 跨目录查询 targetWs 的任务状态
    const statusRes = await server.handleMessage({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name: 'sansheng_task_status', arguments: { cwd: targetWs } },
    });
    assert.strictEqual(statusRes.result.isError, false);
    assert.strictEqual(statusRes.result.structuredContent.exists, true);
    assert.strictEqual(statusRes.result.structuredContent.totalTasks, 1);
  });

  it('7. runUpdate 与 CLI `sansheng copilot setup/status` 端到端完整工作', async () => {
    const ws = makeTmp('sansheng-copilot-cli-');
    const fakeHome = makeTmp('sansheng-copilot-upd-home-');
    fs.mkdirSync(path.join(fakeHome, '.copilot'), { recursive: true });

    // 7.1 runUpdate 自动检测 .copilot 并同时同步 Skills 与 Custom Agents
    const updRes = await runUpdate({
      skipNpm: true,
      skipWorkspace: true,
      cwd: ws,
      homeDir: fakeHome,
      silent: true,
    });
    assert.strictEqual(updRes.success, true);
    assert.ok(updRes.skillsResult.detectedRuntimes.includes('copilot'));
    assert.ok(fs.existsSync(path.join(fakeHome, '.copilot', 'skills', 'sansheng-liubu', 'SKILL.md')));
    assert.ok(fs.existsSync(path.join(fakeHome, '.copilot', 'agents', 'sansheng.agent.md')));

    // 7.2 CLI `sansheng copilot setup --workspace-only --json`
    const setupStdout = execFileSync(
      process.execPath,
      [cliPath, 'copilot', 'setup', '--workspace-only', '--json'],
      { cwd: ws, encoding: 'utf-8', windowsHide: true }
    );
    const setupJson = JSON.parse(setupStdout);
    assert.strictEqual(setupJson.success, true);
    assert.ok(fs.existsSync(path.join(ws, '.github', 'agents', 'sansheng.agent.md')));
    assert.ok(fs.existsSync(path.join(ws, '.github', 'skills', 'sansheng-liubu', 'SKILL.md')));
    assert.ok(fs.existsSync(path.join(ws, '.vscode', 'mcp.json')));

    // 7.3 CLI `sansheng copilot status --json`
    const statusStdout = execFileSync(
      process.execPath,
      [cliPath, 'copilot', 'status', '--json'],
      { cwd: ws, encoding: 'utf-8', windowsHide: true }
    );
    const statusJson = JSON.parse(statusStdout);
    assert.strictEqual(statusJson.workspaceReady, true);
    assert.strictEqual(statusJson.workspace.mcp.hasSansheng, true);
    assert.strictEqual(statusJson.workspace.settings.agentSkillsEnabled, true);
  });
});
