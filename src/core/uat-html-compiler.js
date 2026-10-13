import fs from 'fs';
import path from 'path';
import http from 'http';
import { parseUATBlocks } from './uat-runner.js';

/**
 * 智能探测当前工作区中活跃的 TASK.md 或 test-plan.md
 * @param {string} cwd 目标目录
 * @param {string} [explicitPath] 显式指定路径
 * @returns {string|null}
 */
export function findActiveTaskOrPlanPath(cwd = process.cwd(), explicitPath = null) {
  if (explicitPath) {
    const candidate = path.isAbsolute(explicitPath) ? explicitPath : path.join(cwd, explicitPath);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
    // 快捷支持 taskId 传参 (如 TASK-01 或 TASK-01.md)
    const cleanId = String(explicitPath).trim().replace(/^\[|\]$/g, '');
    const shardDirect = path.join(cwd, '.sansheng', 'tasks', cleanId.endsWith('.md') ? cleanId : `${cleanId}.md`);
    if (fs.existsSync(shardDirect)) {
      return shardDirect;
    }
    const tasksDir = path.join(cwd, '.sansheng', 'tasks');
    if (fs.existsSync(tasksDir)) {
      try {
        const files = fs.readdirSync(tasksDir).filter(f => f.endsWith('.md'));
        const matched = files.find(f => f.toLowerCase().startsWith(cleanId.toLowerCase()));
        if (matched) return path.join(tasksDir, matched);
      } catch (_) {}
    }
  }

  const candidates = [
    // 1. .sansheng/ 下的 TASK / task / test-plan
    path.join(cwd, '.sansheng', 'TASK.md'),
    path.join(cwd, '.sansheng', 'task.md'),
    path.join(cwd, '.sansheng', 'Task.md'),
    path.join(cwd, '.sansheng', 'test-plan.md'),
    path.join(cwd, '.sansheng', 'TEST-PLAN.md'),
    path.join(cwd, '.sansheng', 'TEST_PLAN.md'),

    // 2. 根目录下的常见任务与测试计划
    path.join(cwd, 'TASK.md'),
    path.join(cwd, 'task.md'),
    path.join(cwd, 'Task.md'),
    path.join(cwd, 'test-plan.md'),
    path.join(cwd, 'TEST-PLAN.md'),
    path.join(cwd, 'TEST_PLAN.md'),
    path.join(cwd, 'test_plan.md'),
    path.join(cwd, 'testplan.md'),

    // 3. 子目录下的测试或任务文件
    path.join(cwd, '.tasks', 'TASK.md'),
    path.join(cwd, '.tasks', 'task.md'),
    path.join(cwd, 'test', 'test-plan.md'),
    path.join(cwd, 'test', 'TASK.md'),
    path.join(cwd, 'test', 'task.md'),
    path.join(cwd, 'docs', 'test-plan.md'),
    path.join(cwd, 'docs', 'TASK.md'),
    path.join(cwd, 'docs', 'task.md'),
  ];

  return candidates.find(p => fs.existsSync(p)) || null;
}

