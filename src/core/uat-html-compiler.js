import fs from 'fs';
import path from 'path';
import { parseUATBlocks } from './uat-runner.js';

/**
 * 将 TASK.md 编译为纯本地交互式 UAT HTML 验收看板 (0 Token)
 * @param {string} markdownContent TASK.md 内容
 * @param {object} options 选项
 * @returns {string} 完整的静态 HTML 内容
 */
export function compileUATToHtml(markdownContent, options = {}) {
  const items = parseUATBlocks(markdownContent || '');
  const titleMatch = (markdownContent || '').match(/^#\s+(.+)$/m);
  const projectTitle = options.title || (titleMatch ? titleMatch[1].trim() : '三省六部 · 人工 UAT 交互式验收看板');
  
  const total = items.length;
  const passed = items.filter(i => i.passed).length;
  const initialPercent = total > 0 ? Math.round((passed / total) * 100) : 100;

  const rawJson = JSON.stringify(items).replace(/</g, '\\u003c');
  const rawMdJson = JSON.stringify(markdownContent || '').replace(/</g, '\\u003c');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(projectTitle)}</title>
  <style>
    :root {
      --bg: #0f172a;
      --card-bg: #1e293b;
      --card-border: #334155;
      --text-main: #f8fafc;
      --text-sub: #94a3b8;
      --primary: #3b82f6;
      --primary-hover: #2563eb;
      --success: #10b981;
      --success-bg: rgba(16, 185, 129, 0.12);
      --warning: #f59e0b;
      --warning-bg: rgba(245, 158, 11, 0.12);
      --danger: #ef4444;
      --tag-bg: #334155;
      --code-bg: #0f172a;
    }
    @media (prefers-color-scheme: light) {
      :root {
        --bg: #f8fafc;
        --card-bg: #ffffff;
        --card-border: #e2e8f0;
        --text-main: #0f172a;
        --text-sub: #64748b;
        --primary: #2563eb;
        --primary-hover: #1d4ed8;
        --success: #059669;
        --success-bg: #ecfdf5;
        --warning: #d97706;
        --warning-bg: #fffbeb;
        --danger: #dc2626;
        --tag-bg: #f1f5f9;
        --code-bg: #f1f5f9;
      }
    }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif; }
    body { background-color: var(--bg); color: var(--text-main); line-height: 1.6; padding: 24px 16px; }
    .container { max-width: 900px; margin: 0 auto; }
    
    /* Header */
    header { margin-bottom: 24px; padding-bottom: 20px; border-bottom: 1px solid var(--card-border); }
    .header-title-row { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; }
    h1 { font-size: 1.5rem; font-weight: 700; display: flex; align-items: center; gap: 8px; }
    .badge-0token { font-size: 0.75rem; background: var(--success-bg); color: var(--success); padding: 2px 8px; border-radius: 9999px; border: 1px solid var(--success); font-weight: normal; }
    
    /* Progress Dashboard */
    .progress-box { background: var(--card-bg); border: 1px solid var(--card-border); border-radius: 12px; padding: 16px; margin: 16px 0; }
    .progress-stats { display: flex; justify-content: space-between; align-items: center; font-size: 0.9rem; color: var(--text-sub); margin-bottom: 8px; }
    .progress-bar-bg { background: var(--tag-bg); border-radius: 9999px; height: 10px; overflow: hidden; }
    .progress-bar-fill { background: linear-gradient(90deg, var(--primary), var(--success)); height: 100%; transition: width 0.3s ease; }
    
    /* Action Bar */
    .action-bar { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; justify-content: space-between; margin-bottom: 20px; }
    .btn-group { display: flex; gap: 8px; flex-wrap: wrap; }
    button { background: var(--card-bg); color: var(--text-main); border: 1px solid var(--card-border); padding: 8px 14px; border-radius: 8px; cursor: pointer; font-size: 0.85rem; font-weight: 500; display: inline-flex; align-items: center; gap: 6px; transition: all 0.2s; }
    button:hover { border-color: var(--primary); color: var(--primary); }
    button.btn-primary { background: var(--primary); color: #ffffff; border-color: var(--primary); }
    button.btn-primary:hover { background: var(--primary-hover); }
    button.btn-active { background: var(--primary); color: #ffffff; border-color: var(--primary); }
    
    /* Tabs */
    .filter-tabs { display: flex; background: var(--card-bg); border: 1px solid var(--card-border); border-radius: 8px; padding: 2px; }
    .filter-btn { border: none; background: transparent; padding: 6px 12px; border-radius: 6px; font-size: 0.8rem; }
    .filter-btn.active { background: var(--primary); color: #fff; }
    
    /* UAT Card */
    .uat-card { background: var(--card-bg); border: 1px solid var(--card-border); border-radius: 12px; padding: 18px; margin-bottom: 14px; transition: all 0.2s; position: relative; }
    .uat-card.passed { border-color: var(--success); }
    .uat-card-header { display: flex; align-items: flex-start; gap: 14px; }
    
    /* Custom Checkbox */
    .checkbox-wrapper { position: relative; display: flex; align-items: center; margin-top: 2px; }
    .uat-checkbox { appearance: none; width: 22px; height: 22px; border: 2px solid var(--card-border); border-radius: 6px; cursor: pointer; background: var(--card-bg); display: grid; place-content: center; transition: all 0.2s; }
    .uat-checkbox:checked { background: var(--success); border-color: var(--success); }
    .uat-checkbox:checked::after { content: "✔"; color: #fff; font-size: 13px; font-weight: bold; }
    .uat-checkbox:hover { border-color: var(--primary); }
    
    .uat-title-area { flex: 1; }
    .uat-meta-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 4px; }
    .tag-id { font-weight: 700; color: var(--primary); font-size: 0.85rem; font-family: monospace; background: var(--tag-bg); padding: 1px 6px; border-radius: 4px; }
    .tag-trace { font-size: 0.75rem; color: var(--text-sub); background: var(--tag-bg); padding: 1px 6px; border-radius: 4px; }
    .status-badge { font-size: 0.75rem; padding: 1px 8px; border-radius: 9999px; font-weight: 600; margin-left: auto; }
    .status-badge.pending { background: var(--warning-bg); color: var(--warning); border: 1px solid var(--warning); }
    .status-badge.done { background: var(--success-bg); color: var(--success); border: 1px solid var(--success); }
    .uat-title { font-size: 1rem; font-weight: 600; }
    
    /* Details */
    .uat-details { margin-top: 14px; padding-top: 12px; border-top: 1px dashed var(--card-border); font-size: 0.88rem; display: flex; flex-direction: column; gap: 8px; }
    .detail-row { display: flex; gap: 8px; }
    .detail-label { font-weight: 600; color: var(--text-sub); min-width: 80px; flex-shrink: 0; }
    .detail-content { color: var(--text-main); flex: 1; }
    .prd-expected-box { background: var(--success-bg); border-left: 3px solid var(--success); padding: 8px 12px; border-radius: 0 6px 6px 0; margin-top: 4px; }
    .prd-expected-box .detail-label { color: var(--success); }
    
    /* Defect Box */
    .defect-section { margin-top: 10px; }
    .defect-toggle { font-size: 0.75rem; color: var(--text-sub); background: none; border: none; padding: 0; cursor: pointer; text-decoration: underline; }
    .defect-panel { display: none; margin-top: 8px; background: var(--tag-bg); padding: 10px; border-radius: 8px; }
    .defect-input { width: 100%; padding: 8px; border: 1px solid var(--card-border); background: var(--bg); color: var(--text-main); border-radius: 6px; font-size: 0.85rem; margin-bottom: 6px; }
    
    /* Toast */
    #toast { position: fixed; bottom: 24px; right: 24px; background: var(--card-bg); color: var(--text-main); border: 1px solid var(--primary); box-shadow: 0 10px 25px rgba(0,0,0,0.3); border-radius: 8px; padding: 12px 18px; font-size: 0.85rem; display: none; z-index: 1000; animation: fadeIn 0.3s; }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="header-title-row">
        <h1>🏛️ ${escapeHtml(projectTitle)} <span class="badge-0token">0 Token 本地编译</span></h1>
      </div>
      <div class="progress-box">
        <div class="progress-stats">
          <span>验收通过进度: <strong id="progress-text">${passed} / ${total} (${initialPercent}%)</strong></span>
          <span id="sync-status">💾 本地离线就绪</span>
        </div>
        <div class="progress-bar-bg">
          <div id="progress-fill" class="progress-bar-fill" style="width: ${initialPercent}%;"></div>
        </div>
      </div>
    </header>

    <div class="action-bar">
      <div class="btn-group">
        <button id="btn-link-file" class="btn-primary" onclick="linkLocalFile()">📁 关联本地 TASK.md (自动静默保存)</button>
        <button onclick="copyLatestMarkdown()">📋 复制已更新 Markdown</button>
        <button onclick="downloadMarkdown()">💾 下载更新文件</button>
      </div>
      <div class="filter-tabs">
        <button class="filter-btn active" onclick="filterItems('all', this)">全部 (<span id="count-all">${total}</span>)</button>
        <button class="filter-btn" onclick="filterItems('pending', this)">待验收 (<span id="count-pending">${total - passed}</span>)</button>
        <button class="filter-btn" onclick="filterItems('passed', this)">已通过 (<span id="count-passed">${passed}</span>)</button>
      </div>
    </div>

    <main id="uat-list"></main>
  </div>

  <div id="toast"></div>

  <script>
    let items = ${rawJson};
    let rawMarkdown = ${rawMdJson};
    let fileHandle = null;
    let activeFilter = 'all';

    function init() {
      // 尝试从 localStorage 恢复用户最近修改
      const cached = localStorage.getItem('sansheng_uat_states');
      if (cached) {
        try {
          const stateMap = JSON.parse(cached);
          items.forEach(it => {
            if (stateMap[it.id] !== undefined) {
              it.passed = stateMap[it.id];
            }
          });
        } catch (e) {}
      }
      render();
    }

    function render() {
      const listEl = document.getElementById('uat-list');
      listEl.innerHTML = '';

      let passedCount = 0;
      items.forEach((item, index) => {
        if (item.passed) passedCount++;

        const isVisible = activeFilter === 'all' || (activeFilter === 'passed' && item.passed) || (activeFilter === 'pending' && !item.passed);
        if (!isVisible) return;

        const card = document.createElement('div');
        card.className = 'uat-card' + (item.passed ? ' passed' : '');
        card.innerHTML = \`
          <div class="uat-card-header">
            <div class="checkbox-wrapper">
              <input type="checkbox" class="uat-checkbox" \${item.passed ? 'checked' : ''} onchange="toggleUAT('\${item.id}', this.checked)">
            </div>
            <div class="uat-title-area">
              <div class="uat-meta-row">
                <span class="tag-id">[\${escapeHtml(item.id)}]</span>
                \${item.trace ? \`<span class="tag-trace">📌 溯源: \${escapeHtml(item.trace)}</span>\` : ''}
                <span class="status-badge \${item.passed ? 'done' : 'pending'}">\${item.passed ? '已通过 ✅' : '待验收 ⏳'}</span>
              </div>
              <div class="uat-title">\${escapeHtml(item.title)}</div>
            </div>
          </div>

          <div class="uat-details">
            \${item.preconditions ? \`
              <div class="detail-row">
                <div class="detail-label">🛠️ 前置数据</div>
                <div class="detail-content">\${escapeHtml(item.preconditions)}</div>
              </div>\` : ''}
            \${item.steps ? \`
              <div class="detail-row">
                <div class="detail-label">🪜 操作步骤</div>
                <div class="detail-content">\${escapeHtml(item.steps)}</div>
              </div>\` : ''}
            \${item.expected ? \`
              <div class="prd-expected-box">
                <div class="detail-row">
                  <div class="detail-label">🎯 PRD预期</div>
                  <div class="detail-content"><strong>\${escapeHtml(item.expected)}</strong></div>
                </div>
              </div>\` : ''}
          </div>

          <div class="defect-section">
            <button class="defect-toggle" onclick="toggleDefectBox('defect-\${item.id}')">⚠️ 发现缺陷？点击记录反馈</button>
            <div id="defect-\${item.id}" class="defect-panel">
              <input type="text" class="defect-input" placeholder="输入与 PRD 预期的实际偏差描述..." id="input-\${item.id}">
              <button onclick="copyDefectPrompt('\${item.id}')">📋 复制自愈指令发给 AI</button>
            </div>
          </div>
        \`;
        listEl.appendChild(card);
      });

      // 更新进度条与计数
      const total = items.length;
      const percent = total > 0 ? Math.round((passedCount / total) * 100) : 100;
      document.getElementById('progress-text').innerText = \`\${passedCount} / \${total} (\${percent}%)\`;
      document.getElementById('progress-fill').style.width = percent + '%';
      document.getElementById('count-all').innerText = total;
      document.getElementById('count-pending').innerText = total - passedCount;
      document.getElementById('count-passed').innerText = passedCount;

      // 持久化到 localStorage
      const stateMap = {};
      items.forEach(i => stateMap[i.id] = i.passed);
      localStorage.setItem('sansheng_uat_states', JSON.stringify(stateMap));
    }

    async function toggleUAT(id, isChecked) {
      const target = items.find(i => i.id === id);
      if (!target) return;
      target.passed = isChecked;

      // 实时更新当前内存中的 Markdown
      if (target.rawHeaderLine) {
        const replacement = isChecked
          ? target.rawHeaderLine.replace(/-\\s*\\[\\s*\\]/, '- [x]')
          : target.rawHeaderLine.replace(/-\\s*\\[[xX]\\]/, '- [ ]');
        rawMarkdown = rawMarkdown.replace(target.rawHeaderLine, replacement);
        target.rawHeaderLine = replacement;
      }

      // 若关联了本地文件，自动静默写回磁盘
      if (fileHandle) {
        try {
          const writable = await fileHandle.createWritable();
          await writable.write(rawMarkdown);
          await writable.close();
          showToast(\`✅ 已更新 [\${id}] 并已自动保存至本地 TASK.md！\`);
        } catch (err) {
          showToast(\`⚠️ 保存至本地文件失败: \${err.message}\`);
        }
      } else {
        showToast(\`✅ 已记录 [\${id}] 状态 (点击上方关联本地文件可自动同步)\`);
      }

      render();
    }

    async function linkLocalFile() {
      if (!window.showOpenFilePicker) {
        alert('当前浏览器环境不支持 File System Access API，请使用 Chrome 或 Edge 浏览器体验自动静默保存。');
        return;
      }
      try {
        const [handle] = await window.showOpenFilePicker({
          types: [{ description: 'Markdown Task File', accept: { 'text/markdown': ['.md'] } }]
        });
        fileHandle = handle;
        document.getElementById('btn-link-file').innerHTML = '🟢 已关联: ' + escapeHtml(handle.name) + ' (自动静默保存)';
        document.getElementById('btn-link-file').classList.remove('btn-primary');
        document.getElementById('sync-status').innerText = '🟢 已连接本地磁盘自动保存';
        showToast('🎉 成功关联本地文件！现在在网页勾选将自动实时同步写入。');
      } catch (e) {
        // 用户取消选择
      }
    }

    function copyLatestMarkdown() {
      navigator.clipboard.writeText(rawMarkdown).then(() => {
        showToast('📋 已将最新包含勾选状态的 Markdown 复制到剪贴板！');
      }).catch(() => {
        alert('复制失败，请手动下载文件。');
      });
    }

    function downloadMarkdown() {
      const blob = new Blob([rawMarkdown], { type: 'text/markdown;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'TASK.md';
      a.click();
      URL.revokeObjectURL(a.href);
      showToast('💾 已下载最新 TASK.md');
    }

    function filterItems(type, btnEl) {
      activeFilter = type;
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btnEl.classList.add('active');
      render();
    }

    function toggleDefectBox(id) {
      const el = document.getElementById(id);
      if (el) el.style.display = el.style.display === 'block' ? 'none' : 'block';
    }

    function copyDefectPrompt(id) {
      const input = document.getElementById('input-' + id);
      const desc = (input && input.value.trim()) || '未提供具体缺陷现象';
      const prompt = \`2 [\${id}] 缺陷反馈: \${desc}\`;
      navigator.clipboard.writeText(prompt).then(() => {
        showToast('📋 已复制自愈指令: "' + prompt + '"，直接发给 AI 即可触发自愈修复！');
      });
    }

    function showToast(msg) {
      const toast = document.getElementById('toast');
      toast.innerText = msg;
      toast.style.display = 'block';
      setTimeout(() => { toast.style.display = 'none'; }, 3000);
    }

    function escapeHtml(str) {
      if (!str) return '';
      return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    init();
  </script>
</body>
</html>`;
}

/**
 * 自动定位 TASK.md 并将其编译输出为 uat.html (0 Token)
 * @param {object} options
 * @returns {{ success: boolean, outputPath: string, uatCount: number }}
 */
export function exportUATHtml(options = {}) {
  const cwd = options.cwd || process.cwd();

  // 1. 若显式指定了 taskPath，优先解析
  let taskPath = null;
  if (options.taskPath) {
    const candidate = path.isAbsolute(options.taskPath) ? options.taskPath : path.join(cwd, options.taskPath);
    if (fs.existsSync(candidate)) {
      taskPath = candidate;
    }
  }

  // 2. 自动多向智能探测已有项目中的常见路径与大小写 (TASK.md, task.md, Task.md)
  if (!taskPath) {
    const candidates = [
      path.join(cwd, '.sansheng', 'TASK.md'),
      path.join(cwd, '.sansheng', 'task.md'),
      path.join(cwd, 'TASK.md'),
      path.join(cwd, 'task.md'),
      path.join(cwd, 'Task.md'),
      path.join(cwd, '.tasks', 'TASK.md'),
    ];
    taskPath = candidates.find(p => fs.existsSync(p)) || null;
  }

  if (!taskPath) {
    return {
      success: false,
      message: '未在当前工作区检测到 TASK.md（已检查 .sansheng/TASK.md, TASK.md, task.md 等）。您可通过参数指定具体文件路径，例如: sansheng html ./path/to/task.md',
      outputPath: null,
      uatCount: 0
    };
  }

  const content = fs.readFileSync(taskPath, 'utf-8');
  const html = compileUATToHtml(content, options);

  // 确定输出目录：若存在 .sansheng 且当前处于该工程，则优先放入 .sansheng/uat.html，否则放入 task 文件的同级目录
  let defaultOutDir = path.dirname(taskPath);
  if (fs.existsSync(path.join(cwd, '.sansheng'))) {
    defaultOutDir = path.join(cwd, '.sansheng');
  }
  const outputPath = options.outputPath
    ? (path.isAbsolute(options.outputPath) ? options.outputPath : path.join(cwd, options.outputPath))
    : path.join(defaultOutDir, 'uat.html');

  fs.writeFileSync(outputPath, html, 'utf-8');
  const items = parseUATBlocks(content);

  return {
    success: true,
    taskPath,
    outputPath,
    uatCount: items.length,
    message: `已成功将 [${path.relative(cwd, taskPath) || path.basename(taskPath)}] 中的 ${items.length} 项 UAT 清单零 Token 编译为交互式看板: ${path.relative(cwd, outputPath) || path.basename(outputPath)}`
  };
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
