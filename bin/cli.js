#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { extractCodebaseMap, queryFocusedMap, clearMapCache } from '../src/tools/codebase-map.js';
import { runInteractiveUAT } from '../src/core/uat-runner.js';
import { exportUATHtml, serveUATHtml, watchUATHtml } from '../src/core/uat-html-compiler.js';
import { executeArchive } from '../src/core/shangshu.js';
import { runUpdate, getLocalVersion } from '../src/core/updater.js';
import { promptAndInstallYongle } from '../src/tools/yongle-installer.js';
import { LSPClient } from '../src/tools/lsp-client.js';
import { CBMBridge } from '../src/tools/cbm-bridge.js';
import { injectVSCodeEnhancements } from '../src/tools/vscode-injector.js';
import { RuleSync } from '../src/tools/rule-sync.js';
import { Menxia } from '../src/core/menxia.js';
import { recallById } from '../src/core/recall.js';
import { SubagentAdapter } from '../src/tools/subagent-adapter.js';
import { startMcpServer } from '../src/mcp/server.js';

const args = process.argv.slice(2);
const command = args[0] || 'help';

if (command !== 'mcp' && !args.includes('--json')) {
  console.log(`🏛️ 【三省六部 (sansheng-liubu)】AI 研发工作流引擎 v${getLocalVersion()}`);
}

async function main() {
  switch (command) {
    case 'init':
      await initProject();
      break;
    case 'sync-rules':
    case 'rules':
      handleRulesCommand();
      break;
    case 'update':
    case 'upgrade':
      await runUpdate(args.slice(1));
      break;
    case 'map':
      generateMap();
      break;
    case 'status':
      showStatus();
      break;
    case 'audit':
    case 'audit-plan':
      handleAuditPlanCommand();
      break;
    case 'html':
    case 'uat-html':
      await handleExportHtml(args.slice(1));
      break;
    case 'uat':
      try { exportUATHtml(); } catch (e) {}
      await runInteractiveUAT();
      try { exportUATHtml(); } catch (e) {}
      break;
    case 'archive':
      executeArchive();
      break;
    case 'recall':
      handleRecallCommand(args.slice(1));
      break;
    case 'worker':
      handleWorkerCommand(args.slice(1));
      break;
    case 'mcp':
      startMcpServer({ cwd: process.cwd() });
      break;
    case 'help':
    default:
      showHelp();
      break;
  }
}

function handleAuditPlanCommand() {
  const cwd = process.cwd();
  const sanshengTask = path.join(cwd, '.sansheng', 'TASK.md');
  const rootTask = path.join(cwd, 'TASK.md');
  const taskPath = fs.existsSync(sanshengTask) ? sanshengTask : (fs.existsSync(rootTask) ? rootTask : null);

  if (!taskPath) {
    console.log(`⚠️ 未找到活跃的 TASK.md（已检查 .sansheng/TASK.md 与 TASK.md）。请先输入需求启动对齐。`);
    return;
  }

  const content = fs.readFileSync(taskPath, 'utf-8');
  const menxia = new Menxia();
  const auditResult = menxia.auditPlan(content, content);
  const report = menxia.generateRejectionReport(auditResult);
  console.log(`\n${report}\n`);
}

