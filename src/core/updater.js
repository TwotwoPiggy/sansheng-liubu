import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { injectVSCodeEnhancements } from '../tools/vscode-injector.js';
import { RuleSync } from '../tools/rule-sync.js';
import { checkYongleInstalled } from '../tools/yongle-installer.js';

/**
 * 获取本地安装的三省六部当前版本
 */
export function getLocalVersion() {
  try {
    const pkgPath = new URL('../../package.json', import.meta.url);
    const localPkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    return localPkg.version || '0.0.0';
  } catch (_) {
    return '0.0.0';
  }
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
 * 从 NPM 官方 Registry 检查并获取最新版本号
 * @param {string} pkgName
 * @returns {Promise<string|null>}
 */
export async function getRemoteVersion(pkgName = 'sansheng-liubu') {
  // 1. 优先使用极速原生 fetch 请求 NPM Registry (低开销、不启动子进程)
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);
    const res = await fetch(`https://registry.npmjs.org/${pkgName}/latest`, {
      signal: controller.signal,
      headers: { 'Accept': 'application/json' }
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
    const ver = execSync(`npm view ${pkgName} version`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
      timeout: 6000
    });
    if (ver && ver.trim()) {
      return ver.trim();
    }
  } catch (_) {}

  return null;
}

/**
 * 执行 NPM 原地覆盖升级 (无须卸载再安装)
 */
export async function upgradeNpmPackage(options = {}) {
  const { force = false, checkOnly = false, pkgName = 'sansheng-liubu' } = options;
  const currentVersion = getLocalVersion();
  console.log(`📦 当前本地版本: v${currentVersion}`);

  console.log(`🌐 正在从 NPM 官方 Registry 查询最新版本...`);
  const remoteVersion = await getRemoteVersion(pkgName);

  if (!remoteVersion) {
    console.warn(`⚠️ 暂未能连接 NPM 官方源获取最新版本信息 (可能是离线环境或网络受限)。`);
    console.log(`💡 如需手动更新，可在网络通畅后直接运行: npm install -g ${pkgName}@latest`);
    return { status: 'network_failed', currentVersion, remoteVersion: null };
  }

  console.log(`🌟 NPM 远端最新版本: v${remoteVersion}`);

  const cmp = compareVersions(remoteVersion, currentVersion);
  const hasNewerVersion = cmp > 0;
  const isExactSame = cmp === 0;

  if (checkOnly) {
    if (hasNewerVersion) {
      console.log(`\n📢 发现新版本 v${remoteVersion} (当前: v${currentVersion})！`);
      console.log(`👉 运行 sansheng update 即可一键原地升级。\n`);
    } else {
      console.log(`\n✅ 当前已是最新版本 (v${currentVersion})。\n`);
    }
    return { status: 'checked', currentVersion, remoteVersion, hasNewerVersion };
  }

  if (isExactSame && !force) {
    console.log(`✅ 当前已是最新版本 (v${currentVersion})，无需重复更新 NPM 依赖包。`);
    return { status: 'up_to_date', currentVersion, remoteVersion };
  }

  if (cmp < 0 && !force) {
    console.log(`ℹ️ 当前本地版本 (v${currentVersion}) 高于 NPM 远端版本 (v${remoteVersion}) (处于开发/预发布状态)。`);
    return { status: 'ahead_of_remote', currentVersion, remoteVersion };
  }

  // 执行原地升级 (npm install -g 包名@latest 即可完成原地热更新与可执行 bin 覆盖，无需卸载)
  console.log(`\n⏳ 正在从 NPM 原地覆盖升级 ${pkgName} 至最新版本 (npm install -g ${pkgName}@latest)...`);
  try {
    execSync(`npm install -g ${pkgName}@latest`, { stdio: 'inherit' });
    console.log(`\n🎉 【NPM 升级成功】三省六部已成功原地更新至最新版 v${remoteVersion}！`);
    return { status: 'success', currentVersion, remoteVersion };
  } catch (err) {
    console.error(`❌ 原地升级失败: ${err.message}`);
    console.log(`👉 提示: 若出现权限错误 (EACCES/EPERM)，请以管理员身份重试，或手动执行: npm install -g ${pkgName}@latest\n`);
    return { status: 'failed', error: err.message, currentVersion, remoteVersion };
  }
}

