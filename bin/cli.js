#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { extractCodebaseMap } from '../src/tools/codebase-map.js';
import { runInteractiveUAT } from '../src/core/uat-runner.js';
import { executeArchive } from '../src/core/shangshu.js';
import { runUpdate } from '../src/core/updater.js';
import { promptAndInstallYongle } from '../src/tools/yongle-installer.js';

const args = process.argv.slice(2);
const command = args[0] || 'help';

console.log(`🏛️ 【三省六部 (sansheng-liubu)】AI 研发工作流引擎 v1.2`);

async function main() {
  switch (command) {
    case 'init':
      await initProject();
      break;
    case 'update':
    case 'upgrade':
      await runUpdate();
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

  // 2. 初始化工作区配置
  const configPath = path.join(cwd, '.sanshengrc.json');
  if (!fs.existsSync(configPath)) {
    const defaultConfig = {
      models: {
        architect_tier: "gemini-3.7-flash",
        worker_tier: "deepseek-v3",
        fallback_tier: "gemini-3.7-flash"
      },
      escalation: { enabled: true, max_retries: 2 },
      stack: { backend: "dotnet8", frontend: "vue3-element" },
      yongle_dadian: {
        enabled: yongleActive,
        auto_recall_on_align: true,
        auto_postmortem_on_fix: true
      }
    };
    fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2), 'utf-8');
    console.log(`✅ 已在当前工作区初始化配置: .sanshengrc.json`);
  } else {
    console.log(`ℹ️ .sanshengrc.json 已存在。`);
  }

  // 3. 初始化 ROADMAP.md
  const roadmapPath = path.join(cwd, 'ROADMAP.md');
  if (!fs.existsSync(roadmapPath)) {
    const defaultRoadmap = `# 🗺️ 项目总纲 (ROADMAP.md)\n\n- [ ] Phase 1: 核心业务引擎与基础架构 (Active 🔥)\n- [ ] Phase 2: 复杂业务与多租户权限\n- [ ] Phase 3: 监控与运维交付\n`;
    fs.writeFileSync(roadmapPath, defaultRoadmap, 'utf-8');
    console.log(`✅ 已创建全局总纲: ROADMAP.md`);
  }
}

function generateMap() {
  console.log(`🔍 正在扫描代码库并提取 AST 符号骨架 (C# / Vue 3)...`);
  const mapContent = extractCodebaseMap(process.cwd());
  const outputPath = path.join(process.cwd(), '.codebase_map.md');
  fs.writeFileSync(outputPath, mapContent, 'utf-8');
  console.log(`✅ AST 代码骨架已生成: .codebase_map.md (Token 压缩率 > 95%)`);
}

function showStatus() {
  const taskPath = path.join(process.cwd(), 'TASK.md');
  if (!fs.existsSync(taskPath)) {
    console.log(`⚠️ 当前未检测到活跃的 TASK.md。请先在对话框输入需求触发中书省 ALIGN 对齐。`);
    return;
  }
  const content = fs.readFileSync(taskPath, 'utf-8');
  const lines = content.split('\n');
  const tasks = lines.filter(l => l.trim().startsWith('- [ ]') || l.trim().startsWith('- [x]'));
  console.log(`\n📦 当前活跃阶段进度 (TASK.md):`);
  tasks.forEach(t => console.log(`  ${t}`));
  console.log(`\n👉 回复 c (全自动推进) 或 s (单步推进)`);
}

function showHelp() {
  console.log(`
用法:
  sansheng init      初始化三省六部工作区 (自动检测永乐大典 / .sanshengrc.json / ROADMAP.md)
  sansheng update    检查最新版本、无损同步工作区配置与 IDE 技能规则
  sansheng map       提取当前项目 AST 符号骨架 (.codebase_map.md)
  sansheng status    查看当前活跃阶段的 3 行 HUD 任务进度
  sansheng uat       启动交互式单项 UAT 验收与自愈修复循环
  sansheng archive   执行项目两级归档并同步至《永乐大典》
  `);
}

main().catch(err => {
  console.error('执行失败:', err);
});
