import fs from 'fs';
import path from 'path';

/**
 * 跨 AI IDE 规则转译与同步引擎 (RuleSync)
 * 适配支持: Trae-CN, CatPaw AI, Qoder, Cursor, Claude Code, Windsurf ➔ VS Code Copilot
 */
export class RuleSync {
  /**
   * 嗅探工作区中存在的各家 AI IDE 规则文件
   */
  static detectSources(cwd = process.cwd()) {
    const sources = [];

    // 1. Trae-CN (字节)
    const traeDir = path.join(cwd, '.trae');
    if (fs.existsSync(traeDir)) {
      const traeFiles = ['rules.md', 'project_rules.md'];
      for (const f of traeFiles) {
        const full = path.join(traeDir, f);
        if (fs.existsSync(full)) sources.push({ type: 'trae', path: full, name: f });
      }
      const traeRulesSub = path.join(traeDir, 'rules');
      if (fs.existsSync(traeRulesSub) && fs.statSync(traeRulesSub).isDirectory()) {
        const files = fs.readdirSync(traeRulesSub).filter(f => f.endsWith('.md'));
        files.forEach(f => sources.push({ type: 'trae', path: path.join(traeRulesSub, f), name: f }));
      }
    }

    // 2. CatPaw AI (猫爪)
    const catpawDir = path.join(cwd, '.catpaw');
    if (fs.existsSync(catpawDir)) {
      const catpawFiles = ['rules.md', 'system_prompt.md'];
      for (const f of catpawFiles) {
        const full = path.join(catpawDir, f);
        if (fs.existsSync(full)) sources.push({ type: 'catpaw', path: full, name: f });
      }
      const cpRules = path.join(catpawDir, 'rules');
      if (fs.existsSync(cpRules) && fs.statSync(cpRules).isDirectory()) {
        const files = fs.readdirSync(cpRules).filter(f => f.endsWith('.md'));
        files.forEach(f => sources.push({ type: 'catpaw', path: path.join(cpRules, f), name: f }));
      }
      const cpPrompts = path.join(catpawDir, 'prompts');
      if (fs.existsSync(cpPrompts) && fs.statSync(cpPrompts).isDirectory()) {
        const files = fs.readdirSync(cpPrompts).filter(f => f.endsWith('.md'));
        files.forEach(f => sources.push({ type: 'catpaw', path: path.join(cpPrompts, f), name: f, isPrompt: true }));
      }
    }

    // 3. Qoder
    const qoderDir = path.join(cwd, '.qoder');
    if (fs.existsSync(qoderDir)) {
      const qFiles = ['rules.md', 'guidelines.md'];
      for (const f of qFiles) {
        const full = path.join(qoderDir, f);
        if (fs.existsSync(full)) sources.push({ type: 'qoder', path: full, name: f });
      }
      const qRules = path.join(qoderDir, 'rules');
      if (fs.existsSync(qRules) && fs.statSync(qRules).isDirectory()) {
        const files = fs.readdirSync(qRules).filter(f => f.endsWith('.md'));
        files.forEach(f => sources.push({ type: 'qoder', path: path.join(qRules, f), name: f }));
      }
    }
    const qoderRootRule = path.join(cwd, '.qoderrules');
    if (fs.existsSync(qoderRootRule)) {
      sources.push({ type: 'qoder', path: qoderRootRule, name: '.qoderrules' });
    }

    // 4. Cursor (.cursorrules / .cursor/rules/*.mdc)
    const cursorRoot = path.join(cwd, '.cursorrules');
    if (fs.existsSync(cursorRoot)) {
      sources.push({ type: 'cursor', path: cursorRoot, name: '.cursorrules' });
    }
    const cursorRulesDir = path.join(cwd, '.cursor', 'rules');
    if (fs.existsSync(cursorRulesDir) && fs.statSync(cursorRulesDir).isDirectory()) {
      const files = fs.readdirSync(cursorRulesDir).filter(f => f.endsWith('.mdc') || f.endsWith('.md'));
      files.forEach(f => sources.push({ type: 'cursor', path: path.join(cursorRulesDir, f), name: f }));
    }

    // 5. Claude Code / Windsurf
    const claudeMd = path.join(cwd, 'CLAUDE.md');
    if (fs.existsSync(claudeMd)) sources.push({ type: 'claude', path: claudeMd, name: 'CLAUDE.md' });

    const windsurfRules = path.join(cwd, '.windsurfrules');
    if (fs.existsSync(windsurfRules)) sources.push({ type: 'windsurf', path: windsurfRules, name: '.windsurfrules' });

    return sources;
  }

  /**
   * 清洗并标准化专有占位符与宏
   */
  static cleanPlaceholders(content) {
    if (!content) return '';
    return content
      // 清洗各类变量宏
      .replace(/\{\{\s*current_file\s*\}\}/gi, '#file')
      .replace(/\{\{\s*selection\s*\}\}/gi, '#selection')
      .replace(/\{\{\s*workspace\s*\}\}/gi, '@workspace')
      .replace(/@file:([^\s]+)/g, '#file:$1')
      .replace(/\[(CATPAW|TRAE|QODER|CURSOR)_[A-Z_]+\]/g, '')
      .trim();
  }

