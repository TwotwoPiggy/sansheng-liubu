import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { collectBuiltinSkills, syncWorkspaceSkills, syncGlobalSkills } from './skill-injector.js';

const DEFAULT_PACKAGE_ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const DEFAULT_TEMPLATE_DIR = fileURLToPath(new URL('../templates', import.meta.url));

export const SANSHENG_INSTRUCTIONS_START = '<!-- sansheng-liubu:start -->';
export const SANSHENG_INSTRUCTIONS_END = '<!-- sansheng-liubu:end -->';
const RULESYNC_SECTION_MARKER = '## 🔄 [多 AI IDE 外部同步规则集 (Auto-Synced)]';

/**
 * 轻量级安全 JSONC 解析器（支持 // 单行注释、/* *\/ 块注释与尾随逗号）
 * 严格保护字符串字面量内部字符，避免误删 URL 等内容
 */
export function parseJsonc(rawText) {
  if (typeof rawText !== 'string' || !rawText.trim()) {
    return { ok: true, data: {} };
  }

  let out = '';
  let inString = false;
  let escaped = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < rawText.length; i++) {
    const ch = rawText[i];
    const next = rawText[i + 1];

    if (inLineComment) {
      if (ch === '\n' || ch === '\r') {
        inLineComment = false;
        out += ch;
      }
      continue;
    }

    if (inBlockComment) {
      if (ch === '*' && next === '/') {
        inBlockComment = false;
        i++;
      }
      continue;
    }

    if (inString) {
      out += ch;
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      out += ch;
      continue;
    }

    if (ch === '/' && next === '/') {
      inLineComment = true;
      i++;
      continue;
    }

    if (ch === '/' && next === '*') {
      inBlockComment = true;
      i++;
      continue;
    }

    out += ch;
  }

  // 清除数组或对象闭合前的尾随逗号
  const cleaned = out.replace(/,\s*([}\]])/g, '$1').trim();
  if (!cleaned) {
    return { ok: true, data: {} };
  }

  try {
    const data = JSON.parse(cleaned);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * 探测命令是否存在于当前系统 PATH 中
 */
export function defaultCommandExists(cmd) {
  try {
    const checker = process.platform === 'win32' ? 'where' : 'which';
    execFileSync(checker, [cmd], {
      stdio: 'ignore',
      timeout: 3000,
      windowsHide: true,
    });
    return true;
  } catch (_) {
    return false;
  }
}

/**
 * 收集内置的 VS Code Copilot Custom Agents (.agent.md)
 */
export function collectBuiltinAgents(packageRoot = DEFAULT_PACKAGE_ROOT) {
  const agentsDir = path.join(packageRoot, 'src', 'templates', 'agents');
  if (!fs.existsSync(agentsDir) || !fs.statSync(agentsDir).isDirectory()) {
    return [];
  }

  return fs.readdirSync(agentsDir, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.agent.md'))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(entry => {
      const sourcePath = path.join(agentsDir, entry.name);
      return {
        name: entry.name.replace(/\.agent\.md$/, ''),
        fileName: entry.name,
        sourcePath,
        content: fs.readFileSync(sourcePath, 'utf-8'),
      };
    });
}

/**
 * 收集内置的 VS Code Copilot Prompt Files (.prompt.md)
 */
export function collectBuiltinPrompts(packageRoot = DEFAULT_PACKAGE_ROOT) {
  const templateDir = path.join(packageRoot, 'src', 'templates');
  const promptFiles = ['sansheng.prompt.md', 'sansheng-liubu.prompt.md'];
  const prompts = [];

  for (const fileName of promptFiles) {
    const sourcePath = path.join(templateDir, fileName);
    if (fs.existsSync(sourcePath)) {
      prompts.push({
        name: fileName.replace(/\.prompt\.md$/, ''),
        fileName,
        sourcePath,
        content: fs.readFileSync(sourcePath, 'utf-8'),
      });
    }
  }

  return prompts;
}

/**
 * 幂等写入文本文件（带软链接保护）
 */
