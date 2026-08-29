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

  // 2. 注入 .github/prompts/sansheng.prompt.md
  const promptsDir = path.join(githubDir, 'prompts');
  if (!fs.existsSync(promptsDir)) fs.mkdirSync(promptsDir, { recursive: true });
  const srcPrompt = path.join(templateDir, 'sansheng.prompt.md');
  if (fs.existsSync(srcPrompt)) {
    fs.copyFileSync(srcPrompt, path.join(promptsDir, 'sansheng.prompt.md'));
  }

  // 3. 注入 .vscode/mcp.json 与 .vscode/tasks.json
  const vscodeDir = path.join(cwd, '.vscode');
  if (!fs.existsSync(vscodeDir)) fs.mkdirSync(vscodeDir, { recursive: true });

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

  console.log(`✨ [VS Code Copilot 专属增强]`);
  console.log(`   ➔ 已注入 Copilot 隐式全局法则: .github/copilot-instructions.md`);
  console.log(`   ➔ 已注入 VS Code 原生 Prompt 模板: .github/prompts/sansheng.prompt.md`);
  console.log(`   ➔ 已挂载 VS Code 原生 MCP 知识图谱: .vscode/mcp.json`);
  console.log(`   ➔ 已配置 VS Code 快捷自动化任务: .vscode/tasks.json`);
}