/**
 * 三省六部自我升级与工作区同步主入口 (Updater)
 * @param {string[]|object} rawOptions 命令行参数数组或选项对象
 */
export async function runUpdate(rawOptions = {}) {
  let options = {};
  if (Array.isArray(rawOptions)) {
    options = {
      checkOnly: rawOptions.includes('--check') || rawOptions.includes('-c'),
      skipNpm: rawOptions.includes('--skip-npm'),
      force: rawOptions.includes('--force') || rawOptions.includes('-f')
    };
  } else {
    options = rawOptions;
  }

  console.log(`\n🏛️ ======================================================`);
  console.log(`🚀 【三省六部 (sansheng-liubu)】智能升级与工作区自愈同步`);
  console.log(`======================================================\n`);

  // 1. 从 NPM 检查并原地升级
  if (!options.skipNpm) {
    await upgradeNpmPackage(options);
  } else {
    console.log(`⏩ 已跳过 NPM 远端包检测 (--skip-npm)`);
  }

  // 若只是 --check 检查，到此结束
  if (options.checkOnly) {
    return;
  }

  console.log(`\n📂 [工作区配置与 IDE 规则自愈同步]`);

  // 2. 平滑增量合并工作区配置 (.sansheng/config.json)
  const cwd = process.cwd();
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
      // 补充可能新增的缺省字段
      if (!userConfig.models) userConfig.models = {};
      if (!userConfig.models.architect_tier) userConfig.models.architect_tier = "gemini-3.7-flash";
      if (!userConfig.models.worker_tier) userConfig.models.worker_tier = "deepseek-v3";
      if (!userConfig.models.fallback_tier) userConfig.models.fallback_tier = "gemini-3.7-flash";
      if (!userConfig.stack) userConfig.stack = { backend: "dotnet8", frontend: "vue3-element" };
      if (!userConfig.escalation) userConfig.escalation = { enabled: true, max_retries: 2 };
      if (!userConfig.code_intelligence) userConfig.code_intelligence = { cbm_enabled: true, lsp_enabled: true };
      if (!userConfig.yongle_dadian) {
        userConfig.yongle_dadian = {
          enabled: checkYongleInstalled(),
          auto_recall_on_align: true,
          auto_postmortem_on_fix: true
        };
      }
      fs.writeFileSync(configPath, JSON.stringify(userConfig, null, 2), 'utf-8');
      console.log(`   ➔ ✅ 工作区配置已完成无损增量同步: .sansheng/config.json`);
    } catch (e) {
      console.warn(`   ➔ ⚠️ 合并配置失败:`, e.message);
    }
  } else {
    // 工作区未找到配置，主动生成默认标准配置
    const defaultConfig = {
      models: {
        architect_tier: "gemini-3.7-flash",
        worker_tier: "deepseek-v3",
        fallback_tier: "gemini-3.7-flash"
      },
      escalation: { enabled: true, max_retries: 2 },
      stack: { backend: "dotnet8", frontend: "vue3-element" },
      code_intelligence: { cbm_enabled: true, lsp_enabled: true },
      yongle_dadian: {
        enabled: checkYongleInstalled(),
        auto_recall_on_align: true,
        auto_postmortem_on_fix: true
      }
    };
    fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2), 'utf-8');
    console.log(`   ➔ ✅ 工作区未检测到旧配置，已主动创建标准配置: .sansheng/config.json`);
  }

  // 3. 刷新 VS Code 与 Copilot 规则
  try {
    injectVSCodeEnhancements(cwd);
  } catch (e) {
    console.warn(`   ➔ ⚠️ 注入 VS Code 增强套件失败:`, e.message);
  }

  // 4. 自动检测并同步外部 IDE 规则 (Trae / CatPaw / Qoder / Cursor)
  try {
    RuleSync.syncAll(cwd);
  } catch (e) {
    console.warn(`   ➔ ⚠️ 同步 IDE 规则失败:`, e.message);
  }

  // 5. 校验《永乐大典》双向连接状态
  const yongleActive = checkYongleInstalled();
  console.log(`   ➔ 🏛️ 《永乐大典》双向知识连接: ${yongleActive ? '✅ 已连接就绪' : '⚠️ 未安装 (运行 sansheng init 可引导安装)'}`);

  console.log(`\n🎉 【更新完成】三省六部核心指令集、工作区配置与 IDE 工具链均已达到最新就绪状态！\n`);
}
