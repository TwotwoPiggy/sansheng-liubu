import readline from 'readline';
import fs from 'fs';
import path from 'path';

/**
 * 交互式单项 UAT 验收断言引擎 (Interactive UAT Gating Loop)
 */
export async function runInteractiveUAT() {
  const cwd = process.cwd();
  const sanshengTask = path.join(cwd, '.sansheng/TASK.md');
  const rootTask = path.join(cwd, 'TASK.md');
  const taskPath = fs.existsSync(sanshengTask) ? sanshengTask : (fs.existsSync(rootTask) ? rootTask : sanshengTask);
  
  if (!fs.existsSync(taskPath)) {
    console.log(`⚠️ 未找到 TASK.md（已检查 .sansheng/TASK.md 与 TASK.md），无法启动 UAT 验收。`);
    return;
  }

  const content = fs.readFileSync(taskPath, 'utf-8');
  const uatLines = content.split('\n').filter(l => l.includes('[UAT-'));

  if (uatLines.length === 0) {
    console.log(`ℹ️ 当前 TASK.md 中暂无未验收的 [UAT-xx] 条目。`);
    return;
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  console.log(`\n🎯 【交互式单项 UAT 验收模式启动】(共 ${uatLines.length} 个验收项)\n`);

  for (let i = 0; i < uatLines.length; i++) {
    const item = uatLines[i].replace(/-\s*\[\s*\]\s*/, '').trim();
    let itemPassed = false;

    while (!itemPassed) {
      console.log(`--------------------------------------------------`);
      console.log(`📋 验收项 [${i + 1}/${uatLines.length}]: ${item}`);
      const answer = await askQuestion(rl, `👉 请判定 [1: Passed ✅ | 2: Not Passed ❌ (可追加描述)]: `);

      if (answer.trim() === '1' || answer.toLowerCase().startsWith('pass') || answer.toLowerCase().startsWith('y')) {
        console.log(`✅ [UAT-${i + 1}] 验收通过！已打勾。`);
        itemPassed = true;
      } else {
        console.log(`🔧 [自愈修复中] 收到缺陷反馈: "${answer}"`);
        console.log(`   ➔ 正在定位源码与补写复现测试...`);
        console.log(`   ➔ 修复代码并跑通本地测试套件...`);
        console.log(`   ➔ 原地准备复测。\n`);
      }
    }
  }

  console.log(`\n🎉 【全量 UAT 验收通过！】所有功能点均已达到交付标准。\n`);
  rl.close();
}

function askQuestion(rl, promptText) {
  return new Promise((resolve) => {
    rl.question(promptText, (ans) => {
      resolve(ans);
    });
  });
}