function writeTextIfChanged(destPath, content, { dryRun = false } = {}) {
  if (fs.existsSync(destPath) && fs.lstatSync(destPath).isSymbolicLink()) {
    return { status: 'skipped_symlink', path: destPath };
  }

  const existing = fs.existsSync(destPath) ? fs.readFileSync(destPath, 'utf-8') : null;
  if (existing === content) {
    return { status: 'unchanged', path: destPath };
  }

  if (!dryRun) {
    const dir = path.dirname(destPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(destPath, content, 'utf-8');
  }
  return { status: existing === null ? 'created' : 'updated', path: destPath };
}

/**
 * 同步内置 Custom Agents 到指定目录（如 .github/agents 或 ~/.copilot/agents）
 */
function syncAgentsIntoDir(agentsDir, agents, { dryRun = false } = {}) {
  const updatedFiles = [];
  const unchangedFiles = [];
  const skippedSymlinks = [];

  for (const agent of agents) {
    const dest = path.join(agentsDir, agent.fileName);
    const res = writeTextIfChanged(dest, agent.content, { dryRun });
    if (res.status === 'skipped_symlink') skippedSymlinks.push(dest);
    else if (res.status === 'unchanged') unchangedFiles.push(dest);
    else updatedFiles.push(dest);
  }

  return { updatedFiles, unchangedFiles, skippedSymlinks };
}

/**
 * 解析 VS Code 用户配置目录列表 (Stable + 若存在的 Insiders)
 */
export function resolveVSCodeUserDirs(options = {}) {
  const platform = options.platform || process.platform;
  const isCustomHome = Boolean(options.homeDir);
  const homeDir = options.homeDir || os.homedir();

  let baseDir = null;
  if (platform === 'win32') {
    const appData = options.appDataDir
      || (isCustomHome ? path.join(homeDir, 'AppData', 'Roaming') : (process.env.APPDATA || path.join(homeDir, 'AppData', 'Roaming')));
    baseDir = appData;
  } else if (platform === 'darwin') {
    baseDir = path.join(homeDir, 'Library', 'Application Support');
  } else {
    baseDir = path.join(homeDir, '.config');
  }

  return [
    { id: 'code', name: 'VS Code', userDir: path.join(baseDir, 'Code', 'User'), isPrimary: true },
    { id: 'code-insiders', name: 'VS Code Insiders', userDir: path.join(baseDir, 'Code - Insiders', 'User'), isPrimary: false },
  ];
}

/**
 * 解析 ~/.copilot 目录路径（仅在未传自定义 homeDir 时尊重 COPILOT_HOME）
 */
export function resolveCopilotHomeDir(options = {}) {
  if (options.copilotHome) return options.copilotHome;
  if (!options.homeDir && process.env.COPILOT_HOME) {
    return process.env.COPILOT_HOME;
  }
  const homeDir = options.homeDir || os.homedir();
  return path.join(homeDir, '.copilot');
}

/**
 * 为指定作用域（workspace / global）推导最合适的 sansheng-liubu MCP 启动配置
 */
export function resolveSanshengMcpEntry(options = {}) {
  const {
    scope = 'workspace',
    format = 'vscode', // 'vscode' (带 type: 'stdio') | 'portable' (mcp-config.json)
    packageRoot = DEFAULT_PACKAGE_ROOT,
    commandExists = defaultCommandExists,
    customEntry = null,
  } = options;

  if (customEntry && typeof customEntry === 'object') {
    return { ...customEntry };
  }

  let command;
  let args;

  if (commandExists('sansheng-mcp')) {
    command = 'sansheng-mcp';
    args = [];
  } else if (commandExists('sansheng')) {
    command = 'sansheng';
    args = ['mcp'];
  } else if (scope === 'global') {
    const localMcpBin = path.join(packageRoot, 'bin', 'mcp.js');
    if (fs.existsSync(localMcpBin)) {
      command = process.execPath;
      args = [localMcpBin];
    } else {
      command = 'npx';
      args = ['-y', 'sansheng-liubu', 'mcp'];
    }
  } else {
    // 工作区配置优先保持跨机器可移植，避免硬编码本机绝对路径污染 Git
    command = 'npx';
    args = ['-y', 'sansheng-liubu', 'mcp'];
  }

  const entry = {
    ...(format === 'vscode' ? { type: 'stdio' } : {}),
    command,
    args,
  };

  if (scope === 'workspace' && format === 'vscode') {
    entry.cwd = '${workspaceFolder}';
  }

  return entry;
}

/**
 * 无损锚点合并 .github/copilot-instructions.md
 * - 保护用户原有指令与 RuleSync 外部同步区块
 * - 支持将早期无锚点三省模板平滑升级到带锚点区块
 */
export function mergeCopilotInstructionsContent(existingContent, templateContent) {
  const block = `${SANSHENG_INSTRUCTIONS_START}\n${templateContent.trim()}\n${SANSHENG_INSTRUCTIONS_END}`;

  if (existingContent === null || existingContent === undefined || !existingContent.trim()) {
    return `${block}\n`;
  }

  const startIdx = existingContent.indexOf(SANSHENG_INSTRUCTIONS_START);
  const endIdx = existingContent.indexOf(SANSHENG_INSTRUCTIONS_END);
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    const before = existingContent.slice(0, startIdx);
    const after = existingContent.slice(endIdx + SANSHENG_INSTRUCTIONS_END.length);
    return `${before}${block}${after}`;
  }

  // 平滑升级旧版由三省六部直接写入、无锚点标记的模板
  const trimmed = existingContent.trimStart();
  if (trimmed.startsWith('# GitHub Copilot Custom Instructions: 三省六部')) {
    const ruleSyncIdx = existingContent.indexOf(RULESYNC_SECTION_MARKER);
    if (ruleSyncIdx !== -1) {
      const ruleSyncSuffix = existingContent.slice(ruleSyncIdx).trimStart();
      return `${block}\n\n${ruleSyncSuffix.endsWith('\n') ? ruleSyncSuffix : `${ruleSyncSuffix}\n`}`;
    }
    return `${block}\n`;
  }

  // 若用户已手写包含三省六部的自定义内容且未使用锚点，避免覆盖用户心血
  if (existingContent.includes('sansheng-liubu') || existingContent.includes('三省六部')) {
    return existingContent;
  }

  const separator = existingContent.endsWith('\n\n')
    ? ''
    : (existingContent.endsWith('\n') ? '\n' : '\n\n');
  return `${existingContent}${separator}${block}\n`;
}