  /**
   * 解析规则文件并提取元数据
   */
  static parseRuleFile(filePath, type = 'unknown') {
    const raw = fs.readFileSync(filePath, 'utf-8');
    let frontmatter = {};
    let body = raw;

    // 解析 YAML Frontmatter (若存在 --- 开头)
    const fmMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
    if (fmMatch) {
      const fmText = fmMatch[1];
      body = fmMatch[2];
      fmText.split('\n').forEach(line => {
        const idx = line.indexOf(':');
        if (idx > -1) {
          const key = line.slice(0, idx).trim();
          let val = line.slice(idx + 1).trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          frontmatter[key] = val;
        }
      });
    }

    const cleanedBody = this.cleanPlaceholders(body);
    const baseName = path.basename(filePath, path.extname(filePath));
    const name = frontmatter.name || frontmatter.title || baseName.replace(/^[0-9]+[-_]/, '');
    const description = frontmatter.description || `从 ${type.toUpperCase()} 自动同步的规则: ${name}`;
    const globs = frontmatter.globs || frontmatter.applyTo || frontmatter.pattern || '';
    const isPrompt = frontmatter.isPrompt || filePath.includes('prompts');
    const isAlwaysApply = !globs && !isPrompt;

    return {
      sourceType: type,
      filePath,
      name,
      description,
      globs,
      isAlwaysApply,
      frontmatter,
      body: cleanedBody
    };
  }

  /**
   * 执行全量同步 (将所有发现的源规则标准化并注入 VS Code Copilot & .sansheng/rules/)
   */
  static syncAll(cwd = process.cwd()) {
    const detected = this.detectSources(cwd);
    const rulesDir = path.join(cwd, '.sansheng', 'rules');
    if (!fs.existsSync(rulesDir)) fs.mkdirSync(rulesDir, { recursive: true });

    if (detected.length === 0) {
      console.log(`ℹ️ 当前工作区未检测到 Trae / CatPaw / Qoder / Cursor 等第三方规则文件。`);
      return { totalDetected: 0, globalRules: 0, promptRules: 0 };
    }

    console.log(`🔍 [多 IDE 规则嗅探] 检测到 ${detected.length} 个规则来源:`);
    detected.forEach(d => console.log(`   ➔ [${d.type.toUpperCase()}] ${path.relative(cwd, d.path)}`));

    const parsedRules = detected.map(d => this.parseRuleFile(d.path, d.type));

    // 1. 归类为全局常驻规则 vs 场景 Prompt 规则
    const globalSnippets = [];
    const promptRules = [];

    parsedRules.forEach(r => {
      // 备份保存至 .sansheng/rules/
      const safeName = r.name.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
      const backupPath = path.join(rulesDir, `${safeName}.md`);
      fs.writeFileSync(backupPath, `# ${r.name} (${r.sourceType.toUpperCase()})\n> ${r.description}\n\n${r.body}`, 'utf-8');

      if (r.isAlwaysApply && !r.globs) {
        globalSnippets.push(`\n### 📌 [${r.sourceType.toUpperCase()}] ${r.name}\n${r.body}`);
      } else {
        promptRules.push(r);
      }
    });

    // 2. 将全局常驻规则追加合并到 .github/copilot-instructions.md
    const githubDir = path.join(cwd, '.github');
    if (!fs.existsSync(githubDir)) fs.mkdirSync(githubDir, { recursive: true });
    const copilotInstructionsPath = path.join(githubDir, 'copilot-instructions.md');

    if (globalSnippets.length > 0 && fs.existsSync(copilotInstructionsPath)) {
      let currentInst = fs.readFileSync(copilotInstructionsPath, 'utf-8');
      const marker = '\n\n## 🔄 [多 AI IDE 外部同步规则集 (Auto-Synced)]';
      if (currentInst.includes(marker)) {
        currentInst = currentInst.split(marker)[0];
      }
      const updatedInst = currentInst + marker + '\n' + globalSnippets.join('\n') + '\n';
      fs.writeFileSync(copilotInstructionsPath, updatedInst, 'utf-8');
      console.log(`✅ 已将 ${globalSnippets.length} 条全局规则追加合并至: .github/copilot-instructions.md`);
    }

    // 3. 将场景/带作用域规则生成为 VS Code Prompt 文件
    const ghPromptsDir = path.join(githubDir, 'prompts');
    if (!fs.existsSync(ghPromptsDir)) fs.mkdirSync(ghPromptsDir, { recursive: true });

    const vscodeDir = path.join(cwd, '.vscode');
    if (!fs.existsSync(vscodeDir)) fs.mkdirSync(vscodeDir, { recursive: true });
    const vsPromptsDir = path.join(vscodeDir, 'prompts');
    if (!fs.existsSync(vsPromptsDir)) fs.mkdirSync(vsPromptsDir, { recursive: true });

    // 用户全局目录
    let userPromptsDir = null;
    if (process.platform === 'win32' && process.env.APPDATA) {
      userPromptsDir = path.join(process.env.APPDATA, 'Code', 'User', 'prompts');
    } else if (process.platform === 'darwin' && process.env.HOME) {
      userPromptsDir = path.join(process.env.HOME, 'Library', 'Application Support', 'Code', 'User', 'prompts');
    } else if (process.env.HOME) {
      userPromptsDir = path.join(process.env.HOME, '.config', 'Code', 'User', 'prompts');
    }
    if (userPromptsDir && !fs.existsSync(userPromptsDir)) {
      try { fs.mkdirSync(userPromptsDir, { recursive: true }); } catch (_) {}
    }

    promptRules.forEach(r => {
      const safeName = r.name.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
      const frontmatterLines = [
        '---',
        `name: ${safeName}`,
        `description: ${r.description}`
      ];
      if (r.globs) {
        frontmatterLines.push(`applyTo: "${r.globs}"`);
      }
      frontmatterLines.push('---', '', r.body, '');

      const promptContent = frontmatterLines.join('\n');
      const ghPath = path.join(ghPromptsDir, `${safeName}.prompt.md`);
      const vsPath = path.join(vsPromptsDir, `${safeName}.prompt.md`);

      fs.writeFileSync(ghPath, promptContent, 'utf-8');
      fs.writeFileSync(vsPath, promptContent, 'utf-8');

      if (userPromptsDir && fs.existsSync(userPromptsDir)) {
        try {
          fs.writeFileSync(path.join(userPromptsDir, `${safeName}.prompt.md`), promptContent, 'utf-8');
        } catch (_) {}
      }

      console.log(`   ➔ 已转译生成 Prompt 模板: /${safeName} (作用域: ${r.globs || '全局'})`);
    });

    console.log(`\n🎉 [规则同步完成]`);
    console.log(`   • 集中归档: .sansheng/rules/ (${parsedRules.length} 个规则)`);
    console.log(`   • 全局注入: .github/copilot-instructions.md (${globalSnippets.length} 项)`);
    console.log(`   • 斜杠指令: /sansheng & ${promptRules.map(p => '/' + p.name.toLowerCase()).join(' ')}`);

    return {
      totalDetected: detected.length,
      globalRules: globalSnippets.length,
      promptRules: promptRules.length
    };
  }

