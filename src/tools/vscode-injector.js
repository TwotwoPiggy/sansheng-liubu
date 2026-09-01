import fs from 'fs';
import path from 'path';

/**
 * 自动为工作区注入 VS Code 与 GitHub Copilot 专属增强套件
 */
export function injectVSCodeEnhancements(cwd = process.cwd()) {
  const templateDir = path.resolve(new URL('../templates', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));

  // 1. 注入 .github/copilot-instructions.md
  const githubDir = path.join(cwd, '.github');
  if (!fs.existsSync(githubDir)) fs.mkdirSync(githubDir, { recursive: true });

  const copilotInstructionsPath = path.join(githubDir, 'copilot-instructions.md');
  const srcInstructions = path.join(templateDir, 'copilot-instructions.md');
  if (fs.existsSync(srcInstructions)) {
    fs.copyFileSync(srcInstructions, copilotInstructionsPath);
  }

  // 2. 注入 .github/prompts/ 与 .vscode/prompts/ (支持 /sansheng 与 /sansheng-liubu 双别名)
  const ghPromptsDir = path.join(githubDir, 'prompts');
  if (!fs.existsSync(ghPromptsDir)) fs.mkdirSync(ghPromptsDir, { recursive: true });

  const vscodeDir = path.join(cwd, '.vscode');
  if (!fs.existsSync(vscodeDir)) fs.mkdirSync(vscodeDir, { recursive: true });
  const vsPromptsDir = path.join(vscodeDir, 'prompts');
  if (!fs.existsSync(vsPromptsDir)) fs.mkdirSync(vsPromptsDir, { recursive: true });

  const srcPrompt = path.join(templateDir, 'sansheng.prompt.md');
  const srcPromptAlias = path.join(templateDir, 'sansheng-liubu.prompt.md');

  if (fs.existsSync(srcPrompt)) {
    fs.copyFileSync(srcPrompt, path.join(ghPromptsDir, 'sansheng.prompt.md'));
    fs.copyFileSync(srcPrompt, path.join(vsPromptsDir, 'sansheng.prompt.md'));
  }
  if (fs.existsSync(srcPromptAlias)) {
    fs.copyFileSync(srcPromptAlias, path.join(ghPromptsDir, 'sansheng-liubu.prompt.md'));
    fs.copyFileSync(srcPromptAlias, path.join(vsPromptsDir, 'sansheng-liubu.prompt.md'));
  }

  // 3. 注入 .vscode/mcp.json 与 .vscode/tasks.json
  const srcMcp = path.join(templateDir, 'mcp.json');
  const destMcp = path.join(vscodeDir, 'mcp.json');
  if (fs.existsSync(srcMcp) && !fs.existsSync(destMcp)) {
    fs.copyFileSync(srcMcp, destMcp);
  }

  const srcTasks = path.join(templateDir, 'tasks.json');
  const destTasks = path.join(vscodeDir, 'tasks.json');
  if (fs.existsSync(srcTasks) && !fs.existsSync(destTasks)) {
    fs.copyFileSync(srcTasks, destTasks);
  }

  // 4. 自动配置 .vscode/settings.json (激活 chat.promptFiles 确保 / 指令生效)
  const settingsPath = path.join(vscodeDir, 'settings.json');
  let settings = {};
  if (fs.existsSync(settingsPath)) {
    try {
      settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    } catch (_) {
      settings = {};
    }
  }
  if (!settings['chat.promptFiles']) {
    settings['chat.promptFiles'] = true;
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
  }

  // 5. 自动在 .gitignore 中维护运行时本地缓存
  const gitignorePath = path.join(cwd, '.gitignore');
  if (fs.existsSync(gitignorePath)) {
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

  // 6. 注入全局用户级 VS Code Prompts（彻底解决工作区索引延迟/偶尔丢失需重启的问题）
  try {
    let userPromptsDir = null;
    if (process.platform === 'win32' && process.env.APPDATA) {
      userPromptsDir = path.join(process.env.APPDATA, 'Code', 'User', 'prompts');
    } else if (process.platform === 'darwin' && process.env.HOME) {
      userPromptsDir = path.join(process.env.HOME, 'Library', 'Application Support', 'Code', 'User', 'prompts');
    } else if (process.env.HOME) {
      userPromptsDir = path.join(process.env.HOME, '.config', 'Code', 'User', 'prompts');
    }
    if (userPromptsDir) {
      if (!fs.existsSync(userPromptsDir)) fs.mkdirSync(userPromptsDir, { recursive: true });
      if (fs.existsSync(srcPrompt)) {
        fs.copyFileSync(srcPrompt, path.join(userPromptsDir, 'sansheng.prompt.md'));
      }
      if (fs.existsSync(srcPromptAlias)) {
        fs.copyFileSync(srcPromptAlias, path.join(userPromptsDir, 'sansheng-liubu.prompt.md'));
      }
    }
  } catch (_) {}

  console.log(`✨ [VS Code Copilot 专属增强]`);
  console.log(`   ➔ 已注入 Copilot 隐式全局法则: .github/copilot-instructions.md`);
  console.log(`   ➔ 已注入 VS Code 原生 Prompt 模板: /sansheng & /sansheng-liubu (项目级 + 全局用户级)`);
  console.log(`   ➔ 已激活 VS Code Prompt 模式: .vscode/settings.json (chat.promptFiles: true)`);
  console.log(`   ➔ 已挂载 VS Code 原生 MCP 知识图谱: .vscode/mcp.json`);
  console.log(`   ➔ 已配置 VS Code 快捷自动化任务: .vscode/tasks.json`);
}