/**
 * 无损合并 VS Code 格式 mcp.json（使用顶层 "servers" 并自动迁移旧版 "mcpServers"）
 */
function mergeVSCodeMcpFile(destMcp, sanshengEntry, { includeCbm = false, dryRun = false } = {}) {
  let config = {};
  let migratedFromLegacy = false;

  if (fs.existsSync(destMcp)) {
    const raw = fs.readFileSync(destMcp, 'utf-8');
    const parsed = parseJsonc(raw);
    if (!parsed.ok || typeof parsed.data !== 'object' || parsed.data === null || Array.isArray(parsed.data)) {
      return { status: 'skipped_invalid', path: destMcp, error: parsed.error || '非法的 JSON 对象' };
    }
    config = parsed.data;
  }

  if (!config.servers || typeof config.servers !== 'object' || Array.isArray(config.servers)) {
    config.servers = {};
  }

  // 自动将旧版误写入 .vscode/mcp.json 的 mcpServers 平滑迁移至官方标准 servers
  if (config.mcpServers && typeof config.mcpServers === 'object' && !Array.isArray(config.mcpServers)) {
    for (const [serverName, serverDef] of Object.entries(config.mcpServers)) {
      if (!config.servers[serverName] && serverDef && typeof serverDef === 'object') {
        config.servers[serverName] = {
          ...(serverDef.type ? {} : { type: 'stdio' }),
          ...serverDef,
        };
      }
    }
    delete config.mcpServers;
    migratedFromLegacy = true;
  }

  // 挂载或刷新 sansheng-liubu MCP Server
  config.servers['sansheng-liubu'] = sanshengEntry;

  // 若本机已安装 codebase-memory-mcp 且未配置，按需挂载
  if (includeCbm && !config.servers['codebase-memory']) {
    config.servers['codebase-memory'] = {
      type: 'stdio',
      command: 'codebase-memory-mcp',
      args: [],
    };
  }

  const nextJson = JSON.stringify(config, null, 2) + '\n';
  const res = writeTextIfChanged(destMcp, nextJson, { dryRun });
  return { ...res, migratedFromLegacy };
}

/**
 * 无损合并 Copilot Harness 便携全局配置 ~/.copilot/mcp-config.json (顶层 "mcpServers")
 */
function mergeCopilotMcpConfigFile(destMcp, sanshengEntry, { dryRun = false } = {}) {
  let config = {};

  if (fs.existsSync(destMcp)) {
    const raw = fs.readFileSync(destMcp, 'utf-8');
    const parsed = parseJsonc(raw);
    if (!parsed.ok || typeof parsed.data !== 'object' || parsed.data === null || Array.isArray(parsed.data)) {
      return { status: 'skipped_invalid', path: destMcp, error: parsed.error || '非法的 JSON 对象' };
    }
    config = parsed.data;
  }

  if (!config.mcpServers || typeof config.mcpServers !== 'object' || Array.isArray(config.mcpServers)) {
    config.mcpServers = {};
  }

  config.mcpServers['sansheng-liubu'] = sanshengEntry;

  const nextJson = JSON.stringify(config, null, 2) + '\n';
  return writeTextIfChanged(destMcp, nextJson, { dryRun });
}

/**
 * 无损增量合并 .vscode/settings.json（自动激活 promptFiles 与 Agent Skills）
 */
function mergeVSCodeSettingsFile(settingsPath, { dryRun = false } = {}) {
  let settings = {};
  if (fs.existsSync(settingsPath)) {
    const raw = fs.readFileSync(settingsPath, 'utf-8');
    const parsed = parseJsonc(raw);
    if (!parsed.ok || typeof parsed.data !== 'object' || parsed.data === null || Array.isArray(parsed.data)) {
      return { status: 'skipped_invalid', path: settingsPath, error: parsed.error || '非法的 JSON 对象' };
    }
    settings = parsed.data;
  }

  let changed = false;
  if (settings['chat.promptFiles'] !== true) {
    settings['chat.promptFiles'] = true;
    changed = true;
  }
  if (settings['chat.useAgentSkills'] !== true) {
    settings['chat.useAgentSkills'] = true;
    changed = true;
  }

  if (!changed && fs.existsSync(settingsPath)) {
    return { status: 'unchanged', path: settingsPath };
  }

  const nextJson = JSON.stringify(settings, null, 2) + '\n';
  return writeTextIfChanged(settingsPath, nextJson, { dryRun });
}