async function initProject() {
  const cwd = process.cwd();
  
  // 1. 交互式检测并引导安装《永乐大典》
  const yongleActive = await promptAndInstallYongle();

  // 2. 探测本地 LSP 语言服务器与 CBM 图数据库
  const csharpLsp = LSPClient.detectServer('csharp');
  const vueLsp = LSPClient.detectServer('vue');
  const cbm = CBMBridge.detectCBM();

  console.log(`⚡ [代码智能与图谱环境检测]`);
  console.log(`   ➔ C# LSP (${csharpLsp.command}): ${csharpLsp.installed ? '✅ 已就绪' : `⚠️ 未安装 (推荐: ${csharpLsp.tip})`}`);
  console.log(`   ➔ Vue LSP (${vueLsp.command}): ${vueLsp.installed ? '✅ 已就绪' : `⚠️ 未安装 (推荐: ${vueLsp.tip})`}`);
  console.log(`   ➔ CBM 知识图谱 (codebase-memory-mcp): ${cbm.installed ? '✅ 已就绪 (15 个 MCP 架构工具已激活)' : `⚠️ 未安装 (推荐: ${cbm.tip})`}`);

  // 3. 自动注入 VS Code 与 GitHub Copilot 专属增强套件
  injectVSCodeEnhancements(cwd);

  // 4. 初始化工作区配置与 .sansheng 目录
  const sanshengDir = path.join(cwd, '.sansheng');
  if (!fs.existsSync(sanshengDir)) fs.mkdirSync(sanshengDir, { recursive: true });
  const archiveDir = path.join(sanshengDir, 'archive');
  if (!fs.existsSync(archiveDir)) fs.mkdirSync(archiveDir, { recursive: true });

  const configPath = path.join(sanshengDir, 'config.json');
  const legacyConfigPath = path.join(cwd, '.sanshengrc.json');

  if (!fs.existsSync(configPath)) {
    if (fs.existsSync(legacyConfigPath)) {
      // 平滑迁移旧配置
      fs.copyFileSync(legacyConfigPath, configPath);
      console.log(`✅ 已将旧配置平滑迁移至: .sansheng/config.json`);
    } else {
      const defaultConfig = {
        models: {
          architect_tier: "gemini-3.7-flash",
          worker_tier: "deepseek-v3",
          fallback_tier: "gemini-3.7-flash"
        },
        escalation: { enabled: true, max_retries: 2 },
        stack: {
          backend: { framework: "dotnet8", lsp_server: csharpLsp.command },
          frontend: { framework: "vue3-element", lsp_server: vueLsp.command }
        },
        code_intelligence: {
          cbm_enabled: cbm.installed,
          lsp_enabled: csharpLsp.installed
        },
        yongle_dadian: {
          enabled: yongleActive,
          auto_recall_on_align: true,
          auto_postmortem_on_fix: true
        }
      };
      fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2), 'utf-8');
      console.log(`✅ 已在当前工作区初始化配置: .sansheng/config.json`);
    }
  } else {
    console.log(`ℹ️ .sansheng/config.json 已存在。`);
  }

  // 5. 初始化 .sansheng/ROADMAP.md
  const roadmapPath = path.join(sanshengDir, 'ROADMAP.md');
  const legacyRoadmapPath = path.join(cwd, 'ROADMAP.md');
  if (!fs.existsSync(roadmapPath)) {
    if (fs.existsSync(legacyRoadmapPath)) {
      fs.copyFileSync(legacyRoadmapPath, roadmapPath);
      console.log(`✅ 已将旧总纲平滑迁移至: .sansheng/ROADMAP.md`);
    } else {
      const defaultRoadmap = `# 🗺️ 项目总纲 (ROADMAP.md)\n\n- [ ] Phase 1: 核心业务引擎与基础架构 (Active 🔥)\n- [ ] Phase 2: 复杂业务与多租户权限\n- [ ] Phase 3: 监控与运维交付\n`;
      fs.writeFileSync(roadmapPath, defaultRoadmap, 'utf-8');
      console.log(`✅ 已创建全局总纲: .sansheng/ROADMAP.md`);
    }
  } else {
    console.log(`ℹ️ .sansheng/ROADMAP.md 已存在。`);
  }

  // 6. 嗅探并自动同步 Trae / CatPaw / Qoder / Cursor 等外部 IDE 规则
  const detectedSources = RuleSync.detectSources(cwd);
  if (detectedSources.length > 0) {
    console.log(`\n🔄 [自动发现外部 AI IDE 规则]`);
    RuleSync.syncAll(cwd);
  }
}

function handleRulesCommand() {
  const cwd = process.cwd();
  const exportIdx = args.indexOf('--export');
  if (exportIdx > -1 && args[exportIdx + 1]) {
    const targets = args[exportIdx + 1].split(',');
    targets.forEach(t => RuleSync.exportToIDE(t.trim(), cwd));
  } else {
    RuleSync.syncAll(cwd);
  }
}

