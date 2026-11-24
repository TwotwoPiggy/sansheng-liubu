import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const DEFAULT_PACKAGE_ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));

/**
 * 支持自动识别并同步全局 Skills 的主流 AI 运行时列表
 */
export function getRuntimeSkillTargets(homeDir = os.homedir()) {
  return [
    { id: 'antigravity', name: 'Antigravity', detectDir: path.join(homeDir, '.gemini', 'antigravity'), skillsDir: path.join(homeDir, '.gemini', 'antigravity', 'skills') },
    { id: 'gemini', name: 'Gemini CLI', detectDir: path.join(homeDir, '.gemini', 'skills'), skillsDir: path.join(homeDir, '.gemini', 'skills') },
    { id: 'claude', name: 'Claude Code', detectDir: path.join(homeDir, '.claude'), skillsDir: path.join(homeDir, '.claude', 'skills') },
    { id: 'cursor', name: 'Cursor', detectDir: path.join(homeDir, '.cursor'), skillsDir: path.join(homeDir, '.cursor', 'skills') },
    { id: 'codex', name: 'Codex', detectDir: path.join(homeDir, '.codex'), skillsDir: path.join(homeDir, '.codex', 'skills') },
    { id: 'windsurf', name: 'Windsurf', detectDir: path.join(homeDir, '.codeium', 'windsurf'), skillsDir: path.join(homeDir, '.codeium', 'windsurf', 'skills') },
    { id: 'opencode', name: 'OpenCode', detectDir: path.join(homeDir, '.config', 'opencode'), skillsDir: path.join(homeDir, '.config', 'opencode', 'skills') },
    { id: 'trae', name: 'Trae', detectDir: path.join(homeDir, '.trae'), skillsDir: path.join(homeDir, '.trae', 'skills') },
    { id: 'trae-cn', name: 'Trae CN', detectDir: path.join(homeDir, '.trae-cn'), skillsDir: path.join(homeDir, '.trae-cn', 'skills') },
    { id: 'qoder', name: 'Qoder', detectDir: path.join(homeDir, '.qoder'), skillsDir: path.join(homeDir, '.qoder', 'skills') },
    { id: 'catpawai', name: 'CatPaw AI', detectDir: path.join(homeDir, '.catpawai'), skillsDir: path.join(homeDir, '.catpawai', 'skills') },
  ];
}

/**
 * 收集包内所有可注入的内置 Skill 清单
 * - 主技能 sansheng-liubu 以包根目录 SKILL.md 为单一真理源
 * - 子技能位于 src/templates/skills/<skillName>/SKILL.md
 */
export function collectBuiltinSkills(packageRoot = DEFAULT_PACKAGE_ROOT) {
  const skills = [];

  const rootSkillPath = path.join(packageRoot, 'SKILL.md');
  if (fs.existsSync(rootSkillPath)) {
    skills.push({
      name: 'sansheng-liubu',
      sourcePath: rootSkillPath,
      content: fs.readFileSync(rootSkillPath, 'utf-8'),
    });
  }

  const extraSkillsDir = path.join(packageRoot, 'src', 'templates', 'skills');
  if (fs.existsSync(extraSkillsDir) && fs.statSync(extraSkillsDir).isDirectory()) {
    const entries = fs.readdirSync(extraSkillsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const skillFile = path.join(extraSkillsDir, entry.name, 'SKILL.md');
      if (fs.existsSync(skillFile)) {
        // 避免与主技能重复
        if (skills.some(s => s.name === entry.name)) continue;
        skills.push({
          name: entry.name,
          sourcePath: skillFile,
          content: fs.readFileSync(skillFile, 'utf-8'),
        });
      }
    }
  }

  return skills;
}

/**
 * 自动探测当前主机已安装的 AI 运行时，并将三省六部全套 Skills 无损重注入到各运行时
 * @param {object} [options]
 * @param {string} [options.packageRoot] 技能源码包根目录
 * @param {string} [options.homeDir] 用户主目录（便于单测沙箱隔离）
 * @param {string[]} [options.runtimes] 显式限定/强制注入的运行时 ID 列表
 * @param {boolean} [options.dryRun] 仅探测预览，不写磁盘
 * @param {boolean} [options.silent] 静默模式（不打印控制台日志）
 */
