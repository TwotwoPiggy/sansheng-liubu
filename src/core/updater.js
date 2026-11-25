import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execSync, execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { injectVSCodeEnhancements, syncGlobalVSCodeCopilot } from '../tools/vscode-injector.js';
import { RuleSync } from '../tools/rule-sync.js';
import { checkYongleInstalled } from '../tools/yongle-installer.js';
import { syncGlobalSkills } from '../tools/skill-injector.js';

const DEFAULT_PACKAGE_ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const SAFE_REF_PATTERN = /^[a-zA-Z0-9._/@^~-]+$/;

/**
 * 获取本地安装的三省六部当前版本
 * @param {string} [packageRoot]
 */
export function getLocalVersion(packageRoot = DEFAULT_PACKAGE_ROOT) {
  try {
    const pkgPath = path.join(packageRoot, 'package.json');
    const localPkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    return localPkg.version || '0.0.0';
  } catch (_) {
    return '0.0.0';
  }
}

/**
 * 检测当前三省六部的安装模式：Git 仓库开发模式 或 npm 全局包模式
 * @param {string} [packageRoot]
 * @returns {'git'|'npm'}
 */
export function detectInstallMode(packageRoot = DEFAULT_PACKAGE_ROOT) {
  try {
    return fs.existsSync(path.join(packageRoot, '.git')) ? 'git' : 'npm';
  } catch (_) {
    return 'npm';
  }
}

/**
 * 计算文件 MD5 指纹，不存在时返回空字符串
 */
function getFileMd5(filePath) {
  if (!fs.existsSync(filePath)) return '';
  try {
    return crypto.createHash('md5').update(fs.readFileSync(filePath)).digest('hex');
  } catch (_) {
    return '';
  }
}

/**
 * 计算依赖锁文件组合指纹 (兼容 pnpm / npm)
 */
function getLockfileFingerprint(packageRoot) {
  const files = ['pnpm-lock.yaml', 'package-lock.json', 'package.json'];
  return files.map(f => `${f}:${getFileMd5(path.join(packageRoot, f))}`).join('|');
}

/**
 * 校验版本号 / Tag / 分支名合法性，阻断命令注入
 */
function sanitizeTargetRef(targetVersion) {
  if (!targetVersion) return null;
  const trimmed = String(targetVersion).trim();
  if (!trimmed) return null;
  if (!SAFE_REF_PATTERN.test(trimmed) || trimmed.startsWith('-')) {
    throw new Error(`非法目标版本/引用格式: "${trimmed}"`);
  }
  return trimmed;
}

/**
 * 安全执行 git 子命令
 */
function runGit(args, cwd, { stdio = 'pipe', timeout = 15000 } = {}) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf-8',
    stdio,
    timeout,
    windowsHide: true,
  });
}

/**
 * 语义化版本比对 (SemVer Comparison)
 * @param {string} v1 远端版本
 * @param {string} v2 本地当前版本
 * @returns {number} 1: v1 > v2 (需升级), 0: v1 == v2 (已是最新), -1: v1 < v2
 */
export function compareVersions(v1, v2) {
  if (!v1 || !v2) return 0;

  // 清洗 'v' 前缀并切分 prerelease 标识 (如 1.2.0-beta.1)
  const clean1 = v1.replace(/^v/, '').trim();
  const clean2 = v2.replace(/^v/, '').trim();

  const [core1] = clean1.split('-');
  const [core2] = clean2.split('-');

  const p1 = core1.split('.').map(n => parseInt(n, 10) || 0);
  const p2 = core2.split('.').map(n => parseInt(n, 10) || 0);

  const maxLen = Math.max(p1.length, p2.length, 3);
  for (let i = 0; i < maxLen; i++) {
    const n1 = p1[i] || 0;
    const n2 = p2[i] || 0;
    if (n1 > n2) return 1;
    if (n1 < n2) return -1;
  }
  return 0;
}

/**
 * 从 NPM 官方 Registry 检查并获取最新版本号（或指定版本/dist-tag）
 * @param {string} [pkgName]
 * @param {string|null} [targetVersion]
 * @returns {Promise<string|null>}
 */