function generateMap() {
  const cwd = process.cwd();
  const clearCacheIdx = args.indexOf('--clear-cache');
  if (clearCacheIdx > -1) {
    clearMapCache(cwd);
    console.log(`🧹 已成功清理代码拓扑增量缓存 (.sansheng/cache/map_cache.json)。`);
  }

  const focusIdx = args.indexOf('--focus');
  if (focusIdx > -1 && args[focusIdx + 1]) {
    const focusTarget = args[focusIdx + 1];
    console.log(`🎯 正在提取针对 \`${focusTarget}\` 的聚焦拓扑切片 (JIT Slice)...`);
    const slice = queryFocusedMap(cwd, focusTarget, { budget: 2000 });
    console.log(`\n` + slice);
    return;
  }

  const isFull = args.includes('--full');
  console.log(`🔍 正在扫描代码库并提取 AST 符号与依赖拓扑 (模式: ${isFull ? '全量平铺' : 'Top-K 枢纽收敛'})...`);
  const startTime = Date.now();
  const mapContent = extractCodebaseMap(cwd, 4, { full: isFull });
  const duration = Date.now() - startTime;

  const sanshengDir = path.join(cwd, '.sansheng');
  if (!fs.existsSync(sanshengDir)) fs.mkdirSync(sanshengDir, { recursive: true });
  const outputPath = path.join(sanshengDir, 'codebase_map.md');
  fs.writeFileSync(outputPath, mapContent, 'utf-8');

  console.log(`✅ 代码拓扑地图已就绪 (${duration}ms):`);
  console.log(`   ➔ 📄 人类与模型可读骨架: .sansheng/codebase_map.md (Token 压缩率 > 95%)`);
  console.log(`   ➔ 📊 机器结构化图谱索引: .sansheng/codebase_index.json`);
  console.log(`   ➔ ⚡ 增量指纹缓存已激活: .sansheng/cache/map_cache.json`);
}

function showStatus() {
  const cwd = process.cwd();
  const sanshengTask = path.join(cwd, '.sansheng/TASK.md');
  const rootTask = path.join(cwd, 'TASK.md');
  const taskPath = fs.existsSync(sanshengTask) ? sanshengTask : (fs.existsSync(rootTask) ? rootTask : sanshengTask);

  if (!fs.existsSync(taskPath)) {
    console.log(`⚠️ 当前未检测到活跃的 TASK.md（已检查 .sansheng/TASK.md 与 TASK.md）。请直接在对话框输入需求开启中书省 ALIGN 对齐。`);
    return;
  }
  const content = fs.readFileSync(taskPath, 'utf-8');
  const lines = content.split('\n');
  const tasks = lines.filter(l => l.trim().startsWith('- [ ]') || l.trim().startsWith('- [x]'));
  console.log(`\n📦 当前活跃阶段进度 (${path.relative(cwd, taskPath)}):`);
  tasks.forEach(t => console.log(`  ${t}`));
  console.log(`\n👉 回复 c (全自动推进) 或 s (单步推进)`);
}