/**
 * 将 TASK.md 或 test-plan.md 编译为纯本地交互式 UAT HTML 验收看板 (0 Token)
 * @param {string} markdownContent 任务或测试计划内容
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

  const sourceFileName = options.taskFileName || (options.taskPath ? path.basename(options.taskPath) : 'TASK.md');
  const sourceRelPath = options.taskRelPath || (options.taskPath ? path.relative(options.cwd || process.cwd(), options.taskPath) : sourceFileName);
  const isServeMode = !!options.isServeMode;
  const servePort = options.servePort || null;

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
      --danger-bg: rgba(239, 68, 68, 0.12);
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
        --danger-bg: #fef2f2;
        --tag-bg: #f1f5f9;
        --code-bg: #f1f5f9;
      }
    }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif; }
    body { background-color: var(--bg); color: var(--text-main); line-height: 1.6; padding: 24px 16px; }
    .container { max-width: 920px; margin: 0 auto; }
    
    /* Header */
    header { margin-bottom: 20px; padding-bottom: 18px; border-bottom: 1px solid var(--card-border); }
    .header-title-row { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; }
    h1 { font-size: 1.5rem; font-weight: 700; display: flex; align-items: center; gap: 8px; }
    .badge-0token { font-size: 0.75rem; background: var(--success-bg); color: var(--success); padding: 2px 8px; border-radius: 9999px; border: 1px solid var(--success); font-weight: normal; }
    
    /* Permanent Sync Banner */
    .sync-banner {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 12px 16px;
      border-radius: 10px;
      margin-bottom: 16px;
      font-size: 0.88rem;
      transition: all 0.3s ease;
    }
    .sync-banner.banner-warning {
      background: var(--warning-bg);
      border: 1px solid var(--warning);
      color: var(--warning);
    }
    .sync-banner.banner-success {
      background: var(--success-bg);
      border: 1px solid var(--success);
      color: var(--success);
    }
    .sync-banner.banner-danger {
      background: var(--danger-bg);
      border: 1px solid var(--danger);
      color: var(--danger);
    }
    .banner-content { display: flex; align-items: center; gap: 8px; font-weight: 500; }
    .banner-actions { display: flex; gap: 8px; align-items: center; }

    /* Progress Dashboard */
    .progress-box { background: var(--card-bg); border: 1px solid var(--card-border); border-radius: 12px; padding: 16px; margin: 16px 0; }
    .progress-stats { display: flex; justify-content: space-between; align-items: center; font-size: 0.9rem; color: var(--text-sub); margin-bottom: 8px; flex-wrap: wrap; gap: 8px; }
    .progress-bar-bg { background: var(--tag-bg); border-radius: 9999px; height: 10px; overflow: hidden; }
    .progress-bar-fill { background: linear-gradient(90deg, var(--primary), var(--success)); height: 100%; transition: width 0.3s ease; }
    
    /* Action Bar */
    .action-bar { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; justify-content: space-between; margin-bottom: 20px; }
    .btn-group { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
    button { background: var(--card-bg); color: var(--text-main); border: 1px solid var(--card-border); padding: 8px 14px; border-radius: 8px; cursor: pointer; font-size: 0.85rem; font-weight: 500; display: inline-flex; align-items: center; gap: 6px; transition: all 0.2s; }
    button:hover { border-color: var(--primary); color: var(--primary); }
    button.btn-primary { background: var(--primary); color: #ffffff; border-color: var(--primary); }
    button.btn-primary:hover { background: var(--primary-hover); }
    button.btn-warning { background: var(--warning); color: #ffffff; border-color: var(--warning); font-weight: 600; }
    button.btn-warning:hover { opacity: 0.9; }
    button.btn-success { background: var(--success); color: #ffffff; border-color: var(--success); }
    button.btn-success:hover { opacity: 0.9; }
    button.btn-active { background: var(--primary); color: #ffffff; border-color: var(--primary); }
    button.btn-sm { padding: 4px 10px; font-size: 0.8rem; }
    
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
          <span id="sync-status">⏳ 正在探测本地持久化连接...</span>
        </div>
        <div class="progress-bar-bg">
          <div id="progress-fill" class="progress-bar-fill" style="width: ${initialPercent}%;"></div>
        </div>
      </div>
    </header>

    <!-- 防脱节持久化告警横幅 -->
    <div id="sync-banner" class="sync-banner banner-warning">
      <div class="banner-content">
        <span id="banner-icon">⚠️</span>
        <span id="banner-text">正在检查本地 ${escapeHtml(sourceFileName)} 关联状态...</span>
      </div>
      <div class="banner-actions">
        <button id="btn-banner-action" class="btn-warning btn-sm" onclick="handleBannerAction()">📁 关联本地文件</button>
      </div>
    </div>

    <div class="action-bar">
      <div class="btn-group">
        <button id="btn-link-file" class="btn-primary" onclick="handleMainLinkButtonClick()">📁 关联本地 ${escapeHtml(sourceFileName)} (自动静默保存)</button>
        <button id="btn-change-file" style="display: none;" onclick="linkLocalFile(true)">🔄 切换关联</button>
        <button id="btn-reload-md" onclick="reloadFromLocalMarkdown()" title="在外部修改了 Markdown 时，点击立即重新读取最新内容更新看板">📥 从本地 MD 重载更新</button>
        <button id="btn-sync-to-md" onclick="forceSyncToLocalMarkdown()" title="将当前页面勾选状态强制写回本地 Markdown 文件">💾 立即同步到 MD</button>
        <button onclick="copyLatestMarkdown()">📋 复制 Markdown</button>
        <button id="btn-download" onclick="downloadMarkdown()">💾 导出文件</button>
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
    const SOURCE_FILE_NAME = ${JSON.stringify(sourceFileName)};
    const SOURCE_REL_PATH = ${JSON.stringify(sourceRelPath)};
    const IS_SERVE_MODE = ${JSON.stringify(isServeMode)};
    const SERVE_PORT = ${JSON.stringify(servePort)};

    let items = ${rawJson};
    let rawMarkdown = ${rawMdJson};
    let fileHandle = null;
    let pendingHandle = null;
    let pendingOfflineChanges = {};
    let lastDiskMtime = null;
    let activeFilter = 'all';

    // ==========================================
    // 1. IndexedDB 存储适配器 (记忆 FileHandle)
    // ==========================================
    const UATStorage = {
      dbName: 'sansheng_uat_store_v2',
      storeName: 'handles',
      handleKey: 'active_file_handle',
      metaKey: 'active_file_meta',

      async openDB() {
        return new Promise((resolve, reject) => {
          if (!window.indexedDB) return reject(new Error('IndexedDB 不受支持'));
          const req = indexedDB.open(this.dbName, 1);
          req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(this.storeName)) {
              db.createObjectStore(this.storeName);
            }
          };
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });
      },

      async saveHandle(handle) {
        try {
          const db = await this.openDB();
          return new Promise((resolve, reject) => {
            const tx = db.transaction(this.storeName, 'readwrite');
            const store = tx.objectStore(this.storeName);
            store.put(handle, this.handleKey);
            store.put({
              name: handle.name,
              linkedAt: Date.now(),
              sourceRelPath: SOURCE_REL_PATH,
            }, this.metaKey);
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => reject(tx.error);
          });
        } catch (e) {
          console.warn('存储句柄至 IndexedDB 失败:', e);
          return false;
        }
      },

      async getStoredHandle() {
        try {
          const db = await this.openDB();
          return new Promise((resolve) => {
            const tx = db.transaction(this.storeName, 'readonly');
            const store = tx.objectStore(this.storeName);
            const req = store.get(this.handleKey);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => resolve(null);
          });
        } catch (e) {
          return null;
        }
      },

      async clearHandle() {
        try {
          const db = await this.openDB();
          const tx = db.transaction(this.storeName, 'readwrite');
          tx.objectStore(this.storeName).delete(this.handleKey);
          tx.objectStore(this.storeName).delete(this.metaKey);
        } catch (e) {}
      }
    };

    // ==========================================
    // 2. 页面初始化与自动恢复
    // ==========================================
    async function init() {
      // 1. 尝试从 localStorage 恢复用户历史勾选状态作为初始渲染
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

      // 2. 如果处于 CLI --serve 微服务模式，通过 HTTP API 自动连接
      if (IS_SERVE_MODE) {
        initServeMode();
        return;
      }

      // 3. 浏览器原生文件句柄自动恢复尝试
      await tryRestoreStoredHandle();
    }

    async function initServeMode() {
      try {
        const res = await fetch('/api/status');
        if (res.ok) {
          const data = await res.json();
          lastDiskMtime = data.mtime;
          updateSyncUI('server-connected', data.fileName || SOURCE_FILE_NAME);
          startServePolling();
          return;
        }
      } catch (e) {}
      updateSyncUI('server-error');
    }

    function startServePolling() {
      setInterval(async () => {
        try {
          const res = await fetch('/api/status');
          if (res.ok) {
            const data = await res.json();
            if (lastDiskMtime && data.mtime > lastDiskMtime) {
              lastDiskMtime = data.mtime;
              if (data.markdown && data.markdown !== rawMarkdown) {
                rawMarkdown = data.markdown;
                items = parseUATBlocksClient(rawMarkdown);
                render();
                showToast('⚡ 本地文件已在外部被更新，看板已自动重载对齐');
              }
            }
          }
        } catch (e) {}
      }, 2500);
    }

    async function tryRestoreStoredHandle() {
      if (!window.showOpenFilePicker && !window.indexedDB) {
        updateSyncUI('unsupported');
        return;
      }

      try {
        const stored = await UATStorage.getStoredHandle();
        if (!stored) {
          updateSyncUI('disconnected');
          return;
        }

        // 探测浏览器授权状态
        const permission = await stored.queryPermission({ mode: 'readwrite' });
        if (permission === 'granted') {
          // 自动无感重连成功！
          fileHandle = stored;
          await syncAndReconcileWithDisk(fileHandle, false);
          updateSyncUI('connected', fileHandle.name);
          showToast('🟢 已自动恢复关联: ' + fileHandle.name + ' 并对齐最新状态');
        } else {
          // 浏览器需要手势重新授权 (prompt)
          pendingHandle = stored;
          updateSyncUI('prompt', stored.name);
        }
      } catch (e) {
        console.warn('尝试恢复历史文件句柄失败:', e);
        updateSyncUI('disconnected');
      }
    }

    // ==========================================
    // 3. 核心界面状态切换 (横幅、按钮、状态指示)
    // ==========================================
    function updateSyncUI(state, fileName = '') {
      const banner = document.getElementById('sync-banner');
      const bannerIcon = document.getElementById('banner-icon');
      const bannerText = document.getElementById('banner-text');
      const bannerBtn = document.getElementById('btn-banner-action');
      const mainBtn = document.getElementById('btn-link-file');
      const changeBtn = document.getElementById('btn-change-file');
      const syncStatus = document.getElementById('sync-status');
      const targetName = fileName || SOURCE_FILE_NAME;

      if (state === 'connected' || state === 'server-connected') {
        banner.className = 'sync-banner banner-success';
        bannerIcon.innerText = '🟢';
        bannerText.innerText = '已实时连接本地磁盘文件: ' + targetName + ' (所有勾选将自动静默双向写回)';
        bannerBtn.style.display = 'none';

        mainBtn.innerHTML = '🟢 已关联: ' + escapeHtml(targetName);
        mainBtn.className = '';
        changeBtn.style.display = 'inline-flex';
        syncStatus.innerText = '🟢 本地文件自动同步中';
      } else if (state === 'prompt') {
        banner.className = 'sync-banner banner-warning';
        bannerIcon.innerText = '⚡';
        bannerText.innerText = '检测到上次关联的本地文件: ' + targetName + '。浏览器需您确认一键授权以激活自动保存。';
        bannerBtn.style.display = 'inline-flex';
        bannerBtn.className = 'btn-warning btn-sm';
        bannerBtn.innerText = '⚡ 一键授权恢复';

        mainBtn.innerHTML = '⚡ 点击恢复关联: ' + escapeHtml(targetName);
        mainBtn.className = 'btn-warning';
        changeBtn.style.display = 'inline-flex';
        syncStatus.innerText = '⚡ 等待一键恢复授权';
      } else if (state === 'unsupported') {
        banner.className = 'sync-banner banner-danger';
        bannerIcon.innerText = '⚠️';
        bannerText.innerText = '当前浏览器不支持 File System Access API，建议使用 Chrome/Edge 浏览器以体验静默保存。';
        bannerBtn.style.display = 'none';
        mainBtn.style.display = 'none';
        syncStatus.innerText = '⚠️ 浏览器不支持文件直连';
      } else {
        // disconnected
        banner.className = 'sync-banner banner-warning';
        bannerIcon.innerText = '⚠️';
        bannerText.innerText = '【重要警示】当前尚未关联本地文件（如 ' + targetName + '）！在此页面的勾选不会自动写回磁盘！';
        bannerBtn.style.display = 'inline-flex';
        bannerBtn.className = 'btn-warning btn-sm';
        bannerBtn.innerText = '📁 立即关联文件';

        mainBtn.innerHTML = '📁 关联本地 ' + escapeHtml(targetName) + ' (自动静默保存)';
        mainBtn.className = 'btn-primary';
        changeBtn.style.display = 'none';
        syncStatus.innerText = '🔴 未关联本地文件 (修改未保存至磁盘)';
      }
    }

    // ==========================================
    // 4. 关联、恢复与切换文件操作
    // ==========================================
    async function handleBannerAction() {
      if (pendingHandle) {
        await reconnectPendingHandle();
      } else {
        await linkLocalFile(false);
      }
    }

    async function handleMainLinkButtonClick() {
      if (pendingHandle) {
        await reconnectPendingHandle();
      } else if (!fileHandle) {
        await linkLocalFile(false);
      } else {
        showToast('🟢 当前已成功关联 ' + fileHandle.name);
      }
    }

    async function reconnectPendingHandle() {
      if (!pendingHandle) return false;
      try {
        const perm = await pendingHandle.requestPermission({ mode: 'readwrite' });
        if (perm === 'granted') {
          fileHandle = pendingHandle;
          pendingHandle = null;
          await syncAndReconcileWithDisk(fileHandle, true);
          updateSyncUI('connected', fileHandle.name);
          showToast('🎉 成功恢复关联 ' + fileHandle.name + '！自动静默保存已就绪。');
          return true;
        } else {
          showToast('⚠️ 授权未通过，继续保持未关联状态');
          return false;
        }
      } catch (err) {
        console.warn('请求文件权限异常:', err);
        showToast('⚠️ 请求权限失败: ' + err.message);
        return false;
      }
    }

    async function linkLocalFile(forceNew = false) {
      if (!window.showOpenFilePicker) {
        alert('当前浏览器环境不支持 File System Access API，请使用 Chrome 或 Edge 浏览器体验自动静默保存。');
        return false;
      }
      try {
        const [handle] = await window.showOpenFilePicker({
          types: [{
            description: 'Markdown 任务与测试计划文件',
            accept: { 'text/markdown': ['.md'] }
          }]
        });

        fileHandle = handle;
        pendingHandle = null;
        await UATStorage.saveHandle(handle);
        await syncAndReconcileWithDisk(fileHandle, true);
        updateSyncUI('connected', handle.name);
        showToast('🎉 成功关联本地文件: ' + handle.name + '！后续勾选将实时静默写入。');
        return true;
      } catch (e) {
        // 用户取消选择
        return false;
      }
    }

    // ==========================================
    // 5. 双向对齐算法 (Reconciliation)
    // ==========================================
    async function syncAndReconcileWithDisk(handle, userTriggered = false) {
      try {
        const file = await handle.getFile();
        lastDiskMtime = file.lastModified;
        const diskText = await file.text();

        let mergedText = diskText || '';
        const pendingIds = Object.keys(pendingOfflineChanges);

        // 如果在断开或未授权期间有离线打勾变动，增量叠加合并回本地文件
        if (pendingIds.length > 0 && mergedText) {
          pendingIds.forEach(id => {
            const passed = pendingOfflineChanges[id];
            const idRegex = new RegExp('(-\\\\s*\\\\[)[ xX](\\\\]\\\\s*.*?\\\\[?' + escapeRegex(id) + '\\\\]?)', 'i');
            const replacement = passed ? '$1x$2' : '$1 $2';
            mergedText = mergedText.replace(idRegex, replacement);
          });

          // 写回磁盘
          const writable = await handle.createWritable();
          await writable.write(mergedText);
          await writable.close();
          pendingOfflineChanges = {};
          showToast('🔄 已将离线勾选变更成功合并写回本地文件: ' + handle.name);
        }

        if (mergedText) {
          rawMarkdown = mergedText;
          items = parseUATBlocksClient(rawMarkdown);
        }

        render();
      } catch (e) {
        console.error('双向对齐本地文件失败:', e);
        showToast('⚠️ 读取本地文件失败: ' + e.message);
      }
    }

    // 窗口切回时热检测本地文件变动
    window.addEventListener('focus', async () => {
      if (fileHandle) {
        try {
          const file = await fileHandle.getFile();
          if (lastDiskMtime && file.lastModified > lastDiskMtime) {
            lastDiskMtime = file.lastModified;
            const diskText = await file.text();
            if (diskText && diskText !== rawMarkdown) {
              const reloadBtn = document.getElementById('btn-reload-md');
              if (reloadBtn) {
                reloadBtn.classList.add('btn-warning');
                reloadBtn.innerText = '⚡ 发现 MD 外部修改 (点击重载)';
              }
              rawMarkdown = diskText;
              items = parseUATBlocksClient(rawMarkdown);
              render();
              showToast('⚡ 检测到本地文件在外部被更新，看板已自动同步刷新');
            }
          }
        } catch (e) {}
      }
    });

    // ==========================================
    // 6. 从本地 MD 重载更新 HTML 看板 (Pull from MD)
    // ==========================================
    async function reloadFromLocalMarkdown() {
      const reloadBtn = document.getElementById('btn-reload-md');
      if (reloadBtn) {
        reloadBtn.classList.remove('btn-warning');
        reloadBtn.innerText = '📥 从本地 MD 重载更新';
      }

      // 1. 如果处于 CLI --serve 服务模式
      if (IS_SERVE_MODE) {
        try {
          const res = await fetch('/api/status');
          if (res.ok) {
            const data = await res.json();
            if (data.markdown) {
              rawMarkdown = data.markdown;
              items = parseUATBlocksClient(rawMarkdown);
              lastDiskMtime = data.mtime;
              render();
              showToast('🎉 已成功从本地服务重新加载最新 ' + (data.fileName || SOURCE_FILE_NAME) + '！');
              return;
            }
          }
        } catch (e) {
          showToast('⚠️ 从本地服务获取最新内容失败: ' + e.message);
          return;
        }
      }

      // 2. 存在 pendingHandle（已记忆但未授权）
      if (!fileHandle && pendingHandle) {
        const restored = await reconnectPendingHandle();
        if (restored && fileHandle) {
          await loadTextFromFileHandle(fileHandle);
        }
        return;
      }

      // 3. 正常已关联模式
      if (fileHandle) {
        await loadTextFromFileHandle(fileHandle);
        return;
      }

      // 4. 未关联文件 -> 提示引导选择本地文件并载入
      const willLink = confirm(
        '当前尚未关联本地文件（如 ' + SOURCE_FILE_NAME + '）！\\n\\n' +
        '是否立即选择本地文件以载入最新内容更新本看板？'
      );
      if (willLink) {
        const linked = await linkLocalFile(false);
        if (linked && fileHandle) {
          await loadTextFromFileHandle(fileHandle);
        }
      }
    }

    async function loadTextFromFileHandle(handle) {
      try {
        const file = await handle.getFile();
        lastDiskMtime = file.lastModified;
        const text = await file.text();
        if (!text || !text.trim()) {
          showToast('⚠️ 本地文件内容为空');
          return;
        }
        rawMarkdown = text;
        items = parseUATBlocksClient(rawMarkdown);
        render();
        updateSyncUI('connected', handle.name);
        showToast('🎉 成功从本地 ' + handle.name + ' 重载最新内容并更新看板！');
      } catch (err) {
        console.error('重载本地文件失败:', err);
        showToast('⚠️ 读取本地文件失败: ' + err.message);
      }
    }

    // ==========================================
    // 7. 立即强制将当前看板状态同步写回 MD (Push to MD)
    // ==========================================
    async function forceSyncToLocalMarkdown() {
      // 1. 服务模式
      if (IS_SERVE_MODE) {
        try {
          const res = await fetch('/api/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ markdown: rawMarkdown })
          });
          if (res.ok) {
            showToast('✅ 成功将当前全部验收状态同步保存至本地文件！');
          } else {
            showToast('⚠️ 本地服务保存失败: ' + res.statusText);
          }
        } catch (e) {
          showToast('⚠️ 连接本地服务失败: ' + e.message);
        }
        return;
      }

      // 2. 待授权模式
      if (!fileHandle && pendingHandle) {
        const restored = await reconnectPendingHandle();
        if (!restored) return;
      }

      // 3. 已关联文件
      if (fileHandle) {
        try {
          const writable = await fileHandle.createWritable();
          await writable.write(rawMarkdown);
          await writable.close();
          showToast('✅ 成功将当前看板全部状态 100% 写入保存至本地 ' + fileHandle.name + '！');
        } catch (err) {
          showToast('⚠️ 写入本地文件失败: ' + err.message);
        }
        return;
      }

      // 4. 未关联本地文件 -> 引导用户选择并保存
      const willLink = confirm(
        '当前尚未关联本地文件（如 ' + SOURCE_FILE_NAME + '）！\\n\\n' +
        '是否立即选择本地文件以将当前看板状态写入保存？'
      );
      if (willLink) {
        const linked = await linkLocalFile(false);
        if (linked && fileHandle) {
          try {
            const writable = await fileHandle.createWritable();
            await writable.write(rawMarkdown);
            await writable.close();
            showToast('✅ 成功将看板状态写入保存至本地 ' + fileHandle.name + '！');
          } catch (e) {
            showToast('⚠️ 写入失败: ' + e.message);
          }
        }
      }
    }

    // ==========================================
    // 8. 核心勾选逻辑与防脱节拦截
    // ==========================================
    async function toggleUAT(id, isChecked) {
      const target = items.find(i => i.id === id);
      if (!target) return;

      // 场景 A: 存在上次记忆的句柄但需要用户手势授权 (prompt)
      // 用户点击 Checkbox 本身就是合法的 User Gesture，立即借力唤起授权！
      if (!fileHandle && pendingHandle) {
        const restored = await reconnectPendingHandle();
        if (!restored) {
          // 授权失败或用户取消，记录为离线变更
          pendingOfflineChanges[id] = isChecked;
          target.passed = isChecked;
          render();
          return;
        }
      }

      // 场景 B: 完全未关联本地文件且非服务模式 -> 强拦截告警弹窗防脱节
      if (!fileHandle && !IS_SERVE_MODE) {
        pendingOfflineChanges[id] = isChecked;
        target.passed = isChecked;
        render();

        const willLink = confirm(
          '⚠️ 【防脱节重要提示】\\n\\n' +
          '当前网页尚未关联本地文件（如 ' + SOURCE_FILE_NAME + '）！\\n' +
          '您刚才的勾选仅保存在浏览器临时缓存中，【不会自动写回磁盘文件】！\\n' +
          '如果直接关闭页面或在代码中运行测试，状态将出现不同步。\\n\\n' +
          '是否立即选择本地 ' + SOURCE_FILE_NAME + ' 建立自动保存关联？'
        );

        if (willLink) {
          await linkLocalFile(false);
        } else {
          showToast('⚠️ 状态仅暂存浏览器，请务必关联本地文件以防状态丢失');
        }
        return;
      }

      // 场景 C: 正常已连接状态
      target.passed = isChecked;

      // 更新内存中的 rawMarkdown
      if (target.rawHeaderLine) {
        const replacement = isChecked
          ? target.rawHeaderLine.replace(/-\\s*\\[\\s*\\]/, '- [x]')
          : target.rawHeaderLine.replace(/-\\s*\\[[xX]\\]/, '- [ ]');
        rawMarkdown = rawMarkdown.replace(target.rawHeaderLine, replacement);
        target.rawHeaderLine = replacement;
      }

      // 持久化回写
      if (IS_SERVE_MODE) {
        try {
          const res = await fetch('/api/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ markdown: rawMarkdown, uatId: id, passed: isChecked })
          });
          if (res.ok) {
            showToast(\`✅ 已更新 [\${id}] 并已自动同步至本地 \${SOURCE_FILE_NAME}！\`);
          } else {
            showToast(\`⚠️ 本地服务写入失败: \${res.statusText}\`);
          }
        } catch (e) {
          showToast(\`⚠️ 本地服务连接失败: \${e.message}\`);
        }
      } else if (fileHandle) {
        try {
          const writable = await fileHandle.createWritable();
          await writable.write(rawMarkdown);
          await writable.close();
          showToast(\`✅ 已更新 [\${id}] 并已自动保存至本地 \${escapeHtml(fileHandle.name)}！\`);
        } catch (err) {
          showToast(\`⚠️ 保存至本地文件失败: \${err.message}\`);
        }
      }

      render();
    }

    // ==========================================
    // 7. 渲染函数与辅助操作
    // ==========================================
    function render() {
      const listEl = document.getElementById('uat-list');
      listEl.innerHTML = '';

      let passedCount = 0;
      items.forEach((item) => {
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

    function parseUATBlocksClient(content) {
      const lines = (content || '').replace(/\\r\\n/g, '\\n').replace(/\\r/g, '\\n').split('\\n');
      const parsedItems = [];
      let current = null;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const match = line.match(/^(\\s*-\\s*\\[([ xX])\\])\\s*\`?\\[?(UAT-\\d+)\\]?\`?(.*)$/i);

        if (match) {
          if (current) parsedItems.push(finalizeClientItem(current));
          current = {
            rawHeaderLine: line,
            passed: match[2].toLowerCase() === 'x',
            id: match[3].toUpperCase(),
            headerRest: match[4].trim(),
            detailLines: [],
          };
        } else if (current) {
          if (/^\\s*-\\s*\\[\\s*[ xX]?\\s*\\]/.test(line) || line.trim().startsWith('### ') || line.trim().startsWith('## ')) {
            parsedItems.push(finalizeClientItem(current));
            current = null;
          } else {
            current.detailLines.push(line);
          }
        }
      }
      if (current) parsedItems.push(finalizeClientItem(current));
      return parsedItems;
    }

    function finalizeClientItem(current) {
      let title = current.headerRest;
      let trace = '';
      const traceMatch = title.match(/\\((?:溯源|关联|对应)[:：]?\\s*([^)]+)\\)/i);
      if (traceMatch) {
        trace = traceMatch[1].trim();
        title = title.replace(traceMatch[0], '').trim();
      }
      title = title.replace(/^[【\\[](.*?)[】\\]]$/, '$1').trim();
      if (!title) title = '用例 ' + current.id;

      let preconditions = '';
      let steps = '';
      let expected = '';
      current.detailLines.forEach(l => {
        const trimmed = l.trim().replace(/^[-*]\\s*/, '');
        if (/前置(?:条件)?(?:与数据)?/i.test(trimmed)) {
          preconditions = trimmed.replace(/^.*?(?:前置(?:条件)?(?:与数据)?)[:：* ]*/i, '').trim();
        } else if (/操作步骤|步骤/i.test(trimmed)) {
          steps = trimmed.replace(/^.*?(?:操作步骤|步骤)[:：* ]*/i, '').trim();
        } else if (/PRD预期(?:对照)?|预期(?:对照|结果)?/i.test(trimmed)) {
          expected = trimmed.replace(/^.*?(?:PRD预期(?:对照)?|预期(?:对照|结果)?)[:：* ]*/i, '').trim();
        }
      });

      return {
        id: current.id,
        passed: current.passed,
        title,
        trace,
        preconditions,
        steps,
        expected,
        rawHeaderLine: current.rawHeaderLine
      };
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
      a.download = fileHandle ? fileHandle.name : SOURCE_FILE_NAME;
      a.click();
      URL.revokeObjectURL(a.href);
      showToast('💾 已下载最新文件: ' + a.download);
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
      setTimeout(() => { toast.style.display = 'none'; }, 3200);
    }

    function escapeHtml(str) {
      if (!str) return '';
      return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function escapeRegex(str) {
      return str.replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$&');
    }

    init();
  </script>
</body>
</html>`;
}

/**
 * 自动定位 TASK.md / test-plan.md 并将其编译输出为 uat.html (0 Token)
 * @param {object} options
 * @returns {{ success: boolean, outputPath: string, uatCount: number, taskPath: string|null, message: string }}
 */
export function exportUATHtml(options = {}) {
  const cwd = options.cwd || process.cwd();
  const taskPath = findActiveTaskOrPlanPath(cwd, options.taskPath);

  if (!taskPath) {
    return {
      success: false,
      message: '未在当前工作区检测到 TASK.md 或 test-plan.md（已检查 .sansheng/TASK.md, TASK.md, task.md, test-plan.md 等）。您可通过参数指定具体文件路径，例如: sansheng html ./path/to/test-plan.md',
      outputPath: null,
      taskPath: null,
      uatCount: 0
    };
  }

  const content = fs.readFileSync(taskPath, 'utf-8');
  const taskFileName = path.basename(taskPath);
  const taskRelPath = path.relative(cwd, taskPath) || taskFileName;

  const html = compileUATToHtml(content, {
    ...options,
    taskPath,
    taskFileName,
    taskRelPath,
  });

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
    message: `已成功将 [${taskRelPath}] 中的 ${items.length} 项 UAT 清单零 Token 编译为交互式看板: ${path.relative(cwd, outputPath) || path.basename(outputPath)}`
  };
}

/**
 * 启动零依赖微型 HTTP 热同步服务
 * @param {object} options
 * @returns {Promise<{ server: http.Server, port: number, url: string, close: Function }>}
 */
export function serveUATHtml(options = {}) {
  const cwd = options.cwd || process.cwd();
  const taskPath = findActiveTaskOrPlanPath(cwd, options.taskPath);

  if (!taskPath) {
    throw new Error('未检测到 TASK.md 或 test-plan.md，无法启动本地热同步微服务。');
  }

  const port = options.port || 3901;
  const fileName = path.basename(taskPath);
  const relPath = path.relative(cwd, taskPath) || fileName;

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

    // 路由 1: GET /api/status (状态与文件更新探测)
    if (req.method === 'GET' && url.pathname === '/api/status') {
      try {
        const stat = fs.statSync(taskPath);
        const md = fs.readFileSync(taskPath, 'utf-8');
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({
          success: true,
          fileName,
          relPath,
          mtime: stat.mtimeMs,
          markdown: md,
        }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: e.message }));
      }
      return;
    }

    // 路由 2: POST /api/save (静默持久化回写本地 Markdown 文件)
    if (req.method === 'POST' && url.pathname === '/api/save') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          if (typeof parsed.markdown === 'string') {
            fs.writeFileSync(taskPath, parsed.markdown, 'utf-8');
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
            return;
          }
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, message: '缺少 markdown 字段' }));
        } catch (e) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: e.message }));
        }
      });
      return;
    }

    // 路由 3: 默认页面 GET /
    try {
      const content = fs.readFileSync(taskPath, 'utf-8');
      const html = compileUATToHtml(content, {
        cwd,
        taskPath,
        taskFileName: fileName,
        taskRelPath: relPath,
        isServeMode: true,
        servePort: port,
      });
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('读取与渲染看板失败: ' + e.message);
    }
  });

  return new Promise((resolve, reject) => {
    server.listen(port, () => {
      const serveUrl = `http://localhost:${port}`;
      resolve({
        server,
        port,
        url: serveUrl,
        taskPath,
        fileName,
        close: () => new Promise(cb => server.close(cb)),
      });
    });
    server.on('error', reject);
  });
}

/**
 * 监听目标 Markdown 文件，变动时自动重新编译覆盖 uat.html
 * @param {object} options
 * @param {Function} [onRebuild] 重新编译完成回调
 * @returns {{ taskPath: string, outputPath: string, close: Function }}
 */
export function watchUATHtml(options = {}, onRebuild = null) {
  const cwd = options.cwd || process.cwd();
  const taskPath = findActiveTaskOrPlanPath(cwd, options.taskPath);

  if (!taskPath) {
    throw new Error('未在当前工作区检测到 TASK.md 或 test-plan.md，无法启动文件监听。');
  }

  const initialRes = exportUATHtml(options);

  let debounceTimer = null;
  const watcher = fs.watch(taskPath, (eventType) => {
    if (eventType === 'change' || eventType === 'rename') {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        try {
          if (!fs.existsSync(taskPath)) return;
          const res = exportUATHtml(options);
          if (onRebuild) onRebuild(res);
        } catch (e) {
          console.warn('自动编译 uat.html 出错:', e.message);
        }
      }, 150);
    }
  });

  return {
    taskPath,
    outputPath: initialRes.outputPath,
    close: () => watcher.close(),
  };
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