export async function getRemoteVersion(pkgName = 'sansheng-liubu', targetVersion = null) {
  const safeTarget = targetVersion ? sanitizeTargetRef(targetVersion) : 'latest';

  // 1. 优先使用极速原生 fetch 请求 NPM Registry (低开销、不启动子进程)
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);
    const res = await fetch(`https://registry.npmjs.org/${pkgName}/${encodeURIComponent(safeTarget)}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    clearTimeout(timeoutId);
    if (res.ok) {
      const data = await res.json();
      if (data && data.version) {
        return data.version.trim();
      }
    }
  } catch (_) {}

  // 2. 备用回退: 通过 npm view 子进程查询
  try {
    const spec = targetVersion ? `${pkgName}@${safeTarget}` : pkgName;
    const ver = execSync(`npm view ${spec} version`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
      timeout: 6000,
      windowsHide: true,
    });
    if (ver && ver.trim()) {
      return ver.trim();
    }
  } catch (_) {}

  return null;
}

/**
 * 解析全局 npm 安装目录下的包根目录，确保升级后能读取到最新版 Skills
 */
function resolveGlobalNpmPackageRoot(pkgName = 'sansheng-liubu') {
  try {
    const npmRoot = execSync('npm root -g', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
      timeout: 5000,
      windowsHide: true,
    }).trim();
    if (npmRoot) {
      const candidate = path.join(npmRoot, pkgName);
      if (fs.existsSync(path.join(candidate, 'package.json'))) {
        return candidate;
      }
    }
  } catch (_) {}
  return DEFAULT_PACKAGE_ROOT;
}

/**
 * 在 Git 仓库中解析目标分支/Tag/Commit 的 SHA
 */
function resolveGitTargetCommit(target, packageRoot) {
  const candidates = [`origin/${target}`, target, `refs/tags/${target}`];
  for (const ref of candidates) {
    try {
      const sha = runGit(['rev-parse', '--verify', `${ref}^{commit}`], packageRoot).trim();
      if (sha) return sha;
    } catch (_) {}
  }
  return null;
}

/**
 * 回滚 Git 仓库至更新前的原始 Commit
 */
function rollbackGitRepo(originalCommit, packageRoot, log) {
  if (!originalCommit) return false;
  log(`⚠️ 更新过程中发生故障，正在自动回滚至初始 Commit (${originalCommit.slice(0, 7)})...`);
  try {
    runGit(['reset', '--hard', originalCommit], packageRoot, { stdio: 'pipe' });
    log(`✅ 已安全回滚至初始 Commit: ${originalCommit.slice(0, 7)}`);
    return true;
  } catch (err) {
    log(`❌ 自动回滚失败: ${err.message}，请手动检查 git status。`);
    return false;
  }
}

/**
 * 执行 Git 仓库模式自动检测、升级、依赖更新与失败回滚
 */
export async function upgradeGitPackage(options = {}) {
  const {
    packageRoot = DEFAULT_PACKAGE_ROOT,
    targetVersion: rawTarget = null,
    checkOnly = false,
    force = false,
    silent = false,
    skipInstall = false,
  } = options;

  const log = (...msgs) => { if (!silent) console.log(...msgs); };
  const warn = (...msgs) => { if (!silent) console.warn(...msgs); };

  const currentVersion = getLocalVersion(packageRoot);
  let targetVersion = null;
  try {
    targetVersion = sanitizeTargetRef(rawTarget);
  } catch (err) {
    warn(`❌ ${err.message}`);
    return { status: 'invalid_target', mode: 'git', currentVersion, error: err.message };
  }

  log(`🧭 安装模式: Git 仓库模式 (${packageRoot})`);
  log(`📦 当前本地版本: v${currentVersion}`);

  let originalCommit = '';
  let currentBranch = 'HEAD';
  try {
    originalCommit = runGit(['rev-parse', 'HEAD'], packageRoot).trim();
    currentBranch = runGit(['rev-parse', '--abbrev-ref', 'HEAD'], packageRoot).trim();
  } catch (err) {
    warn(`❌ 无法读取 Git 仓库状态: ${err.message}`);
    return { status: 'failed', mode: 'git', currentVersion, error: err.message };
  }

  // 检查脏工作区（checkOnly 允许查看更新，不写入）
  let dirtyStatus = '';
  try {
    dirtyStatus = runGit(['status', '--porcelain', '-uno'], packageRoot).trim();
  } catch (_) {}

  if (dirtyStatus && !checkOnly && !force) {
    warn(`⚠️ 检测到本地核心代码存在未提交的修改，为避免覆盖冲突已中止 Git 升级。`);
    log(`👉 请先提交或暂存修改（git stash），或追加 --skip-npm 仅同步工作区与全局 Skills。`);
    return {
      status: 'dirty_worktree',
      mode: 'git',
      currentVersion,
      currentCommit: originalCommit,
      dirtyFiles: dirtyStatus.split(/\r?\n/).filter(Boolean),
    };
  }

  // [1/3] 拉取远端状态
  log(`🌐 正在执行 git fetch 拉取远端分支与标签状态...`);
  try {
    runGit(['fetch', 'origin'], packageRoot, { stdio: 'pipe', timeout: 20000 });
    try {
      runGit(['fetch', '--tags', 'origin'], packageRoot, { stdio: 'pipe', timeout: 20000 });
    } catch (_) {}
  } catch (err) {
    warn(`⚠️ git fetch 失败 (可能是网络受限或未配置 origin): ${err.message}`);
    return {
      status: 'network_failed',
      mode: 'git',
      currentVersion,
      currentCommit: originalCommit,
      error: err.message,
    };
  }

  // 计算是否有可用更新
  let hasNewerVersion = false;
  let resolvedTarget = targetVersion;
  let targetCommit = null;
  let behindCount = 0;
  let latestInfo = '';

  if (targetVersion) {
    targetCommit = resolveGitTargetCommit(targetVersion, packageRoot);
    if (!targetCommit) {
      warn(`❌ 找不到目标分支/标签/提交: "${targetVersion}"`);
      return {
        status: 'target_not_found',
        mode: 'git',
        currentVersion,
        currentCommit: originalCommit,
        targetVersion,
      };
    }
    if (targetCommit !== originalCommit) {
      hasNewerVersion = true;
      latestInfo = `目标 "${targetVersion}" (${targetCommit.slice(0, 7)})，当前 (${originalCommit.slice(0, 7)})`;
    } else {
      latestInfo = `当前已处于目标 "${targetVersion}" (${originalCommit.slice(0, 7)})`;
    }
  } else if (currentBranch !== 'HEAD') {
    // 跟踪当前分支
    let trackingRef = `origin/${currentBranch}`;
    try {
      runGit(['rev-parse', '--verify', trackingRef], packageRoot);
    } catch (_) {
      for (const fallback of ['origin/main', 'origin/master']) {
        try {
          runGit(['rev-parse', '--verify', fallback], packageRoot);
          trackingRef = fallback;
          break;
        } catch (_) {}
      }
    }

    try {
      behindCount = parseInt(runGit(['rev-list', `HEAD..${trackingRef}`, '--count'], packageRoot).trim(), 10) || 0;
      targetCommit = runGit(['rev-parse', '--verify', trackingRef], packageRoot).trim();
    } catch (_) {
      behindCount = 0;
    }

    if (behindCount > 0) {
      hasNewerVersion = true;
      latestInfo = `分支 ${currentBranch} 落后 ${trackingRef} 共 ${behindCount} 个提交`;
    } else {
      latestInfo = `分支 ${currentBranch} 已与 ${trackingRef} 同步 (${originalCommit.slice(0, 7)})`;
    }
  } else {
    // Detached HEAD 模式：检测最新标签
    let latestTag = '';
    try {
      const latestTagCommit = runGit(['rev-list', '--tags', '--max-count=1'], packageRoot).trim();
      if (latestTagCommit) {
        latestTag = runGit(['describe', '--tags', latestTagCommit], packageRoot).trim();
        targetCommit = latestTagCommit;
      }
    } catch (_) {}

    if (latestTag && targetCommit && targetCommit !== originalCommit) {
      hasNewerVersion = true;
      resolvedTarget = latestTag;
      latestInfo = `发现最新稳定版标签: ${latestTag} (${targetCommit.slice(0, 7)})`;
    } else {
      latestInfo = `当前已处于最新标签状态 (${originalCommit.slice(0, 7)})`;
    }
  }

  if (checkOnly) {
    if (hasNewerVersion) {
      log(`\n📢 检测到可用 Git 更新: ${latestInfo}`);
      log(`👉 运行 sansheng update 即可一键拉取升级并同步 Skills。\n`);
    } else {
      log(`\n✅ 当前 Git 仓库已是最新 (${latestInfo})。\n`);
    }
    return {
      status: 'checked',
      mode: 'git',
      currentVersion,
      currentCommit: originalCommit,
      targetCommit,
      targetVersion: resolvedTarget,
      hasNewerVersion,
      behindCount,
      latestInfo,
    };
  }

  if (!hasNewerVersion && !force) {
    log(`✅ ${latestInfo}，无需重复拉取代码。`);
    return {
      status: 'up_to_date',
      mode: 'git',
      currentVersion,
      newVersion: currentVersion,
      currentCommit: originalCommit,
      latestInfo,
    };
  }

  // [2/3] 拉取 / 切换代码
  const oldLockFingerprint = getLockfileFingerprint(packageRoot);
  try {
    if (resolvedTarget) {
      log(`⏳ 正在切换至目标 "${resolvedTarget}"...`);
      runGit(['checkout', resolvedTarget], packageRoot, { stdio: silent ? 'pipe' : 'inherit' });
      const postBranch = runGit(['rev-parse', '--abbrev-ref', 'HEAD'], packageRoot).trim();
      if (postBranch !== 'HEAD') {
        try {
          runGit(['pull', 'origin', postBranch], packageRoot, { stdio: silent ? 'pipe' : 'inherit', timeout: 30000 });
        } catch (_) {
          // 若指定的是纯本地分支且远端不存在则不阻断
        }
      }
    } else {
      log(`⏳ 正在拉取远端最新代码 (git pull origin ${currentBranch})...`);
      try {
        runGit(['pull', 'origin', currentBranch], packageRoot, { stdio: silent ? 'pipe' : 'inherit', timeout: 30000 });
      } catch (_) {
        runGit(['pull'], packageRoot, { stdio: silent ? 'pipe' : 'inherit', timeout: 30000 });
      }
    }
  } catch (err) {
    warn(`❌ Git 拉取/切换失败: ${err.message}`);
    const rolledBack = rollbackGitRepo(originalCommit, packageRoot, log);
    return {
      status: 'failed',
      mode: 'git',
      currentVersion,
      currentCommit: originalCommit,
      rolledBack,
      error: err.message,
    };
  }

  // [3/3] 检查锁文件变化并智能安装依赖
  const newLockFingerprint = getLockfileFingerprint(packageRoot);
  let depsInstalled = false;
  if (!skipInstall && oldLockFingerprint !== newLockFingerprint) {
    const usePnpm = fs.existsSync(path.join(packageRoot, 'pnpm-lock.yaml'));
    let installCmd = 'npm install';
    if (usePnpm) {
      try {
        execSync('pnpm --version', { stdio: 'ignore', timeout: 3000, windowsHide: true });
        installCmd = 'pnpm install';
      } catch (_) {
        installCmd = 'npm install';
      }
    }
    log(`📦 检测到依赖清单变化，正在执行 ${installCmd}...`);
    try {
      execSync(installCmd, { cwd: packageRoot, stdio: silent ? 'pipe' : 'inherit', windowsHide: true });
      depsInstalled = true;
      log(`✅ 依赖更新成功。`);
    } catch (err) {
      warn(`❌ 依赖安装失败: ${err.message}`);
      const rolledBack = rollbackGitRepo(originalCommit, packageRoot, log);
      return {
        status: 'failed',
        mode: 'git',
        currentVersion,
        currentCommit: originalCommit,
        rolledBack,
        error: err.message,
      };
    }
  }

  const newCommit = runGit(['rev-parse', 'HEAD'], packageRoot).trim();
  const newVersion = getLocalVersion(packageRoot);
  log(`\n🎉 【Git 升级成功】v${currentVersion} (${originalCommit.slice(0, 7)}) ➔ v${newVersion} (${newCommit.slice(0, 7)})`);

  return {
    status: 'success',
    mode: 'git',
    currentVersion,
    newVersion,
    previousCommit: originalCommit,
    currentCommit: newCommit,
    depsInstalled,
    latestInfo,
  };
}

/**
 * 执行 NPM 原地覆盖升级 (无须卸载再安装)
 */
export async function upgradeNpmPackage(options = {}) {
  const {
    force = false,
    checkOnly = false,
    pkgName = 'sansheng-liubu',
    targetVersion: rawTarget = null,
    packageRoot = DEFAULT_PACKAGE_ROOT,
    silent = false,
  } = options;

  const log = (...msgs) => { if (!silent) console.log(...msgs); };
  const warn = (...msgs) => { if (!silent) console.warn(...msgs); };

  const currentVersion = getLocalVersion(packageRoot);
  let targetVersion = null;
  try {
    targetVersion = sanitizeTargetRef(rawTarget);
  } catch (err) {
    warn(`❌ ${err.message}`);
    return { status: 'invalid_target', mode: 'npm', currentVersion, error: err.message };
  }

  log(`📦 当前本地版本: v${currentVersion}`);
  log(`🌐 正在从 NPM 官方 Registry 查询${targetVersion ? `目标版本 (${targetVersion})` : '最新版本'}...`);
  const remoteVersion = await getRemoteVersion(pkgName, targetVersion);

  if (!remoteVersion) {
    warn(`⚠️ 暂未能连接 NPM 官方源获取版本信息 (可能是离线环境、网络受限或版本号不存在)。`);
    log(`💡 如需手动更新，可在网络通畅后直接运行: npm install -g ${pkgName}@${targetVersion || 'latest'}`);
    return { status: 'network_failed', mode: 'npm', currentVersion, remoteVersion: null };
  }

  log(`🌟 NPM 远端目标版本: v${remoteVersion}`);

  const cmp = compareVersions(remoteVersion, currentVersion);
  const hasNewerVersion = targetVersion ? (remoteVersion !== currentVersion) : (cmp > 0);
  const isExactSame = targetVersion ? (remoteVersion === currentVersion) : (cmp === 0);

  if (checkOnly) {
    if (hasNewerVersion) {
      log(`\n📢 发现可用版本 v${remoteVersion} (当前: v${currentVersion})！`);
      log(`👉 运行 sansheng update${targetVersion ? ` ${targetVersion}` : ''} 即可一键原地升级。\n`);
    } else {
      log(`\n✅ 当前已是最新版本 (v${currentVersion})。\n`);
    }
    return { status: 'checked', mode: 'npm', currentVersion, remoteVersion, hasNewerVersion };
  }

  if (isExactSame && !force) {
    log(`✅ 当前已是目标版本 (v${currentVersion})，无需重复更新 NPM 依赖包。`);
    return { status: 'up_to_date', mode: 'npm', currentVersion, newVersion: currentVersion, remoteVersion };
  }

  if (!targetVersion && cmp < 0 && !force) {
    log(`ℹ️ 当前本地版本 (v${currentVersion}) 高于 NPM 远端版本 (v${remoteVersion}) (处于开发/预发布状态)。`);
    return { status: 'ahead_of_remote', mode: 'npm', currentVersion, newVersion: currentVersion, remoteVersion };
  }

  const installSpec = `${pkgName}@${targetVersion || 'latest'}`;
  log(`\n⏳ 正在从 NPM 原地覆盖升级 ${pkgName} (npm install -g ${installSpec})...`);
  try {
    execSync(`npm install -g ${installSpec}`, { stdio: silent ? 'pipe' : 'inherit', windowsHide: true });
    log(`\n🎉 【NPM 升级成功】三省六部已成功原地更新至 v${remoteVersion}！`);
    return {
      status: 'success',
      mode: 'npm',
      currentVersion,
      newVersion: remoteVersion,
      remoteVersion,
      resolvedPackageRoot: resolveGlobalNpmPackageRoot(pkgName),
    };
  } catch (err) {
    warn(`❌ 原地升级失败: ${err.message}`);
    log(`👉 提示: 若出现权限错误 (EACCES/EPERM)，请以管理员身份重试，或手动执行: npm install -g ${installSpec}\n`);
    return { status: 'failed', mode: 'npm', error: err.message, currentVersion, remoteVersion };
  }
}

/**
 * 解析命令行参数或配置对象为统一的 runUpdate 选项
 */
export function parseUpdateOptions(rawOptions = {}) {
  if (!Array.isArray(rawOptions)) {
    return { ...rawOptions };
  }

  const getFlagValue = (flag) => {
    const idx = rawOptions.indexOf(flag);
    if (idx > -1 && rawOptions[idx + 1] && !rawOptions[idx + 1].startsWith('-')) {
      return rawOptions[idx + 1];
    }
    return undefined;
  };

  let targetVersion = getFlagValue('--target');
  if (!targetVersion) {
    for (let i = 0; i < rawOptions.length; i++) {
      const arg = rawOptions[i];
      if (arg.startsWith('-')) continue;
      if (i > 0 && ['--mode', '--target', '--runtimes'].includes(rawOptions[i - 1])) continue;
      targetVersion = arg;
      break;
    }
  }

  const runtimesRaw = getFlagValue('--runtimes');
  const runtimes = runtimesRaw ? runtimesRaw.split(',').map(s => s.trim()).filter(Boolean) : undefined;

  return {
    checkOnly: rawOptions.includes('--check') || rawOptions.includes('-c'),
    skipNpm: rawOptions.includes('--skip-npm') || rawOptions.includes('--skip-pull'),
    skipSkills: rawOptions.includes('--skip-skills'),
    skipWorkspace: rawOptions.includes('--skip-workspace'),
    syncWorkspace: rawOptions.includes('--sync-workspace'),
    force: rawOptions.includes('--force') || rawOptions.includes('-f'),
    json: rawOptions.includes('--json'),
    silent: rawOptions.includes('--json') || rawOptions.includes('--silent'),
    mode: getFlagValue('--mode'),
    targetVersion,
    runtimes,
  };
}

/**
 * 同步当前工作区配置与 IDE 规则
 */
function syncCurrentWorkspace(cwd, log, warn, silent = false, syncOpts = {}) {
  const sanshengDir = path.join(cwd, '.sansheng');
  if (!fs.existsSync(sanshengDir)) fs.mkdirSync(sanshengDir, { recursive: true });

  const configPath = path.join(sanshengDir, 'config.json');
  const legacyConfigPath = path.join(cwd, '.sanshengrc.json');

  let activeConfigPath = null;
  if (fs.existsSync(configPath)) {
    activeConfigPath = configPath;
  } else if (fs.existsSync(legacyConfigPath)) {
    activeConfigPath = legacyConfigPath;
  }

  if (activeConfigPath) {
    try {
      const userConfig = JSON.parse(fs.readFileSync(activeConfigPath, 'utf-8'));
      if (!userConfig.models) userConfig.models = {};
      if (!userConfig.models.architect_tier) userConfig.models.architect_tier = 'gemini-3.7-flash';
      if (!userConfig.models.worker_tier) userConfig.models.worker_tier = 'deepseek-v3';
      if (!userConfig.models.fallback_tier) userConfig.models.fallback_tier = 'gemini-3.7-flash';
      if (!userConfig.stack) userConfig.stack = { backend: 'dotnet8', frontend: 'vue3-element' };
      if (!userConfig.escalation) userConfig.escalation = { enabled: true, max_retries: 2 };
      if (!userConfig.code_intelligence) userConfig.code_intelligence = { cbm_enabled: true, lsp_enabled: true };
      if (!userConfig.yongle_dadian) {
        userConfig.yongle_dadian = {
          enabled: checkYongleInstalled(),
          auto_recall_on_align: true,
          auto_postmortem_on_fix: true,
        };
      }
      fs.writeFileSync(configPath, JSON.stringify(userConfig, null, 2), 'utf-8');
      log(`   ➔ ✅ 工作区配置已完成无损增量同步: .sansheng/config.json`);
    } catch (e) {
      warn(`   ➔ ⚠️ 合并配置失败: ${e.message}`);
    }
  } else {
    const defaultConfig = {
      models: {
        architect_tier: 'gemini-3.7-flash',
        worker_tier: 'deepseek-v3',
        fallback_tier: 'gemini-3.7-flash',
      },
      escalation: { enabled: true, max_retries: 2 },
      stack: { backend: 'dotnet8', frontend: 'vue3-element' },
      code_intelligence: { cbm_enabled: true, lsp_enabled: true },
      yongle_dadian: {
        enabled: checkYongleInstalled(),
        auto_recall_on_align: true,
        auto_postmortem_on_fix: true,
      },
    };
    fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2), 'utf-8');
    log(`   ➔ ✅ 工作区未检测到旧配置，已主动创建标准配置: .sansheng/config.json`);
  }

  const runQuietly = (fn) => {
    if (!silent) return fn();
    const origLog = console.log;
    const origWarn = console.warn;
    console.log = () => {};
    console.warn = () => {};
    try {
      return fn();
    } finally {
      console.log = origLog;
      console.warn = origWarn;
    }
  };

  // 刷新 VS Code 与 Copilot 规则
  try {
    runQuietly(() => injectVSCodeEnhancements(cwd, {
      packageRoot: syncOpts.packageRoot,
      homeDir: syncOpts.homeDir,
      silent,
    }));
  } catch (e) {
    warn(`   ➔ ⚠️ 注入 VS Code 增强套件失败: ${e.message}`);
  }

  // 自动检测并同步外部 IDE 规则 (Trae / CatPaw / Qoder / Cursor)
  try {
    runQuietly(() => RuleSync.syncAll(cwd, { homeDir: syncOpts.homeDir }));
  } catch (e) {
    warn(`   ➔ ⚠️ 同步 IDE 规则失败: ${e.message}`);
  }
}

/**
 * 三省六部自我升级、全局 Skills 重注入与工作区同步主入口 (Updater)
 * @param {string[]|object} rawOptions 命令行参数数组或选项对象
 */
export async function runUpdate(rawOptions = {}) {
  const options = parseUpdateOptions(rawOptions);
  const cwd = options.cwd || process.cwd();
  const packageRoot = options.packageRoot || DEFAULT_PACKAGE_ROOT;
  const silent = Boolean(options.silent || options.json);
  const log = (...msgs) => { if (!silent) console.log(...msgs); };
  const warn = (...msgs) => { if (!silent) console.warn(...msgs); };

  const detectedMode = options.mode === 'git' || options.mode === 'npm'
    ? options.mode
    : detectInstallMode(packageRoot);
  const beforeVersion = getLocalVersion(packageRoot);

  log(`\n🏛️ ======================================================`);
  log(`🚀 【三省六部 (sansheng-liubu)】智能升级与全运行时自愈同步`);
  log(`======================================================\n`);

  // 1. 按安装模式执行检查/升级 (Git 或 NPM)
  let pkgResult = { status: 'skipped', mode: detectedMode, currentVersion: beforeVersion, newVersion: beforeVersion };
  if (!options.skipNpm) {
    if (detectedMode === 'git') {
      pkgResult = await upgradeGitPackage({
        packageRoot,
        targetVersion: options.targetVersion,
        checkOnly: options.checkOnly,
        force: options.force,
        silent,
        skipInstall: options.skipInstall,
      });
    } else {
      pkgResult = await upgradeNpmPackage({
        packageRoot,
        targetVersion: options.targetVersion,
        checkOnly: options.checkOnly,
        force: options.force,
        silent,
      });
    }
  } else {
    log(`⏩ 已跳过远端版本拉取 (--skip-npm)，直接执行技能与工作区自愈同步`);
  }

  // 若只是 --check 检查，到此返回结构化结果
  if (options.checkOnly) {
    const checkSummary = {
      success: pkgResult.status !== 'failed' && pkgResult.status !== 'invalid_target' && pkgResult.status !== 'target_not_found',
      mode: detectedMode,
      checkOnly: true,
      currentVersion: beforeVersion,
      pkgResult,
      skillsResult: null,
      workspaceSynced: false,
    };
    if (options.json) {
      console.log(JSON.stringify(checkSummary, null, 2));
    }
    return checkSummary;
  }

  // 2. 自动重注入全局 AI 运行时 Skills (Antigravity / VS Code Copilot / Claude / Cursor / Trae 等)
  let skillsResult = null;
  let copilotGlobalResult = null;
  const skillSourceRoot = pkgResult.resolvedPackageRoot || packageRoot;
  if (!options.skipSkills) {
    log(`\n🧠 [全局 AI 运行时 Skills 自动重注入]`);
    skillsResult = syncGlobalSkills({
      packageRoot: skillSourceRoot,
      homeDir: options.homeDir,
      runtimes: options.runtimes,
      silent,
    });

    // 若本机已检测到 VS Code Copilot 运行时，一并刷新全局 Custom Agents 与 Prompts
    if (skillsResult?.detectedRuntimes?.includes('copilot')) {
      try {
        copilotGlobalResult = syncGlobalVSCodeCopilot({
          packageRoot: skillSourceRoot,
          homeDir: options.homeDir,
          includeSkills: false,
          includeAgents: true,
          includePrompts: true,
          includeGlobalMcp: false,
          silent: true,
        });
        if (!silent && copilotGlobalResult.agents.updatedFiles.length > 0) {
          log(`   ➔ 🤖 全局 VS Code Copilot Custom Agents 已同步: ${copilotGlobalResult.agents.dir}`);
        }
      } catch (e) {
        warn(`   ➔ ⚠️ 同步全局 VS Code Copilot Agents 失败: ${e.message}`);
      }
    }
  }

  // 3. 按需无损同步当前工作区配置与 IDE 规则（避免在非项目目录污染磁盘）
  let workspaceSynced = false;
  const hasWorkspaceSansheng = fs.existsSync(path.join(cwd, '.sansheng')) || fs.existsSync(path.join(cwd, '.sanshengrc.json'));
  const shouldSyncWorkspace = !options.skipWorkspace && (options.syncWorkspace || hasWorkspaceSansheng);

  if (shouldSyncWorkspace) {
    log(`\n📂 [工作区配置与 IDE 规则自愈同步]`);
    syncCurrentWorkspace(cwd, log, warn, silent, {
      packageRoot: skillSourceRoot,
      homeDir: options.homeDir,
    });
    workspaceSynced = true;
  } else if (!options.skipWorkspace) {
    log(`\n📂 [工作区同步] 当前目录未检测到 .sansheng/，已跳过工作区文件注入（如需初始化请运行 sansheng init 或加 --sync-workspace）。`);
  }

  // 4. 校验《永乐大典》双向连接状态
  const yongleActive = checkYongleInstalled();
  log(`   ➔ 🏛️ 《永乐大典》双向知识连接: ${yongleActive ? '✅ 已连接就绪' : '⚠️ 未安装 (运行 sansheng init 可引导安装)'}`);

  const afterVersion = pkgResult.newVersion || getLocalVersion(pkgResult.resolvedPackageRoot || packageRoot);
  const overallSuccess = !['failed', 'dirty_worktree', 'invalid_target', 'target_not_found'].includes(pkgResult.status);

  if (overallSuccess) {
    log(`\n🎉 【更新完成】三省六部核心指令集 (v${afterVersion})、全局 Skills 与 IDE 工具链均已达到最新就绪状态！\n`);
  } else {
    log(`\n⚠️ 【更新未完全成功】远端升级状态: ${pkgResult.status}，请根据上方提示处理后重试。\n`);
  }

  const summary = {
    success: overallSuccess,
    mode: detectedMode,
    checkOnly: false,
    previousVersion: beforeVersion,
    currentVersion: afterVersion,
    pkgResult,
    skillsResult,
    copilotGlobalResult,
    workspaceSynced,
    yongleActive,
  };

  if (options.json) {
    console.log(JSON.stringify(summary, null, 2));
  }

  return summary;
}