/**
 * 无损增量合并 .vscode/tasks.json（按 label 去重补齐三省任务，不覆写用户已有任务）
 */
function mergeVSCodeTasksFile(tasksPath, templateTasksPath, { dryRun = false } = {}) {
  if (!fs.existsSync(templateTasksPath)) {
    return { status: 'skipped_missing_template', path: tasksPath };
  }

  const tplParsed = parseJsonc(fs.readFileSync(templateTasksPath, 'utf-8'));
  if (!tplParsed.ok || !Array.isArray(tplParsed.data?.tasks)) {
    return { status: 'skipped_invalid', path: tasksPath };
  }

  if (!fs.existsSync(tasksPath)) {
    const nextJson = JSON.stringify(tplParsed.data, null, 2) + '\n';
    return writeTextIfChanged(tasksPath, nextJson, { dryRun });
  }

  const curParsed = parseJsonc(fs.readFileSync(tasksPath, 'utf-8'));
  if (!curParsed.ok || typeof curParsed.data !== 'object' || curParsed.data === null) {
    return { status: 'skipped_invalid', path: tasksPath, error: curParsed.error };
  }

  const current = curParsed.data;
  if (!current.version) current.version = tplParsed.data.version || '2.0.0';
  if (!Array.isArray(current.tasks)) current.tasks = [];

  const existingLabels = new Set(current.tasks.map(t => t && t.label).filter(Boolean));
  let addedCount = 0;
  for (const task of tplParsed.data.tasks) {
    if (!existingLabels.has(task.label)) {
      current.tasks.push(task);
      existingLabels.add(task.label);
      addedCount++;
    }
  }

  if (addedCount === 0) {
    return { status: 'unchanged', path: tasksPath, addedCount: 0 };
  }

  const nextJson = JSON.stringify(current, null, 2) + '\n';
  const res = writeTextIfChanged(tasksPath, nextJson, { dryRun });
  return { ...res, addedCount };
}

/**
 * 同步全局用户级 VS Code Copilot 全套配置：
 * - ~/.copilot/skills/<skill>/SKILL.md (Agent Skills)
 * - ~/.copilot/agents/*.agent.md (Custom Agents)
 * - ~/.copilot/mcp-config.json (Copilot Harness MCP, 可选)
 * - Code/User/prompts/*.prompt.md (VS Code Stable + 已安装的 Insiders)
 * - Code/User/mcp.json (VS Code User MCP, 可选)
 */