  /**
   * 反向导出至指定的 AI IDE (如 trae, catpaw, qoder)
   */
  static exportToIDE(targetIDE, cwd = process.cwd()) {
    const rulesDir = path.join(cwd, '.sansheng', 'rules');
    if (!fs.existsSync(rulesDir)) {
      console.log(`⚠️ 未在 .sansheng/rules/ 找到已归档的规则，请先运行 sansheng sync-rules。`);
      return;
    }

    const files = fs.readdirSync(rulesDir).filter(f => f.endsWith('.md'));
    const combinedContent = files.map(f => fs.readFileSync(path.join(rulesDir, f), 'utf-8')).join('\n\n---\n\n');

    const ide = targetIDE.toLowerCase().trim();
    if (ide === 'trae' || ide === 'trae-cn') {
      const traeDir = path.join(cwd, '.trae');
      if (!fs.existsSync(traeDir)) fs.mkdirSync(traeDir, { recursive: true });
      fs.writeFileSync(path.join(traeDir, 'rules.md'), combinedContent, 'utf-8');
      console.log(`✅ 已成功导出 Trae 规则: .trae/rules.md`);
    } else if (ide === 'catpaw' || ide === 'catpawai') {
      const catpawDir = path.join(cwd, '.catpaw');
      if (!fs.existsSync(catpawDir)) fs.mkdirSync(catpawDir, { recursive: true });
      fs.writeFileSync(path.join(catpawDir, 'rules.md'), combinedContent, 'utf-8');
      console.log(`✅ 已成功导出 CatPaw 规则: .catpaw/rules.md`);
    } else if (ide === 'qoder') {
      const qoderDir = path.join(cwd, '.qoder');
      if (!fs.existsSync(qoderDir)) fs.mkdirSync(qoderDir, { recursive: true });
      fs.writeFileSync(path.join(qoderDir, 'rules.md'), combinedContent, 'utf-8');
      console.log(`✅ 已成功导出 Qoder 规则: .qoder/rules.md`);
    } else if (ide === 'cursor') {
      fs.writeFileSync(path.join(cwd, '.cursorrules'), combinedContent, 'utf-8');
      console.log(`✅ 已成功导出 Cursor 规则: .cursorrules`);
    } else {
      console.log(`⚠️ 未知目标 IDE: ${targetIDE} (支持: trae, catpaw, qoder, cursor)`);
    }
  }
}