export function syncGlobalSkills(options = {}) {
  const {
    packageRoot = DEFAULT_PACKAGE_ROOT,
    homeDir = os.homedir(),
    runtimes = null,
    dryRun = false,
    silent = false,
  } = options;

  const builtinSkills = collectBuiltinSkills(packageRoot);
  const allTargets = getRuntimeSkillTargets(homeDir);
  const explicitSet = Array.isArray(runtimes) && runtimes.length > 0
    ? new Set(runtimes.map(r => String(r).trim().toLowerCase()))
    : null;

  const matchedTargets = allTargets.filter(target => {
    if (explicitSet) {
      return explicitSet.has(target.id);
    }
    return fs.existsSync(target.detectDir);
  });

  const updatedRuntimes = [];
  const updatedFiles = [];
  const unchangedFiles = [];
  const skippedSymlinks = [];
  const errors = [];

  for (const target of matchedTargets) {
    let runtimeTouched = false;
    let runtimeUpdatedCount = 0;

    for (const skill of builtinSkills) {
      const destSkillDir = path.join(target.skillsDir, skill.name);
      const destSkillFile = path.join(destSkillDir, 'SKILL.md');

      try {
        // 保护软链接目录/文件，避免破坏用户手工维护的符号链接
        if (fs.existsSync(destSkillDir) && fs.lstatSync(destSkillDir).isSymbolicLink()) {
          skippedSymlinks.push(destSkillDir);
          continue;
        }
        if (fs.existsSync(destSkillFile) && fs.lstatSync(destSkillFile).isSymbolicLink()) {
          skippedSymlinks.push(destSkillFile);
          continue;
        }

        const existing = fs.existsSync(destSkillFile)
          ? fs.readFileSync(destSkillFile, 'utf-8')
          : null;

        if (existing === skill.content) {
          unchangedFiles.push(destSkillFile);
          runtimeTouched = true;
          continue;
        }

        if (!dryRun) {
          if (!fs.existsSync(destSkillDir)) {
            fs.mkdirSync(destSkillDir, { recursive: true });
          }
          fs.writeFileSync(destSkillFile, skill.content, 'utf-8');
        }

        updatedFiles.push(destSkillFile);
        runtimeTouched = true;
        runtimeUpdatedCount++;
      } catch (err) {
        errors.push({ runtime: target.id, skill: skill.name, path: destSkillFile, error: err.message });
      }
    }

    if (runtimeTouched) {
      updatedRuntimes.push({
        id: target.id,
        name: target.name,
        skillsDir: target.skillsDir,
        updatedCount: runtimeUpdatedCount,
        totalSkills: builtinSkills.length,
      });
    }
  }

  if (!silent) {
    if (matchedTargets.length === 0) {
      console.log(`   ➔ ℹ️ 未检测到本机已安装的全局 AI 运行时目录，跳过全局 Skills 注入。`);
    } else {
      const rtSummary = updatedRuntimes
        .map(r => `${r.name}(${r.updatedCount > 0 ? `更新 ${r.updatedCount}` : '已是最新'})`)
        .join(', ');
      console.log(`   ➔ 🧠 全局 AI 运行时 Skills 已同步 [${builtinSkills.map(s => s.name).join(', ')}]: ${rtSummary || '无变更'}`);
      if (skippedSymlinks.length > 0) {
        console.log(`   ➔ 🔗 已保留 ${skippedSymlinks.length} 处符号链接技能，未破坏覆盖。`);
      }
      if (errors.length > 0) {
        errors.forEach(e => console.warn(`   ➔ ⚠️ 同步技能 ${e.runtime}/${e.skill} 失败: ${e.error}`));
      }
    }
  }

  return {
    success: errors.length === 0,
    skills: builtinSkills.map(s => s.name),
    detectedRuntimes: matchedTargets.map(t => t.id),
    updatedRuntimes,
    updatedFiles,
    unchangedFiles,
    skippedSymlinks,
    errors,
  };
}