export function syncGlobalVSCodeCopilot(options = {}) {
  const {
    packageRoot = DEFAULT_PACKAGE_ROOT,
    homeDir,
    appDataDir,
    copilotHome,
    platform = process.platform,
    includeSkills = true,
    includeAgents = true,
    includePrompts = true,
    includeGlobalMcp = true,
    createMissingUserDir = false,
    commandExists = defaultCommandExists,
    dryRun = false,
    silent = false,
  } = options;

  const resolvedHome = homeDir || os.homedir();
  const copilotDir = resolveCopilotHomeDir({ homeDir, copilotHome });
  const vscodeDirs = resolveVSCodeUserDirs({ homeDir, appDataDir, platform });
  const builtinAgents = collectBuiltinAgents(packageRoot);
  const builtinPrompts = collectBuiltinPrompts(packageRoot);

  const report = {
    copilotDir,
    skills: null,
    agents: { dir: path.join(copilotDir, 'agents'), updatedFiles: [], unchangedFiles: [], skippedSymlinks: [] },
    prompts: { dirs: [], updatedFiles: [], unchangedFiles: [] },
    mcp: { copilotConfig: null, vscodeUserConfigs: [] },
    warnings: [],
  };

  // 1. 同步 ~/.copilot/skills/
  if (includeSkills) {
    report.skills = syncGlobalSkills({
      packageRoot,
      homeDir: resolvedHome,
      runtimes: ['copilot'],
      dryRun,
      silent: true,
    });
  }

  // 2. 同步 ~/.copilot/agents/
  if (includeAgents && builtinAgents.length > 0) {
    const globalAgentsDir = path.join(copilotDir, 'agents');
    const shouldWriteAgents = createMissingUserDir || fs.existsSync(copilotDir) || fs.existsSync(globalAgentsDir);
    if (shouldWriteAgents) {
      try {
        const res = syncAgentsIntoDir(globalAgentsDir, builtinAgents, { dryRun });
        report.agents = { dir: globalAgentsDir, ...res };
      } catch (err) {
        report.warnings.push(`全局 Copilot Agents 同步失败: ${err.message}`);
      }
    }
  }

  // 3. 同步 VS Code User/prompts (Stable + 已存在的 Insiders)
  if (includePrompts && builtinPrompts.length > 0) {
    for (const target of vscodeDirs) {
      const shouldWrite = fs.existsSync(target.userDir) || (target.isPrimary && createMissingUserDir);
      if (!shouldWrite) continue;
      const promptsDir = path.join(target.userDir, 'prompts');
      report.prompts.dirs.push(promptsDir);
      for (const prompt of builtinPrompts) {
        try {
          const res = writeTextIfChanged(path.join(promptsDir, prompt.fileName), prompt.content, { dryRun });
          if (res.status === 'unchanged') report.prompts.unchangedFiles.push(res.path);
          else if (res.status !== 'skipped_symlink') report.prompts.updatedFiles.push(res.path);
        } catch (err) {
          report.warnings.push(`全局 Prompt 写入失败 (${target.name}): ${err.message}`);
        }
      }
    }
  }

  // 4. 同步全局 MCP 配置 (~/.copilot/mcp-config.json 与 Code/User/mcp.json)
  if (includeGlobalMcp) {
    const portableEntry = resolveSanshengMcpEntry({
      scope: 'global',
      format: 'portable',
      packageRoot,
      commandExists,
    });
    const vscodeEntry = resolveSanshengMcpEntry({
      scope: 'global',
      format: 'vscode',
      packageRoot,
      commandExists,
    });

    const copilotMcpPath = path.join(copilotDir, 'mcp-config.json');
    if (createMissingUserDir || fs.existsSync(copilotDir) || fs.existsSync(copilotMcpPath)) {
      try {
        report.mcp.copilotConfig = mergeCopilotMcpConfigFile(copilotMcpPath, portableEntry, { dryRun });
      } catch (err) {
        report.warnings.push(`写入 ${copilotMcpPath} 失败: ${err.message}`);
      }
    }

    for (const target of vscodeDirs) {
      const shouldWrite = fs.existsSync(target.userDir) || (target.isPrimary && createMissingUserDir);
      if (!shouldWrite) continue;
      const userMcpPath = path.join(target.userDir, 'mcp.json');
      try {
        const res = mergeVSCodeMcpFile(userMcpPath, vscodeEntry, { includeCbm: false, dryRun });
        report.mcp.vscodeUserConfigs.push({ editor: target.name, ...res });
      } catch (err) {
        report.warnings.push(`写入 ${userMcpPath} 失败: ${err.message}`);
      }
    }
  }

  if (!silent) {
    const skillCount = (report.skills?.skills || []).length;
    const agentCount = report.agents.updatedFiles.length + report.agents.unchangedFiles.length;
    console.log(`🌐 [全局 VS Code Copilot 同步]`);
    if (includeSkills) {
      console.log(`   ➔ 全局 Agent Skills (${path.join(copilotDir, 'skills')}): ${skillCount} 项就绪`);
    }
    if (includeAgents && agentCount > 0) {
      console.log(`   ➔ 全局 Custom Agents (${path.join(copilotDir, 'agents')}): ${agentCount} 项就绪`);
    }
    if (report.prompts.dirs.length > 0) {
      console.log(`   ➔ 全局 Prompt 模板: ${report.prompts.dirs.join(', ')}`);
    }
    if (includeGlobalMcp) {
      const mcpTargets = [
        report.mcp.copilotConfig?.path,
        ...report.mcp.vscodeUserConfigs.map(c => c.path),
      ].filter(Boolean);
      if (mcpTargets.length > 0) {
        console.log(`   ➔ 全局 MCP 挂载 (sansheng-liubu): ${mcpTargets.join(', ')}`);
      }
    }
    report.warnings.forEach(w => console.warn(`   ➔ ⚠️ ${w}`));
  }

  return report;
}

/**
 * 自动为工作区注入 VS Code 与 GitHub Copilot 全套原生增强套件：
 * 1. .github/copilot-instructions.md (锚点安全合并，绝不覆写用户自定义指令)
 * 2. .github/skills/<skill>/SKILL.md (工作区 Agent Skills 全套 4 技能)
 * 3. .github/agents/*.agent.md (三省六部原生 Custom Agents + Handoffs)
 * 4. .github/prompts/ 与 .vscode/prompts/ (/sansheng & /sansheng-liubu)
 * 5. .vscode/mcp.json (VS Code 官方 "servers" + stdio 格式，挂载 sansheng-liubu MCP 并自动迁移旧格式)
 * 6. .vscode/settings.json (JSONC 安全合并，开启 chat.promptFiles & chat.useAgentSkills)
 * 7. .vscode/tasks.json (按 label 增量合并三省快捷任务)
 * 8. .gitignore 运行时缓存条目维护
 * 9. 可选同步用户级全局 Copilot Prompts / Agents / Skills / MCP
 */
