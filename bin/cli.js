#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { extractCodebaseMap } from '../src/tools/codebase-map.js';
import { runInteractiveUAT } from '../src/core/uat-runner.js';
import { executeArchive } from '../src/core/shangshu.js';
import { runUpdate } from '../src/core/updater.js';
import { promptAndInstallYongle } from '../src/tools/yongle-installer.js';
import { LSPClient } from '../src/tools/lsp-client.js';
import { CBMBridge } from '../src/tools/cbm-bridge.js';
import { injectVSCodeEnhancements } from '../src/tools/vscode-injector.js';
import { RuleSync } from '../src/tools/rule-sync.js';

const args = process.argv.slice(2);
const command = args[0] || 'help';

console.log(`🏛️ 【三省六部 (sansheng-liubu)】AI 研发工作流引擎 v1.2.1`);

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
    case 'uat':
      await runInteractiveUAT();
      break;
    case 'archive':
      executeArchive();
      break;
    case 'help':
    default:
      showHelp();
      break;
  }
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
  console.log(`🔍 正在扫描代码库并提取 AST 符号骨架 (C# / Vue 3)...`);
  const mapContent = extractCodebaseMap(process.cwd());
  const sanshengDir = path.join(process.cwd(), '.sansheng');
  if (!fs.existsSync(sanshengDir)) fs.mkdirSync(sanshengDir, { recursive: true });
  const outputPath = path.join(sanshengDir, 'codebase_map.md');
  fs.writeFileSync(outputPath, mapContent, 'utf-8');
  console.log(`✅ AST 代码骨架已生成: .sansheng/codebase_map.md (Token 压缩率 > 95%)`);
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

function showHelp() {
  console.log(`
用法:
  sansheng init                 初始化三省六部工作区 (收敛配置与总纲至 .sansheng/，注入 VS Code 增强)
  sansheng sync-rules           嗅探 Trae/CatPaw/Qoder/Cursor 规则并智能转译同步至 VS Code Copilot
  sansheng sync-rules --export  反向导出集中规则至指定 IDE (如 --export trae,catpaw,qoder)
  sansheng update               从 NPM 检查并原地升级至最新版本，无损增量同步工作区配置与 IDE 规则
                                (参数: --check 仅检查版本, --skip-npm 仅同步工作区, --force 强制重装)
  sansheng map                  提取当前项目 AST 符号骨架 (.sansheng/codebase_map.md)
  sansheng status               查看当前活跃阶段的 3 行 HUD 任务进度
  sansheng uat                  启动交互式单项 UAT 验收与自愈修复循环
  sansheng archive              执行项目两级归档并同步至《永乐大典》
  `);
}

main().catch(err => {
  console.error('执行失败:', err);
});