async function handleExportHtml(cliArgs = []) {
  const isWatch = cliArgs.includes('--watch') || cliArgs.includes('-w');
  const isServe = cliArgs.includes('--serve') || cliArgs.includes('-s');
  const portIdx = cliArgs.indexOf('--port');
  const customPort = portIdx > -1 && cliArgs[portIdx + 1] ? parseInt(cliArgs[portIdx + 1], 10) : 3901;

  // 提取路径参数（排除 flag 参数及其参数值）
  const targetPath = cliArgs.find((arg, idx) => {
    if (arg.startsWith('-')) return false;
    if (idx > 0 && cliArgs[idx - 1] === '--port') return false;
    return true;
  });

  if (isWatch) {
    try {
      console.log(`👀 正在监听本地任务/测试计划变动并自动重新编译 uat.html...`);
      const watcher = watchUATHtml({ taskPath: targetPath }, (rebuildRes) => {
        const timeStr = new Date().toLocaleTimeString();
        console.log(`[${timeStr}] ⚡ 检测到 ${path.basename(rebuildRes.taskPath)} 变动，已自动重新编译: ${rebuildRes.outputPath} (${rebuildRes.uatCount} 项)`);
      });
      console.log(`   ➔ 📄 监听目标: ${path.relative(process.cwd(), watcher.taskPath)}`);
      console.log(`   ➔ 🎯 输出路径: ${path.relative(process.cwd(), watcher.outputPath)}`);
      console.log(`👉 提示: 外部或编辑器保存文件即可自动触发重构编译，按 Ctrl+C 安全退出。\n`);
      await new Promise(() => {});
    } catch (e) {
      console.log(`\n⚠️ 启动监听失败: ${e.message}\n`);
    }
    return;
  }

  if (isServe) {
    try {
      console.log(`🚀 正在启动 0 依赖 UAT 本地实时热同步服务器...`);
      const { url, fileName, taskPath } = await serveUATHtml({
        taskPath: targetPath,
        port: customPort,
      });
      console.log(`\n🎉 本地 UAT 热同步服务已就绪！`);
      console.log(`   ➔ 📄 绑定文件: ${fileName} (${path.relative(process.cwd(), taskPath)})`);
      console.log(`   ➔ 🌐 访问地址: ${url}`);
      console.log(`   ➔ ⚡ 实时双向热同步已激活：在浏览器中勾选将免授权即时写回磁盘，外部修改亦自动刷新！`);
      console.log(`\n👉 提示: 按 Ctrl+C 即可安全退出服务。\n`);

      // 自动尝试打开系统默认浏览器
      try {
        const { exec } = await import('child_process');
        if (process.platform === 'win32') {
          exec(`start ${url}`);
        } else if (process.platform === 'darwin') {
          exec(`open ${url}`);
        } else {
          exec(`xdg-open ${url}`);
        }
      } catch (e) {}

      // 保持进程常驻服务请求
      await new Promise(() => {});
    } catch (e) {
      console.log(`\n⚠️ 启动热同步服务失败: ${e.message}\n`);
    }
    return;
  }

  const res = exportUATHtml({ taskPath: targetPath });
  if (res.success) {
    console.log(`\n🎉 ${res.message}`);
    console.log(`💡 提示: 看板内已增加【📥 从本地 MD 重载更新】与【💾 立即同步到 MD】双向快捷按钮！`);
    console.log(`💡 高级提示: 您也可使用 \`sansheng html --watch\` (自动监听重构) 或 \`sansheng html --serve\` (免授权实时服务)。\n`);
  } else {
    console.log(`\n⚠️ ${res.message}\n`);
  }
}

function showHelp() {
  console.log(`
用法:
  sansheng init                 初始化三省六部工作区 (收敛配置与总纲至 .sansheng/，注入 VS Code 增强)
  sansheng sync-rules           嗅探 Trae/CatPaw/Qoder/Cursor 规则并智能转译同步至 VS Code Copilot
  sansheng sync-rules --export  反向导出集中规则至指定 IDE (如 --export trae,catpaw,qoder)
  sansheng update               从 NPM 检查并原地升级至最新版本，无损增量同步工作区配置与 IDE 规则
                                (参数: --check 仅检查版本, --skip-npm 仅同步工作区, --force 强制重装)
  sansheng map                  生成双层拓扑地图与索引 (.sansheng/codebase_map.md & codebase_index.json)
                                (参数: --focus <path> 提取局部邻居切片, --clear-cache 清理增量指纹)
  sansheng status               查看当前活跃阶段的 3 行 HUD 任务进度
  sansheng audit-plan           门下省门禁：对开发计划 Plan 进行 100% 反向需求对账审计与封驳检测
  sansheng html [path]          0 Token 将已有项目的 task.md 或 test-plan.md 编译为本地交互式网页验收看板 (.sansheng/uat.html)
                                (参数: --watch / -w 监听文件变动并自动重新编译, --serve / -s 启动免授权本地实时双向服务)
  sansheng uat                  启动交互式单项 UAT 验收与自愈修复循环
  sansheng archive              执行项目两级归档并同步至《永乐大典》
  sansheng recall <id>          链式召回指定对象 (TASK-xx / REQ-xx / UAT-xx / JOB-xx / ARCHIVE)
                                (参数: --offset N, --limit N, --json)
  sansheng worker <action>      全双工异步工兵控制 (start [taskId] [title] [--cmd ...], status [jobId], stop <jobId>)
  sansheng mcp                  启动标准 stdio MCP Server (供 Antigravity / VS Code 等直接挂载)
  `);
}

function getFlagValue(cliArgs, flagName, fallback = undefined) {
  const idx = cliArgs.indexOf(flagName);
  if (idx > -1 && cliArgs[idx + 1] !== undefined) {
    return cliArgs[idx + 1];
  }
  return fallback;
}