export function injectVSCodeEnhancements(cwd = process.cwd(), options = {}) {
  const {
    packageRoot = DEFAULT_PACKAGE_ROOT,
    templateDir = path.join(packageRoot, 'src', 'templates'),
    homeDir,
    appDataDir,
    copilotHome,
    platform = process.platform,
    includeGlobal = true,
    includeGlobalMcp = false,
    createMissingUserDir = false,
    commandExists = defaultCommandExists,
    dryRun = false,
    silent = false,
  } = options;

  const githubDir = path.join(cwd, '.github');
  const vscodeDir = path.join(cwd, '.vscode');
  const warnings = [];

  // 1. 注入 .github/copilot-instructions.md (锚点安全合并)
  const copilotInstructionsPath = path.join(githubDir, 'copilot-instructions.md');
  const srcInstructions = path.join(templateDir, 'copilot-instructions.md');
  let instructionsResult = null;
  if (fs.existsSync(srcInstructions)) {
    const templateContent = fs.readFileSync(srcInstructions, 'utf-8');
    const existingContent = fs.existsSync(copilotInstructionsPath)
      ? fs.readFileSync(copilotInstructionsPath, 'utf-8')
      : null;
    const mergedContent = mergeCopilotInstructionsContent(existingContent, templateContent);
    instructionsResult = writeTextIfChanged(copilotInstructionsPath, mergedContent, { dryRun });
  }

  // 2. 注入工作区 Agent Skills (.github/skills/<name>/SKILL.md)
  const workspaceSkillsResult = syncWorkspaceSkills(cwd, { packageRoot, dryRun });

  // 3. 注入工作区 Custom Agents (.github/agents/*.agent.md)
  const builtinAgents = collectBuiltinAgents(packageRoot);
  const ghAgentsDir = path.join(githubDir, 'agents');
  const workspaceAgentsResult = syncAgentsIntoDir(ghAgentsDir, builtinAgents, { dryRun });

  // 4. 注入工作区 Prompt Files (.github/prompts/ 与 .vscode/prompts/)
  const builtinPrompts = collectBuiltinPrompts(packageRoot);
  const ghPromptsDir = path.join(githubDir, 'prompts');
  const vsPromptsDir = path.join(vscodeDir, 'prompts');
  const promptFilesUpdated = [];
  for (const prompt of builtinPrompts) {
    const r1 = writeTextIfChanged(path.join(ghPromptsDir, prompt.fileName), prompt.content, { dryRun });
    const r2 = writeTextIfChanged(path.join(vsPromptsDir, prompt.fileName), prompt.content, { dryRun });
    if (r1.status === 'created' || r1.status === 'updated') promptFilesUpdated.push(r1.path);
    if (r2.status === 'created' || r2.status === 'updated') promptFilesUpdated.push(r2.path);
  }

  // 5. 无损合并 .vscode/mcp.json（官方 servers + stdio 格式 + 旧格式迁移）
  const destMcp = path.join(vscodeDir, 'mcp.json');
  const workspaceMcpEntry = resolveSanshengMcpEntry({
    scope: 'workspace',
    format: 'vscode',
    packageRoot,
    commandExists,
  });
  const cbmInstalled = commandExists('codebase-memory-mcp');
  const mcpResult = mergeVSCodeMcpFile(destMcp, workspaceMcpEntry, {
    includeCbm: cbmInstalled,
    dryRun,
  });
  if (mcpResult.status === 'skipped_invalid') {
    warnings.push(`.vscode/mcp.json 格式无法解析，已保留原文件未覆写 (${mcpResult.error})`);
  }

  // 6. 无损增量合并 .vscode/tasks.json
  const srcTasks = path.join(templateDir, 'tasks.json');
  const destTasks = path.join(vscodeDir, 'tasks.json');
  const tasksResult = mergeVSCodeTasksFile(destTasks, srcTasks, { dryRun });
  if (tasksResult.status === 'skipped_invalid') {
    warnings.push(`.vscode/tasks.json 格式无法解析，已保留原文件未覆写 (${tasksResult.error})`);
  }

  // 7. 无损增强 .vscode/settings.json（JSONC 安全解析，绝不清空注释配置）
  const settingsPath = path.join(vscodeDir, 'settings.json');
  const settingsResult = mergeVSCodeSettingsFile(settingsPath, { dryRun });
  if (settingsResult.status === 'skipped_invalid') {
    warnings.push(`.vscode/settings.json 格式无法解析，已保留原文件未覆写 (${settingsResult.error})`);
  }

  // 8. 自动在 .gitignore 中维护运行时本地缓存
  const gitignorePath = path.join(cwd, '.gitignore');
  if (fs.existsSync(gitignorePath) && !dryRun) {
    const gitignoreContent = fs.readFileSync(gitignorePath, 'utf-8');
    const entriesToAdd = [];
    if (!gitignoreContent.includes('.sansheng/codebase_map.md')) {
      entriesToAdd.push('.sansheng/codebase_map.md');
    }
    if (!gitignoreContent.includes('.sansheng/cache/')) {
      entriesToAdd.push('.sansheng/cache/');
    }
    if (entriesToAdd.length > 0) {
      const appendStr = (gitignoreContent.endsWith('\n') ? '' : '\n') +
        `\n# sansheng-liubu 本地运行时缓存\n` +
        entriesToAdd.join('\n') + '\n';
      fs.appendFileSync(gitignorePath, appendStr, 'utf-8');
    }
  }

  // 9. 可选同步全局用户级 VS Code Copilot 配置
  let globalResult = null;
  if (includeGlobal) {
    try {
      globalResult = syncGlobalVSCodeCopilot({
        packageRoot,
        homeDir,
        appDataDir,
        copilotHome,
        platform,
        includeSkills: false, // 全局 Skills 由 syncGlobalSkills 统一调度，避免重复日志
        includeAgents: true,
        includePrompts: true,
        includeGlobalMcp,
        createMissingUserDir,
        commandExists,
        dryRun,
        silent: true,
      });
      if (globalResult.warnings.length > 0) {
        warnings.push(...globalResult.warnings);
      }
    } catch (err) {
      warnings.push(`全局 VS Code Copilot 同步异常: ${err.message}`);
    }
  }

  if (!silent) {
    console.log(`✨ [VS Code Copilot 原生增强套件]`);
    console.log(`   ➔ 全局指令法则: .github/copilot-instructions.md (锚点安全合并)`);
    console.log(`   ➔ 工作区 Agent Skills: .github/skills/ (${workspaceSkillsResult.skills.join(', ')})`);
    console.log(`   ➔ 原生 Custom Agents: .github/agents/ (${builtinAgents.map(a => '@' + a.name).join(', ')})`);
    console.log(`   ➔ 原生 Prompt 模板: /sansheng & /sansheng-liubu (项目级 + 全局用户级)`);
    console.log(`   ➔ VS Code 设置激活: .vscode/settings.json (chat.promptFiles & chat.useAgentSkills)`);
    console.log(`   ➔ VS Code 原生 MCP: .vscode/mcp.json (servers.sansheng-liubu${mcpResult.migratedFromLegacy ? '，已自动迁移旧 mcpServers 格式' : ''})`);
    console.log(`   ➔ VS Code 快捷任务: .vscode/tasks.json`);
    warnings.forEach(w => console.warn(`   ➔ ⚠️ ${w}`));
  }

  return {
    success: warnings.length === 0,
    cwd,
    instructions: instructionsResult,
    skills: workspaceSkillsResult,
    agents: {
      dir: ghAgentsDir,
      names: builtinAgents.map(a => a.name),
      ...workspaceAgentsResult,
    },
    prompts: {
      names: builtinPrompts.map(p => p.name),
      updatedFiles: promptFilesUpdated,
    },
    mcp: mcpResult,
    settings: settingsResult,
    tasks: tasksResult,
    global: globalResult,
    warnings,
  };
}

