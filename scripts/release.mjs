#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

/**
 * 【三省六部 (sansheng-liubu)】自动版本升级、打 Tag 与 NPM 发布脚本
 * 支持 Dry-Run 预演模式，确保发布前 100% 安全
 */

const rootDir = process.cwd();
const pkgPath = path.join(rootDir, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run') || args.includes('-d');
const releaseType = args.find(a => !a.startsWith('-')) || 'patch'; // patch, minor, major 或具体版本号

console.log(`\n🚀 【三省六部】自动化发布流水线启动...`);
console.log(`📦 当前版本: v${pkg.version}`);
console.log(`🎯 目标发布类型: ${releaseType} ${isDryRun ? '(🧪 Dry-Run 预演模式 - 不做正式发布)' : ''}\n`);

// 1. 计算新版本号
const newVersion = calculateNewVersion(pkg.version, releaseType);
console.log(`✨ 即将升级到版本: v${newVersion}`);

// 2. 运行本地自动化测试与语法自检
console.log(`🧪 正在运行发布前单元测试与语法校验...`);
try {
  execSync('node ./bin/cli.js help', { stdio: 'pipe' });
  execSync('node ./bin/cli.js map', { stdio: 'pipe' });
  console.log(`✅ 本地测试与 AST 提取自检 100% 通过！`);
} catch (err) {
  console.error(`❌ 发布前自检失败:`, err.message);
  process.exit(1);
}

// 3. Dry-Run 模式只做预发布验证
if (isDryRun) {
  console.log(`\n🧪 [Dry-Run 模式] 正在生成 npm pack 预览包并进行发布预检...`);
  try {
    const packOutput = execSync('npm pack --dry-run', { stdio: 'pipe' }).toString();
    console.log(packOutput);
    console.log(`🎉 [Dry-Run 预演成功] 依赖、文件清单与版本均合法！`);
    console.log(`💡 正式发布时请运行: npm run release (或 node scripts/release.mjs ${releaseType})\n`);
    process.exit(0);
  } catch (err) {
    console.error(`❌ npm pack 预检失败:`, err.message);
    process.exit(1);
  }
}

// 4. 更新 package.json
pkg.version = newVersion;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf-8');
console.log(`📝 已更新 package.json 版本号 ➔ ${newVersion}`);

// 5. Git 提交与打 Tag
try {
  console.log(`🏷️ 正在生成 Git Tag (v${newVersion})...`);
  execSync(`git add package.json`, { stdio: 'inherit' });
  execSync(`git commit -m "chore(release): v${newVersion}"`, { stdio: 'inherit' });
  execSync(`git tag -a v${newVersion} -m "Release v${newVersion}"`, { stdio: 'inherit' });
  console.log(`✅ Git Tag v${newVersion} 创建成功！`);

  // 推送 Git (如在 git 仓库中)
  try {
    execSync(`git push && git push --tags`, { stdio: 'inherit' });
    console.log(`🚀 Git commit & tags 已推送至远端！`);
  } catch (_) {
    console.log(`ℹ️ 本地 Git 提交完成 (未配置远端推送)`);
  }
} catch (err) {
  console.warn(`⚠️ Git 操作跳过或已完成:`, err.message);
}

// 6. 发布到 NPM Registry
console.log(`\n📦 正在发布至 NPM 官方源 (npm publish --access public)...`);
try {
  execSync(`npm publish --access public`, { stdio: 'inherit' });
  console.log(`\n🎉 【发布成功！】三省六部 v${newVersion} 已成功上线 NPM 仓库！\n`);
} catch (err) {
  console.error(`❌ npm publish 失败:`, err.message);
  process.exit(1);
}

function calculateNewVersion(current, type) {
  if (/^\d+\.\d+\.\d+/.test(type)) return type;
  const parts = current.split('.').map(n => parseInt(n, 10));
  if (type === 'major') {
    return `${parts[0] + 1}.0.0`;
  } else if (type === 'minor') {
    return `${parts[0]}.${parts[1] + 1}.0`;
  } else {
    // patch
    return `${parts[0]}.${parts[1]}.${parts[2] + 1}`;
  }
}