function handleRecallCommand(cliArgs = []) {
  const targetId = cliArgs.find((a, idx) => !a.startsWith('-') && (idx === 0 || !['--offset', '--limit'].includes(cliArgs[idx - 1])));
  const offset = parseInt(getFlagValue(cliArgs, '--offset', '0'), 10) || 0;
  const limit = parseInt(getFlagValue(cliArgs, '--limit', '2000'), 10) || 2000;
  const asJson = cliArgs.includes('--json');

  const res = recallById(targetId, { cwd: process.cwd(), offset, limit });
  if (asJson) {
    console.log(JSON.stringify(res, null, 2));
    return;
  }

  if (!res.found) {
    console.log(`\n⚠️ [链式召回] ${res.message}\n`);
    return;
  }

  console.log(`\n🔍 [链式召回: ${res.id}] (${res.type} | 来源: ${res.source})\n`);
  console.log(res.content);
  if (res.truncated) {
    console.log(`\n📄 已截断 (${res.offset}~${res.offset + res.content.length} / ${res.totalLength} 字符)，使用 --offset ${res.nextOffset} 可续读。`);
  }
  if ((res.related || []).length > 0) {
    console.log(`\n🔗 下一跳关联指针:`);
    res.related.forEach(r => console.log(`  - [${r.id}] (${r.type}): ${r.summary}`));
  }
  console.log();
}

function handleWorkerCommand(cliArgs = []) {
  const sub = cliArgs[0] || 'status';
  const asJson = cliArgs.includes('--json');
  const adapter = new SubagentAdapter({}, { cwd: process.cwd() });

  if (sub === 'status') {
    const jobId = cliArgs[1] && !cliArgs[1].startsWith('-') ? cliArgs[1] : null;
    const res = jobId ? adapter.getJobStatus(jobId) : adapter.listJobs();
    if (asJson) {
      console.log(JSON.stringify(res, null, 2));
      return;
    }
    if (Array.isArray(res)) {
      if (res.length === 0) {
        console.log(`\n📊 当前无后台工兵记录。\n`);
      } else {
        console.log(`\n📊 [六部后台工兵看板] 共 ${res.length} 条记录:`);
        res.slice(0, 10).forEach(j => console.log(`  - [${j.jobId}] (${j.taskId}) ${j.status} | 模型: ${j.modelUsed || j.model}`));
        console.log();
      }
      return;
    }
    if (!res.found) {
      console.log(`\n⚠️ ${res.message}\n`);
      return;
    }
    console.log(`\n📊 [Job ${res.jobId}] 状态: ${res.status} | 任务: [${res.taskId}]`);
    if (res.logTail) console.log(`最近日志:\n${res.logTail}`);
    console.log();
    return;
  }

  if (sub === 'stop') {
    const jobId = cliArgs[1];
    const res = adapter.stopJob(jobId);
    console.log(asJson ? JSON.stringify(res, null, 2) : `\n🛑 ${res.message}\n`);
    return;
  }

  if (sub === 'start') {
    const positional = [];
    for (let i = 1; i < cliArgs.length; i++) {
      if (['--cmd', '--id', '--title'].includes(cliArgs[i])) {
        i++;
        continue;
      }
      if (!cliArgs[i].startsWith('-')) {
        positional.push(cliArgs[i]);
      }
    }

    let taskId = getFlagValue(cliArgs, '--id');
    let taskTitle = getFlagValue(cliArgs, '--title');
    const testCmd = getFlagValue(cliArgs, '--cmd');

    if (positional.length >= 2) {
      taskId = taskId || positional[0];
      taskTitle = taskTitle || positional[1];
    } else if (positional.length === 1) {
      if (/^(TASK|REQ|UAT|JOB)-/i.test(positional[0])) {
        taskId = taskId || positional[0];
      } else {
        taskTitle = taskTitle || positional[0];
      }
    }

    const res = adapter.startJob({
      ...(taskId ? { id: taskId } : {}),
      ...(taskTitle ? { title: taskTitle } : {}),
      ...(testCmd ? { testCmd } : {}),
    });
    console.log(asJson ? JSON.stringify(res, null, 2) : `\n🚀 ${res.message} (jobId: ${res.jobId})\n`);
    return;
  }

  console.log(`\n⚠️ 未知 worker 动作: ${sub}，支持 start / status / stop\n`);
}

main().catch(err => {
  console.error('执行失败:', err);
});