/**
 * 检查当前工作区与本机全局的 VS Code Copilot 集成健康状态
 */
export function inspectVSCodeCopilotStatus(cwd = process.cwd(), options = {}) {
  const {
    packageRoot = DEFAULT_PACKAGE_ROOT,
    homeDir,
    appDataDir,
    copilotHome,
    platform = process.platform,
    commandExists = defaultCommandExists,
  } = options;

  const builtinSkillNames = collectBuiltinSkills(packageRoot).map(s => s.name);
  const builtinAgentNames = collectBuiltinAgents(packageRoot).map(a => a.name);
  const copilotDir = resolveCopilotHomeDir({ homeDir, copilotHome });
  const vscodeDirs = resolveVSCodeUserDirs({ homeDir, appDataDir, platform });

  // 1. Workspace Instructions
  const instPath = path.join(cwd, '.github', 'copilot-instructions.md');
  const instContent = fs.existsSync(instPath) ? fs.readFileSync(instPath, 'utf-8') : '';
  const hasInstructions = instContent.includes('sansheng-liubu') || instContent.includes('三省六部');
  const hasAnchoredInstructions = instContent.includes(SANSHENG_INSTRUCTIONS_START) && instContent.includes(SANSHENG_INSTRUCTIONS_END);

  // 2. Workspace Skills
  const wsSkillsDir = path.join(cwd, '.github', 'skills');
  const wsInstalledSkills = builtinSkillNames.filter(name =>
    fs.existsSync(path.join(wsSkillsDir, name, 'SKILL.md'))
  );

  // 3. Workspace Agents
  const wsAgentsDir = path.join(cwd, '.github', 'agents');
  const wsInstalledAgents = builtinAgentNames.filter(name =>
    fs.existsSync(path.join(wsAgentsDir, `${name}.agent.md`))
  );

  // 4. Workspace Prompts
  const wsPromptsDir = path.join(cwd, '.github', 'prompts');
  const hasWorkspacePrompts = fs.existsSync(path.join(wsPromptsDir, 'sansheng.prompt.md'));

  // 5. Workspace MCP
  const wsMcpPath = path.join(cwd, '.vscode', 'mcp.json');
  let wsMcpValid = false;
  let wsMcpHasSansheng = false;
  let wsMcpUsesLegacyKey = false;
  if (fs.existsSync(wsMcpPath)) {
    const parsed = parseJsonc(fs.readFileSync(wsMcpPath, 'utf-8'));
    if (parsed.ok && parsed.data && typeof parsed.data === 'object') {
      wsMcpValid = true;
      wsMcpUsesLegacyKey = Boolean(parsed.data.mcpServers && !parsed.data.servers);
      wsMcpHasSansheng = Boolean(parsed.data.servers?.['sansheng-liubu']);
    }
  }

  // 6. Workspace Settings
  const wsSettingsPath = path.join(cwd, '.vscode', 'settings.json');
  let promptFilesEnabled = false;
  let agentSkillsEnabled = false;
  if (fs.existsSync(wsSettingsPath)) {
    const parsed = parseJsonc(fs.readFileSync(wsSettingsPath, 'utf-8'));
    if (parsed.ok && parsed.data && typeof parsed.data === 'object') {
      promptFilesEnabled = parsed.data['chat.promptFiles'] === true;
      agentSkillsEnabled = parsed.data['chat.useAgentSkills'] === true;
    }
  }

  // 7. Global Copilot (~/.copilot)
  const globalSkillsDir = path.join(copilotDir, 'skills');
  const globalInstalledSkills = builtinSkillNames.filter(name =>
    fs.existsSync(path.join(globalSkillsDir, name, 'SKILL.md'))
  );
  const globalAgentsDir = path.join(copilotDir, 'agents');
  const globalInstalledAgents = builtinAgentNames.filter(name =>
    fs.existsSync(path.join(globalAgentsDir, `${name}.agent.md`))
  );
  const copilotMcpPath = path.join(copilotDir, 'mcp-config.json');
  let globalCopilotMcpReady = false;
  if (fs.existsSync(copilotMcpPath)) {
    const parsed = parseJsonc(fs.readFileSync(copilotMcpPath, 'utf-8'));
    globalCopilotMcpReady = Boolean(parsed.ok && parsed.data?.mcpServers?.['sansheng-liubu']);
  }

  // 8. Global VS Code User Config
  const userEditors = vscodeDirs
    .filter(d => fs.existsSync(d.userDir))
    .map(d => {
      const mcpPath = path.join(d.userDir, 'mcp.json');
      const promptPath = path.join(d.userDir, 'prompts', 'sansheng.prompt.md');
      let mcpReady = false;
      if (fs.existsSync(mcpPath)) {
        const parsed = parseJsonc(fs.readFileSync(mcpPath, 'utf-8'));
        mcpReady = Boolean(parsed.ok && parsed.data?.servers?.['sansheng-liubu']);
      }
      return {
        id: d.id,
        name: d.name,
        userDir: d.userDir,
        promptsReady: fs.existsSync(promptPath),
        mcpReady,
      };
    });

  const workspaceReady = hasInstructions
    && wsInstalledSkills.length === builtinSkillNames.length
    && wsInstalledAgents.length === builtinAgentNames.length
    && hasWorkspacePrompts
    && wsMcpHasSansheng
    && promptFilesEnabled
    && agentSkillsEnabled;

  const globalReady = globalInstalledSkills.length === builtinSkillNames.length
    && globalInstalledAgents.length === builtinAgentNames.length
    && (globalCopilotMcpReady || userEditors.some(e => e.mcpReady));

  return {
    workspaceReady,
    globalReady,
    mcpCommand: resolveSanshengMcpEntry({ scope: 'workspace', format: 'vscode', packageRoot, commandExists }),
    workspace: {
      cwd,
      instructions: { exists: fs.existsSync(instPath), configured: hasInstructions, anchored: hasAnchoredInstructions },
      skills: { dir: wsSkillsDir, installed: wsInstalledSkills, expected: builtinSkillNames, complete: wsInstalledSkills.length === builtinSkillNames.length },
      agents: { dir: wsAgentsDir, installed: wsInstalledAgents, expected: builtinAgentNames, complete: wsInstalledAgents.length === builtinAgentNames.length },
      prompts: { dir: wsPromptsDir, ready: hasWorkspacePrompts },
      mcp: { path: wsMcpPath, valid: wsMcpValid, hasSansheng: wsMcpHasSansheng, usesLegacyKey: wsMcpUsesLegacyKey },
      settings: { path: wsSettingsPath, promptFilesEnabled, agentSkillsEnabled },
    },
    global: {
      copilotDir,
      skills: { dir: globalSkillsDir, installed: globalInstalledSkills, expected: builtinSkillNames, complete: globalInstalledSkills.length === builtinSkillNames.length },
      agents: { dir: globalAgentsDir, installed: globalInstalledAgents, expected: builtinAgentNames, complete: globalInstalledAgents.length === builtinAgentNames.length },
      mcpConfig: { path: copilotMcpPath, ready: globalCopilotMcpReady },
      vscodeUsers: userEditors,
    },
  };
}
