import fs from 'fs';
import path from 'path';
import os from 'os';
import readline from 'readline';
import { execSync } from 'child_process';

/**
 * 检测当前环境是否已安装《永乐大典》(Yongle Dadian)
 */
export function checkYongleInstalled() {
  // 1. 检查全局命令行
  try {
    const checkCmd = process.platform === 'win32' ? 'where yongle' : 'which yongle';
    execSync(checkCmd, { stdio: 'ignore' });
    return true;
  } catch (_) {}

  // 2. 检查 IDE Skills 目录
  const homeDir = os.homedir();
  const potentialPaths = [
    path.join(homeDir, '.gemini/antigravity/skills/yongle-sync'),
    path.join(homeDir, '.gemini/antigravity/skills/yongle-search'),
    path.join(homeDir, '.gemini/config/plugins/yongle-plugin'),
    path.join(process.cwd(), '../yongle-dadian'),
    path.join(process.cwd(), '../yongle')
  ];

  for (const p of potentialPaths) {
    if (fs.existsSync(p)) return true;
  }

  return false;
}

/**
 * 交互式询问并自动安装《永乐大典》
 */
export async function promptAndInstallYongle() {
  const isInstalled = checkYongleInstalled();
  if (isInstalled) {
    console.log(`🏛️ [环境检测] 已检测到《永乐大典》知识库系统，双向经验复利飞轮已就绪。`);
    return true;
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  console.log(`\n------------------------------------------------------------`);
  console.log(`💡 [环境检测] 未发现全局《永乐大典》(yongle-dadian) 知识库插件。`);
  console.log(`   安装后可在开发前自动召回历史避坑经验，并在修复缺陷后自动复盘归档。`);
  
  const answer = await new Promise((resolve) => {
    rl.question(`👉 是否自动安装《永乐大典》？ [Y/n] (默认: Yes): `, (ans) => {
      resolve(ans.trim());
    });
  });

  rl.close();

  if (!answer || answer.toLowerCase().startsWith('y') || answer === '1') {
    console.log(`\n⏳ 正在自动安装《永乐大典》插件 (npm install -g yongle-dadian)...`);
    try {
      execSync('npm install -g yongle-dadian', { stdio: 'inherit' });
      console.log(`✅ 《永乐大典》安装成功！已自动与三省六部完成双向桥接。\n`);
      return true;
    } catch (err) {
      console.warn(`⚠️ 自动安装失败 (可能由于网络或权限)，已跳过: ${err.message}`);
      return false;
    }
  } else {
    console.log(`⏩ 已跳过《永乐大典》安装。(后续可随时运行 sansheng update 重新接入)\n`);
    return false;
  }
}
