import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { YongleBridge } from '../tools/yongle-bridge.js';

const DEFAULT_CONTEXT_REL_DIR = path.join('.sansheng', 'context');
const CODEBASE_INDEX_REL = path.join('.sansheng', 'codebase_index.json');
const DEFAULT_INJECT_BUDGET_TOKENS = 300;
const DEFAULT_WHY_LIMIT_CHARS = 2400;

const DEFAULT_IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'bin',
  'obj',
  '.sansheng',
  '.planning',
  '.tasks',
  '.system_generated',
  '.vscode',
  '.idea',
  'coverage',
  'vendor',
  'target',
  '__pycache__',
]);

const SCANNABLE_EXTS = new Set([
  '.cs', '.vue', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.go', '.java', '.kt', '.rs', '.sql', '.rb', '.php',
  '.sh', '.ps1', '.css', '.scss', '.html', '.xml',
]);

// 行级注释内的 @biz / @why 锚点匹配（严格要求紧跟注释标记，防止匹配字符串/正则字面量）
const BIZ_ID_REGEX = /^BIZ-\d{8}-\d+$/i;
const LEADING_COMMENT_BIZ_RE = /^\s*(?:\/\/|#|\/\*+|\*|<!--|--)\s*@biz\s+(BIZ-\d{8}-\d+)(?:\s*\[?(RULE-\d+|REQ-\d+)\]?)?\s*[:：-]?\s*(.+?)\s*(?:\*\/|-->)?\s*$/i;
const TRAILING_COMMENT_BIZ_RE = /\s+(?:\/\/|#|<!--|--)\s*@biz\s+(BIZ-\d{8}-\d+)(?:\s*\[?(RULE-\d+|REQ-\d+)\]?)?\s*[:：-]?\s*(.+?)\s*(?:-->)?\s*$/i;
const LEADING_COMMENT_WHY_RE = /^\s*(?:\/\/|#|\/\*+|\*|<!--|--)\s*@why(?:\s*\[?(RULE-\d+|REQ-\d+)\]?)?\s*[:：-]\s*(.+?)\s*(?:\*\/|-->)?\s*$/i;
const TRAILING_COMMENT_WHY_RE = /\s+(?:\/\/|#|<!--|--)\s*@why(?:\s*\[?(RULE-\d+|REQ-\d+)\]?)?\s*[:：-]\s*(.+?)\s*(?:-->)?\s*$/i;

function normalizeRelPath(p = '') {
  return String(p || '').replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '').trim();
}

function uniqueStrings(arr = [], { upper = false, normalizePath = false } = {}) {
  const seen = new Set();
  const out = [];
  for (const item of Array.isArray(arr) ? arr : []) {
    if (item === null || item === undefined) continue;
    let val = String(item).trim();
    if (!val) continue;
    if (normalizePath) val = normalizeRelPath(val);
    if (upper) val = val.toUpperCase();
    if (!val || seen.has(val)) continue;
    seen.add(val);
    out.push(val);
  }
  return out;
}

function toStringArray(input) {
  if (!input) return [];
  if (Array.isArray(input)) {
    return input.map(v => String(v || '').trim()).filter(Boolean);
  }
  if (typeof input === 'string') {
    return input
      .split(/[\n,]/)
      .map(v => v.trim())
      .filter(Boolean);
  }
  return [];
}

function toBulletArray(input) {
  if (!input) return [];
  if (Array.isArray(input)) {
    return input.map(v => String(v || '').trim()).filter(Boolean);
  }
  if (typeof input === 'string') {
    return input
      .replace(/\r\n/g, '\n')
      .split('\n')
      .map(l => l.replace(/^\s*[-*]\s*/, '').trim())
      .filter(Boolean);
  }
  return [];
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function formatDateYMD(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return {
    compact: `${yyyy}${mm}${dd}`,
    dashed: `${yyyy}-${mm}-${dd}`,
  };
}

function slugifyTitle(title = '') {
  return String(title || '')
    .trim()
    .replace(/[^\w\u4e00-\u9fa5-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 36);
}

/**
 * 读取并合并业务上下文配置（兼容 .sansheng/config.json 中的 business_context / businessContext）
 */
export function resolveBizConfig(cwd = process.cwd(), override = {}) {
  const defaults = {
    enabled: true,
    contextDir: DEFAULT_CONTEXT_REL_DIR.replace(/\\/g, '/'),
    commitToGit: true,
    syncToYongle: false,
    autoInjectOnFocus: true,
    injectBudgetTokens: DEFAULT_INJECT_BUDGET_TOKENS,
    whyBudgetChars: DEFAULT_WHY_LIMIT_CHARS,
  };

  let fileCfg = {};
  const configPath = path.join(cwd, '.sansheng', 'config.json');
  if (fs.existsSync(configPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      const raw = parsed?.businessContext || parsed?.business_context || {};
      fileCfg = {
        ...(raw.enabled !== undefined ? { enabled: Boolean(raw.enabled) } : {}),
        ...(raw.contextDir || raw.context_dir ? { contextDir: normalizeRelPath(raw.contextDir || raw.context_dir) } : {}),
        ...(raw.commitToGit !== undefined || raw.commit_to_git !== undefined
          ? { commitToGit: Boolean(raw.commitToGit ?? raw.commit_to_git) }
          : {}),
        ...(raw.syncToYongle !== undefined || raw.sync_to_yongle !== undefined
          ? { syncToYongle: Boolean(raw.syncToYongle ?? raw.sync_to_yongle) }
          : {}),
        ...(raw.autoInjectOnFocus !== undefined || raw.auto_inject_on_focus !== undefined
          ? { autoInjectOnFocus: Boolean(raw.autoInjectOnFocus ?? raw.auto_inject_on_focus) }
          : {}),
        ...(Number.isFinite(Number(raw.injectBudgetTokens ?? raw.inject_budget_tokens))
          ? { injectBudgetTokens: Math.max(80, Number(raw.injectBudgetTokens ?? raw.inject_budget_tokens)) }
          : {}),
        ...(Number.isFinite(Number(raw.whyBudgetChars ?? raw.why_budget_chars))
          ? { whyBudgetChars: Math.max(400, Number(raw.whyBudgetChars ?? raw.why_budget_chars)) }
          : {}),
      };
    } catch (_) {}
  }

  return {
    ...defaults,
    ...fileCfg,
    ...(override || {}),
  };
}

export function getBizContextDir(cwd = process.cwd(), options = {}) {
  const cfg = resolveBizConfig(cwd, options);
  return path.isAbsolute(cfg.contextDir)
    ? cfg.contextDir
    : path.join(cwd, cfg.contextDir);
}

export function getBizIndexPath(cwd = process.cwd(), options = {}) {
  return path.join(getBizContextDir(cwd, options), 'index.json');
}

// ==========================================
// 1. Frontmatter + 正文无依赖解析与序列化
// ==========================================

function formatYamlScalar(val = '') {
  const str = String(val ?? '');
  if (!str) return '""';
  if (/[:#\[\]{},&*!?|>'"%@`\n]/.test(str) || /^\s|\s$/.test(str)) {
    return JSON.stringify(str);
  }
  return str;
}

function unquoteYamlScalar(raw = '') {
  const s = String(raw || '').trim();
  if (!s) return '';
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    try {
      return s.startsWith('"') ? JSON.parse(s) : s.slice(1, -1);
    } catch (_) {
      return s.slice(1, -1);
    }
  }
  return s;
}

function parseInlineYamlList(raw = '') {
  const inner = raw.slice(1, -1).trim();
  if (!inner) return [];
  return inner.split(',').map(item => unquoteYamlScalar(item)).filter(Boolean);
}

/**
 * 解析 BIZ Markdown 档案（Frontmatter + 正文三节）
 */
export function parseBizDocument(content = '', filePath = '') {
  const text = String(content || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const meta = {
    id: '',
    title: '',
    status: 'active',
    createdAt: '',
    updatedAt: '',
    externalRef: '',
    reqs: [],
    rules: [],
    supersedes: [],
    supersededBy: [],
    relatedBiz: [],
    files: [],
    symbols: [],
    commits: [],
    yongleSynced: false,
  };

  let body = text;
  const fmMatch = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (fmMatch) {
    const fmLines = fmMatch[1].split('\n');
    body = fmMatch[2] || '';
    let currentListKey = null;

    for (const rawLine of fmLines) {
      const listItemMatch = rawLine.match(/^\s+-\s+(.*)$/);
      if (listItemMatch && currentListKey && Array.isArray(meta[currentListKey])) {
        const val = unquoteYamlScalar(listItemMatch[1]);
        if (val) meta[currentListKey].push(val);
        continue;
      }

      const kvMatch = rawLine.match(/^([a-zA-Z0-9_]+)\s*:\s*(.*)$/);
      if (!kvMatch) {
        currentListKey = null;
        continue;
      }

      const key = kvMatch[1];
      const rawVal = kvMatch[2].trim();
      currentListKey = null;

      if (!(key in meta)) continue;

      if (Array.isArray(meta[key])) {
        if (!rawVal) {
          currentListKey = key;
        } else if (rawVal.startsWith('[') && rawVal.endsWith(']')) {
          meta[key] = parseInlineYamlList(rawVal);
        } else {
          const single = unquoteYamlScalar(rawVal);
          if (single) meta[key] = [single];
        }
      } else if (typeof meta[key] === 'boolean') {
        meta[key] = rawVal.toLowerCase() === 'true';
      } else {
        meta[key] = unquoteYamlScalar(rawVal);
      }
    }
  }

  // 从文件名兜底提取 ID
  if (!meta.id && filePath) {
    const base = path.basename(filePath);
    const idMatch = base.match(/^(BIZ-\d{8}-\d+)/i);
    if (idMatch) meta.id = idMatch[1].toUpperCase();
  }
  meta.id = String(meta.id || '').toUpperCase();
  meta.status = String(meta.status || 'active').toLowerCase();
  meta.reqs = uniqueStrings(meta.reqs, { upper: true });
  meta.rules = uniqueStrings(meta.rules, { upper: true });
  meta.supersedes = uniqueStrings(meta.supersedes, { upper: true });
  meta.supersededBy = uniqueStrings(meta.supersededBy, { upper: true });
  meta.relatedBiz = uniqueStrings(meta.relatedBiz, { upper: true });
  meta.files = uniqueStrings(meta.files, { normalizePath: true });
  meta.symbols = uniqueStrings(meta.symbols);
  meta.commits = uniqueStrings(meta.commits);

  const sections = extractBodySections(body);
  const firstWhy = sections.why[0] || sections.decisions[0] || sections.specialLogic[0] || meta.title || '';
  const summaryLine = firstWhy.length > 110 ? `${firstWhy.slice(0, 107)}...` : firstWhy;

  return {
    ...meta,
    ...sections,
    summaryLine,
    body: body.trim(),
    rawContent: text,
    filePath,
  };
}

function extractBodySections(body = '') {
  const lines = String(body || '').split('\n');
  let active = null;
  const sections = {
    why: [],
    decisions: [],
    specialLogic: [],
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (/^##\s+/.test(trimmed)) {
      if (/业务背景|why/i.test(trimmed)) active = 'why';
      else if (/决策|取舍|decision/i.test(trimmed)) active = 'decisions';
      else if (/特殊逻辑|红线|special|rule/i.test(trimmed)) active = 'specialLogic';
      else active = null;
      continue;
    }
    if (!active || !trimmed) continue;
    const bullet = trimmed.replace(/^[-*]\s+/, '').trim();
    if (bullet && !/^（暂无/.test(bullet)) {
      sections[active].push(bullet);
    }
  }

  return sections;
}

/**
 * 序列化 BIZ 业务背景档案为标准 Markdown
 */
export function serializeBizDocument(doc = {}) {
  const formatArrayBlock = (key, items) => {
    const list = Array.isArray(items) ? items : [];
    if (list.length === 0) return `${key}: []`;
    if (list.length <= 4 && list.every(i => !String(i).includes('/') && String(i).length <= 24)) {
      return `${key}: [${list.map(i => formatYamlScalar(i)).join(', ')}]`;
    }
    return `${key}:\n${list.map(i => `  - ${formatYamlScalar(i)}`).join('\n')}`;
  };

  const frontmatter = [
    '---',
    `id: ${formatYamlScalar(doc.id)}`,
    `title: ${formatYamlScalar(doc.title || doc.id)}`,
    `status: ${formatYamlScalar(doc.status || 'active')}`,
    `createdAt: ${formatYamlScalar(doc.createdAt || formatDateYMD().dashed)}`,
    `updatedAt: ${formatYamlScalar(doc.updatedAt || formatDateYMD().dashed)}`,
    `externalRef: ${formatYamlScalar(doc.externalRef || '')}`,
    formatArrayBlock('reqs', doc.reqs),
    formatArrayBlock('rules', doc.rules),
    formatArrayBlock('supersedes', doc.supersedes),
    formatArrayBlock('supersededBy', doc.supersededBy),
    formatArrayBlock('relatedBiz', doc.relatedBiz),
    formatArrayBlock('files', doc.files),
    formatArrayBlock('symbols', doc.symbols),
    formatArrayBlock('commits', doc.commits),
    `yongleSynced: ${doc.yongleSynced ? 'true' : 'false'}`,
    '---',
  ].join('\n');

  const renderList = (items, fallback) => {
    const clean = toBulletArray(items);
    if (clean.length === 0) return `- ${fallback}`;
    return clean.map(item => `- ${item}`).join('\n');
  };

  const body = [
    `# [${doc.id}] ${doc.title || '业务背景档案'}`,
    '',
    '## 业务背景 (Why)',
    renderList(doc.why, '（暂无补充背景）'),
    '',
    '## 关键决策与取舍 (Decisions)',
    renderList(doc.decisions, '（暂无特殊方案取舍）'),
    '',
    '## 特殊逻辑与边界红线 (Special Logic)',
    renderList(doc.specialLogic, '（暂无特殊逻辑说明）'),
    '',
  ].join('\n');

  return `${frontmatter}\n\n${body}`;
}

// ==========================================
// 2. 档案读取、ID 生成、建档、绑定与演化链
// ==========================================

export function loadAllBizDocuments(cwd = process.cwd(), options = {}) {
  const contextDir = getBizContextDir(cwd, options);
  if (!fs.existsSync(contextDir)) return [];

  let files = [];
  try {
    files = fs.readdirSync(contextDir)
      .filter(f => /^BIZ-\d{8}-\d+.*\.md$/i.test(f))
      .sort();
  } catch (_) {
    return [];
  }

  const docs = [];
  for (const file of files) {
    const fullPath = path.join(contextDir, file);
    try {
      const content = fs.readFileSync(fullPath, 'utf-8');
      const parsed = parseBizDocument(content, fullPath);
      if (parsed.id) {
        parsed.relPath = normalizeRelPath(path.relative(cwd, fullPath));
        docs.push(parsed);
      }
    } catch (_) {}
  }

  return docs;
}

export function findBizDocument(cwd = process.cwd(), bizId = '', options = {}) {
  const cleanId = String(bizId || '').trim().toUpperCase();
  if (!cleanId) return null;
  const docs = loadAllBizDocuments(cwd, options);
  return docs.find(d => d.id.toUpperCase() === cleanId) || null;
}

/**
 * 生成同日递增的全局唯一业务背景 ID: BIZ-YYYYMMDD-NN
 */
export function generateNextBizId(cwd = process.cwd(), options = {}) {
  const { compact } = formatDateYMD(options.date || new Date());
  const prefix = `BIZ-${compact}-`;
  const docs = loadAllBizDocuments(cwd, options);
  let maxSeq = 0;

  for (const d of docs) {
    if (d.id.startsWith(prefix)) {
      const seq = parseInt(d.id.slice(prefix.length), 10);
      if (Number.isFinite(seq) && seq > maxSeq) maxSeq = seq;
    }
  }

  return `${prefix}${String(maxSeq + 1).padStart(2, '0')}`;
}

/**
 * 同步更新被替代旧档案的 status=superseded 与 supersededBy 演化指针
 */
function applySupersedesChain(cwd, newBizId, supersededIds = [], options = {}) {
  const updated = [];
  if (!Array.isArray(supersededIds) || supersededIds.length === 0) return updated;

  const today = formatDateYMD(options.date || new Date()).dashed;
  for (const oldId of uniqueStrings(supersededIds, { upper: true })) {
    if (oldId === newBizId) continue;
    const oldDoc = findBizDocument(cwd, oldId, options);
    if (!oldDoc || !oldDoc.filePath) continue;

    oldDoc.status = 'superseded';
    oldDoc.supersededBy = uniqueStrings([...(oldDoc.supersededBy || []), newBizId], { upper: true });
    oldDoc.updatedAt = today;

    fs.writeFileSync(oldDoc.filePath, serializeBizDocument(oldDoc), 'utf-8');
    updated.push(oldDoc.id);
  }
  return updated;
}

/**
 * 创建一条永久业务背景档案（支持两栖独立运行与可选双写永乐大典）
 */
export function createBizContext(cwd = process.cwd(), payload = {}, options = {}) {
  const cfg = resolveBizConfig(cwd, options);
  const contextDir = getBizContextDir(cwd, cfg);
  ensureDir(contextDir);

  const dateObj = payload.date || options.date || new Date();
  const { dashed } = formatDateYMD(dateObj);
  const id = payload.id ? String(payload.id).trim().toUpperCase() : generateNextBizId(cwd, { ...cfg, date: dateObj });
  const title = String(payload.title || '未命名业务背景').trim();

  let files = uniqueStrings(toStringArray(payload.files), { normalizePath: true });
  let commits = uniqueStrings(toStringArray(payload.commits));

  if (payload.fromGit) {
    const gitFiles = collectGitChangedFiles(cwd);
    files = uniqueStrings([...files, ...gitFiles], { normalizePath: true });
    const headSha = getLatestGitCommit(cwd);
    if (headSha) commits = uniqueStrings([...commits, headSha]);
  }

  const supersedes = uniqueStrings(toStringArray(payload.supersedes), { upper: true });
  const relatedBiz = uniqueStrings(toStringArray(payload.relatedBiz), { upper: true });

  const doc = {
    id,
    title,
    status: String(payload.status || 'active').toLowerCase(),
    createdAt: dashed,
    updatedAt: dashed,
    externalRef: String(payload.externalRef || '').trim(),
    reqs: uniqueStrings(toStringArray(payload.reqs), { upper: true }),
    rules: uniqueStrings(toStringArray(payload.rules), { upper: true }),
    supersedes,
    supersededBy: [],
    relatedBiz,
    files,
    symbols: uniqueStrings(toStringArray(payload.symbols)),
    commits,
    yongleSynced: false,
    why: toBulletArray(payload.why),
    decisions: toBulletArray(payload.decisions),
    specialLogic: toBulletArray(payload.specialLogic),
  };

  const slug = slugifyTitle(title);
  const fileName = `${id}${slug ? `-${slug}` : ''}.md`;
  const filePath = path.join(contextDir, fileName);

  // 可选双写沉淀至《永乐大典》
  const shouldSyncYongle = payload.syncToYongle !== undefined ? Boolean(payload.syncToYongle) : Boolean(cfg.syncToYongle);
  let yongleResult = null;
  if (shouldSyncYongle) {
    try {
      const bridge = new YongleBridge();
      if (typeof bridge.syncBizContext === 'function') {
        yongleResult = bridge.syncBizContext(doc, cwd);
        if (yongleResult?.synced) {
          doc.yongleSynced = true;
        }
      }
    } catch (_) {}
  }

  fs.writeFileSync(filePath, serializeBizDocument(doc), 'utf-8');

  // 维护纵向演化链：将旧档案标记为 superseded
  const supersededUpdated = applySupersedesChain(cwd, id, supersedes, { ...cfg, date: dateObj });

  // 增量刷新倒排索引（默认不跑慢速 git log）
  const index = rebuildBizIndex(cwd, { ...cfg, includeGit: false });

  return {
    success: true,
    id,
    title,
    filePath: normalizeRelPath(path.relative(cwd, filePath)),
    supersededUpdated,
    yongleResult,
    doc: parseBizDocument(fs.readFileSync(filePath, 'utf-8'), filePath),
    stats: index.stats,
  };
}

/**
 * 为已有 BIZ 档案追加关联代码文件、函数符号、Git Commit 或演化指针
 */
export function linkBizContext(cwd = process.cwd(), bizId = '', linkData = {}, options = {}) {
  const cfg = resolveBizConfig(cwd, options);
  const doc = findBizDocument(cwd, bizId, cfg);
  if (!doc) {
    return {
      success: false,
      id: String(bizId || '').toUpperCase(),
      message: `未找到业务背景档案 [${bizId}]`,
    };
  }

  let newFiles = uniqueStrings(toStringArray(linkData.files), { normalizePath: true });
  let newCommits = uniqueStrings(toStringArray(linkData.commits));

  if (linkData.fromGit) {
    newFiles = uniqueStrings([...newFiles, ...collectGitChangedFiles(cwd)], { normalizePath: true });
    const headSha = getLatestGitCommit(cwd);
    if (headSha) newCommits = uniqueStrings([...newCommits, headSha]);
  }

  const newSupersedes = uniqueStrings(toStringArray(linkData.supersedes), { upper: true });

  doc.files = uniqueStrings([...doc.files, ...newFiles], { normalizePath: true });
  doc.symbols = uniqueStrings([...doc.symbols, ...toStringArray(linkData.symbols)]);
  doc.commits = uniqueStrings([...doc.commits, ...newCommits]);
  doc.reqs = uniqueStrings([...doc.reqs, ...toStringArray(linkData.reqs)], { upper: true });
  doc.rules = uniqueStrings([...doc.rules, ...toStringArray(linkData.rules)], { upper: true });
  doc.supersedes = uniqueStrings([...doc.supersedes, ...newSupersedes], { upper: true });
  doc.relatedBiz = uniqueStrings([...doc.relatedBiz, ...toStringArray(linkData.relatedBiz)], { upper: true });
  if (linkData.status) doc.status = String(linkData.status).toLowerCase();
  if (linkData.why) doc.why = uniqueStrings([...doc.why, ...toBulletArray(linkData.why)]);
  if (linkData.decisions) doc.decisions = uniqueStrings([...doc.decisions, ...toBulletArray(linkData.decisions)]);
  if (linkData.specialLogic) doc.specialLogic = uniqueStrings([...doc.specialLogic, ...toBulletArray(linkData.specialLogic)]);
  doc.updatedAt = formatDateYMD(options.date || new Date()).dashed;

  fs.writeFileSync(doc.filePath, serializeBizDocument(doc), 'utf-8');

  const supersededUpdated = applySupersedesChain(cwd, doc.id, newSupersedes, cfg);
  const index = rebuildBizIndex(cwd, { ...cfg, includeGit: false });

  return {
    success: true,
    id: doc.id,
    filePath: doc.relPath,
    files: doc.files,
    symbols: doc.symbols,
    commits: doc.commits,
    supersededUpdated,
    stats: index.stats,
  };
}

/**
 * 列出业务背景档案（支持按状态/关键词筛选）
 */
export function listBizContexts(cwd = process.cwd(), options = {}) {
  const docs = loadAllBizDocuments(cwd, options);
  const statusFilter = options.status ? String(options.status).toLowerCase() : null;
  const query = options.query ? String(options.query).trim().toLowerCase() : null;

  return docs
    .filter(d => {
      if (statusFilter && statusFilter !== 'all' && d.status !== statusFilter) return false;
      if (query) {
        const hay = `${d.id} ${d.title} ${d.summaryLine} ${d.files.join(' ')} ${d.symbols.join(' ')} ${d.reqs.join(' ')} ${d.body}`.toLowerCase();
        if (!hay.includes(query)) return false;
      }
      return true;
    })
    .map(d => ({
      id: d.id,
      title: d.title,
      status: d.status,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
      summaryLine: d.summaryLine,
      reqs: d.reqs,
      rules: d.rules,
      files: d.files,
      symbols: d.symbols,
      supersedes: d.supersedes,
      supersededBy: d.supersededBy,
      relPath: d.relPath,
    }));
}

// ==========================================
// 3. 多语言 @biz / @why 源码锚点扫描
// ==========================================

function loadIgnoredDirs(cwd) {
  const ignored = new Set(DEFAULT_IGNORED_DIRS);
  const gitignorePath = path.join(cwd, '.gitignore');
  if (fs.existsSync(gitignorePath)) {
    try {
      const lines = fs.readFileSync(gitignorePath, 'utf-8').split('\n');
      for (const raw of lines) {
        const trimmed = raw.trim();
        if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('!')) continue;
        const clean = trimmed.replace(/^\//, '').replace(/\/$/, '');
        if (clean && !clean.includes('/') && !clean.includes('*')) {
          ignored.add(clean);
        }
      }
    } catch (_) {}
  }
  return ignored;
}

/**
 * 向上启发式回溯最近的外层类/函数符号，增强代码重构移位后的抗漂移能力
 */
export function findEnclosingSymbol(lines, lineIdx, ext = '') {
  const maxLookback = Math.max(0, lineIdx - 50);
  for (let i = lineIdx; i >= maxLookback; i--) {
    const trimmed = (lines[i] || '').trim();
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('#') || trimmed.startsWith('*')) continue;

    // C# / Java / Kotlin 方法与类
    if (['.cs', '.java', '.kt'].includes(ext)) {
      const methodMatch = trimmed.match(/^(?:public|private|protected|internal)\s+(?:(?:static|async|virtual|override|abstract|sealed|readonly|new)\s+)*[\w<>,\[\]\?\.\s]+\s+(\w+)\s*\(/);
      if (methodMatch && !['if', 'for', 'foreach', 'while', 'switch', 'catch', 'using'].includes(methodMatch[1])) {
        return methodMatch[1];
      }
      const typeMatch = trimmed.match(/^(?:public|private|protected|internal)?\s*(?:static|abstract|sealed|partial)?\s*(?:class|interface|record|struct)\s+(\w+)/);
      if (typeMatch) return typeMatch[1];
    }

    // Python def / class
    if (ext === '.py') {
      const pyMatch = trimmed.match(/^(?:async\s+)?(?:def|class)\s+(\w+)/);
      if (pyMatch) return pyMatch[1];
    }

    // Go func
    if (ext === '.go') {
      const goMatch = trimmed.match(/^func\s+(?:\([^)]+\)\s*)?(\w+)\s*\(/);
      if (goMatch) return goMatch[1];
    }

    // JS / TS / Vue
    const jsFnMatch = trimmed.match(/^(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+(\w+)\s*\(/);
    if (jsFnMatch) return jsFnMatch[1];

    const jsArrowMatch = trimmed.match(/^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?(?:\([^)]*\)|\w+)\s*=>/);
    if (jsArrowMatch) return jsArrowMatch[1];

    const jsMethodMatch = trimmed.match(/^(?:public|private|protected|static|async|get|set|\s)*(\w+)\s*\([^)]*\)\s*(?::\s*[\w<>\[\]|?\s]+)?\s*\{/);
    if (jsMethodMatch && !['if', 'for', 'while', 'switch', 'catch', 'constructor', 'function'].includes(jsMethodMatch[1])) {
      return jsMethodMatch[1];
    }

    const clsMatch = trimmed.match(/^(?:export\s+)?(?:default\s+)?(?:abstract\s+)?(?:class|interface)\s+(\w+)/);
    if (clsMatch) return clsMatch[1];
  }
  return '';
}

/**
 * 判断行内指定字符偏移位置是否处于字符串字面量引号内部（避免把日志/测试字符串里的 "// @biz" 误判为源码注释）
 */
function isInsideStringLiteral(line = '', targetIdx = 0) {
  let quote = null;
  for (let i = 0; i < targetIdx && i < line.length; i++) {
    const ch = line[i];
    if (quote) {
      if (ch === '\\') {
        i++; // 跳过转义字符
        continue;
      }
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
    }
  }
  return quote !== null;
}

/**
 * 解析单文件源码中的 @biz 与 @why 锚点
 */
export function parseAnchorsFromFileContent(content = '', relPath = '') {
  const anchors = [];
  if (!content || (!content.includes('@biz') && !content.includes('@why'))) {
    return anchors;
  }

  const ext = path.extname(relPath).toLowerCase();
  const lines = String(content).replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.includes('@biz') && !line.includes('@why')) continue;

    // 跳过正则字面量或模板文档中转义示例，避免自扫描误报
    if (/\\s\+|\\d\{|LEADING_COMMENT_|TRAILING_COMMENT_/.test(line)) continue;

    let match = line.match(LEADING_COMMENT_BIZ_RE);
    if (!match) {
      const trail = line.match(TRAILING_COMMENT_BIZ_RE);
      if (trail && !isInsideStringLiteral(line, trail.index)) {
        match = trail;
      }
    }
    if (match) {
      const bizId = match[1].toUpperCase();
      const ruleRef = match[2] ? match[2].toUpperCase() : '';
      const reason = match[3].trim();
      if (BIZ_ID_REGEX.test(bizId) && reason) {
        anchors.push({
          kind: 'biz',
          file: normalizeRelPath(relPath),
          line: i + 1,
          bizId,
          ruleRef,
          reason,
          symbol: findEnclosingSymbol(lines, i, ext),
        });
        continue;
      }
    }

    match = line.match(LEADING_COMMENT_WHY_RE);
    if (!match) {
      const trail = line.match(TRAILING_COMMENT_WHY_RE);
      if (trail && !isInsideStringLiteral(line, trail.index)) {
        match = trail;
      }
    }
    if (match) {
      const ruleRef = match[1] ? match[1].toUpperCase() : '';
      const reason = match[2].trim();
      if (reason && !/^[\s*`"']+$/.test(reason)) {
        anchors.push({
          kind: 'why',
          file: normalizeRelPath(relPath),
          line: i + 1,
          bizId: null,
          ruleRef,
          reason,
          symbol: findEnclosingSymbol(lines, i, ext),
        });
      }
    }
  }

  return anchors;
}

/**
 * 扫描单个文件的 @biz / @why 锚点（微秒级只读，不落盘）
 */
export function scanFileAnchors(cwd = process.cwd(), relPath = '') {
  const norm = normalizeRelPath(relPath);
  const fullPath = path.isAbsolute(relPath) ? relPath : path.join(cwd, norm);
  if (!fs.existsSync(fullPath)) return [];
  try {
    const stat = fs.statSync(fullPath);
    if (!stat.isFile() || stat.size > 2 * 1024 * 1024) return [];
    const content = fs.readFileSync(fullPath, 'utf-8');
    return parseAnchorsFromFileContent(content, norm);
  } catch (_) {
    return [];
  }
}

/**
 * 扫描工作区全部源码中的 @biz / @why 锚点
 */
export function scanCodeAnchors(cwd = process.cwd(), options = {}) {
  const maxDepth = options.maxDepth ?? 8;
  const ignored = loadIgnoredDirs(cwd);
  const allAnchors = [];

  const walk = (dir, depth) => {
    if (depth > maxDepth) return;
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (_) {
      return;
    }

    for (const entry of entries) {
      if (ignored.has(entry.name)) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath, depth + 1);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (!SCANNABLE_EXTS.has(ext)) continue;
        try {
          const stat = fs.statSync(fullPath);
          if (stat.size > 1024 * 1024) continue; // 跳过超大生成物
          const content = fs.readFileSync(fullPath, 'utf-8');
          if (!content.includes('@biz') && !content.includes('@why')) continue;
          const relPath = normalizeRelPath(path.relative(cwd, fullPath));
          const anchors = parseAnchorsFromFileContent(content, relPath);
          if (anchors.length > 0) {
            allAnchors.push(...anchors);
          }
        } catch (_) {}
      }
    }
  };

  walk(cwd, 0);
  return allAnchors;
}

// ==========================================
// 4. 只读 Git Trailer 与行级提交历史提取
// ==========================================

function runGitReadOnly(cwd, gitArgs = []) {
  try {
    return execFileSync('git', gitArgs, {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 5000,
      windowsHide: true,
    });
  } catch (_) {
    return '';
  }
}

export function collectGitChangedFiles(cwd = process.cwd()) {
  const out1 = runGitReadOnly(cwd, ['diff', '--name-only']);
  const out2 = runGitReadOnly(cwd, ['diff', '--cached', '--name-only']);
  const out3 = runGitReadOnly(cwd, ['status', '--porcelain']);
  const files = [];

  for (const line of `${out1}\n${out2}`.split('\n')) {
    const clean = normalizeRelPath(line);
    if (clean && !clean.startsWith('.sansheng/')) files.push(clean);
  }
  for (const line of out3.split('\n')) {
    if (!line || line.length < 4) continue;
    const raw = line.slice(3).trim().replace(/^"(.*)"$/, '$1');
    const clean = normalizeRelPath(raw);
    if (clean && !clean.startsWith('.sansheng/')) files.push(clean);
  }
  return uniqueStrings(files, { normalizePath: true });
}

export function getLatestGitCommit(cwd = process.cwd()) {
  const sha = runGitReadOnly(cwd, ['rev-parse', '--short', 'HEAD']).trim();
  return sha || '';
}

function parseGitLogBlocks(rawOutput = '') {
  if (!rawOutput) return [];
  const marker = '---SANSHENG-COMMIT---';
  const blocks = rawOutput.split(marker).map(b => b.trim()).filter(Boolean);
  const commits = [];

  for (const block of blocks) {
    const lines = block.replace(/\r\n/g, '\n').split('\n');
    const hash = (lines[0] || '').trim();
    const shortHash = (lines[1] || '').trim();
    const date = (lines[2] || '').trim();
    const author = (lines[3] || '').trim();
    const subject = (lines[4] || '').trim();
    const body = lines.slice(5).join('\n').trim();
    if (!hash) continue;

    const fullMsg = `${subject}\n${body}`;
    const bizIds = uniqueStrings(fullMsg.match(/\bBIZ-\d{8}-\d+\b/gi) || [], { upper: true });
    const reqIds = uniqueStrings(fullMsg.match(/\bREQ-\d+\b/gi) || [], { upper: true });
    const ruleIds = uniqueStrings(fullMsg.match(/\bRULE-\d+\b/gi) || [], { upper: true });

    // 解析标准 Trailer: Biz-Context: ...
    const trailerLines = body.split('\n').filter(l => /^(?:Biz-Context|Req-Id|Rule-Id|Why)\s*:/i.test(l.trim()));

    commits.push({
      hash,
      shortHash: shortHash || hash.slice(0, 7),
      date,
      author,
      subject,
      bizIds,
      reqIds,
      ruleIds,
      trailers: trailerLines.map(l => l.trim()),
    });
  }

  return commits;
}

/**
 * 只读检索目标文件（或行区间）的 Git 提交记录与 Biz-Context Trailer
 */
export function readGitBizTrailers(cwd = process.cwd(), options = {}) {
  const maxCount = Math.max(1, Math.min(20, Number(options.maxCount || 8)));
  const fmt = '---SANSHENG-COMMIT---%n%H%n%h%n%cs%n%an%n%s%n%b';

  // 行级历史优先尝试 git log -L
  if (options.filePath && Number.isFinite(Number(options.lineStart))) {
    const start = Math.max(1, Number(options.lineStart));
    const end = Math.max(start, Number(options.lineEnd || start));
    const rel = normalizeRelPath(options.filePath);
    const lineRaw = runGitReadOnly(cwd, [
      'log',
      '-n', String(Math.min(maxCount, 5)),
      '--no-patch',
      `-L`, `${start},${end}:${rel}`,
      `--pretty=format:${fmt}`,
    ]);
    const lineCommits = parseGitLogBlocks(lineRaw);
    if (lineCommits.length > 0) {
      return lineCommits;
    }
  }

  const gitArgs = ['log', '-n', String(maxCount), `--pretty=format:${fmt}`];
  if (options.filePath) {
    gitArgs.push('--follow', '--', normalizeRelPath(options.filePath));
  }
  const raw = runGitReadOnly(cwd, gitArgs);
  return parseGitLogBlocks(raw);
}

// ==========================================
// 5. 0-Token 倒排索引构建与读取
// ==========================================

/**
 * 0-Token 本地重建 .sansheng/context/index.json 双向倒排索引
 */
export function rebuildBizIndex(cwd = process.cwd(), options = {}) {
  const cfg = resolveBizConfig(cwd, options);
  const docs = loadAllBizDocuments(cwd, cfg);
  const anchors = scanCodeAnchors(cwd, options);

  const byBiz = {};
  const byFile = {};
  const bySymbol = {};
  const byReq = {};
  const orphanAnchors = [];

  const ensureFileEntry = (filePath) => {
    const norm = normalizeRelPath(filePath);
    if (!norm) return null;
    if (!byFile[norm]) {
      byFile[norm] = { bizIds: [], activeBizIds: [], anchors: [] };
    }
    return byFile[norm];
  };

  const ensureSymbolEntry = (sym) => {
    const clean = String(sym || '').trim();
    if (!clean) return null;
    if (!bySymbol[clean]) {
      bySymbol[clean] = { bizIds: [], anchors: [] };
    }
    return bySymbol[clean];
  };

  for (const doc of docs) {
    byBiz[doc.id] = {
      id: doc.id,
      title: doc.title,
      status: doc.status,
      summaryLine: doc.summaryLine,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
      externalRef: doc.externalRef,
      relPath: doc.relPath,
      reqs: doc.reqs,
      rules: doc.rules,
      supersedes: doc.supersedes,
      supersededBy: doc.supersededBy,
      relatedBiz: doc.relatedBiz,
      files: [...doc.files],
      symbols: [...doc.symbols],
      commits: [...doc.commits],
      yongleSynced: doc.yongleSynced,
      anchorCount: 0,
    };

    for (const f of doc.files) {
      const entry = ensureFileEntry(f);
      if (entry) {
        if (!entry.bizIds.includes(doc.id)) entry.bizIds.push(doc.id);
        if (doc.status === 'active' && !entry.activeBizIds.includes(doc.id)) {
          entry.activeBizIds.push(doc.id);
        }
      }
    }

    for (const s of doc.symbols) {
      const entry = ensureSymbolEntry(s);
      if (entry && !entry.bizIds.includes(doc.id)) entry.bizIds.push(doc.id);
    }

    for (const req of doc.reqs) {
      if (!byReq[req]) byReq[req] = [];
      if (!byReq[req].includes(doc.id)) byReq[req].push(doc.id);
    }
  }

  for (const anchor of anchors) {
    const fEntry = ensureFileEntry(anchor.file);
    if (fEntry) {
      fEntry.anchors.push(anchor);
    }

    if (anchor.symbol) {
      const sEntry = ensureSymbolEntry(anchor.symbol);
      if (sEntry) {
        sEntry.anchors.push(anchor);
        if (anchor.bizId && byBiz[anchor.bizId] && !sEntry.bizIds.includes(anchor.bizId)) {
          sEntry.bizIds.push(anchor.bizId);
        }
      }
    }

    if (anchor.kind === 'biz' && anchor.bizId) {
      const bizMeta = byBiz[anchor.bizId];
      if (!bizMeta) {
        orphanAnchors.push(anchor);
      } else {
        bizMeta.anchorCount++;
        if (!bizMeta.files.includes(anchor.file)) bizMeta.files.push(anchor.file);
        if (anchor.symbol && !bizMeta.symbols.includes(anchor.symbol)) bizMeta.symbols.push(anchor.symbol);
        if (fEntry) {
          if (!fEntry.bizIds.includes(anchor.bizId)) fEntry.bizIds.push(anchor.bizId);
          if (bizMeta.status === 'active' && !fEntry.activeBizIds.includes(anchor.bizId)) {
            fEntry.activeBizIds.push(anchor.bizId);
          }
        }
      }
    }
  }

  // 可选吸收最近 Git Trailer 关联（不拖慢常规构建）
  let gitTrailers = [];
  if (options.includeGit === true) {
    gitTrailers = readGitBizTrailers(cwd, { maxCount: 20 }).filter(c => c.bizIds.length > 0);
    for (const commit of gitTrailers) {
      for (const bid of commit.bizIds) {
        if (byBiz[bid] && !byBiz[bid].commits.includes(commit.shortHash)) {
          byBiz[bid].commits.push(commit.shortHash);
        }
      }
    }
  }

  const activeBizCount = docs.filter(d => d.status === 'active').length;
  const supersededBizCount = docs.filter(d => d.status === 'superseded').length;

  const indexData = {
    version: 1,
    generatedAt: new Date().toISOString(),
    stats: {
      totalBiz: docs.length,
      activeBiz: activeBizCount,
      supersededBiz: supersededBizCount,
      totalAnchors: anchors.length,
      bizAnchors: anchors.filter(a => a.kind === 'biz').length,
      whyAnchors: anchors.filter(a => a.kind === 'why').length,
      orphanAnchors: orphanAnchors.length,
      linkedFiles: Object.keys(byFile).length,
    },
    byBiz,
    byFile,
    bySymbol,
    byReq,
    anchors,
    orphanAnchors,
  };

  if (options.save !== false) {
    const indexPath = getBizIndexPath(cwd, cfg);
    ensureDir(path.dirname(indexPath));
    fs.writeFileSync(indexPath, JSON.stringify(indexData, null, 2), 'utf-8');
  }

  return indexData;
}

/**
 * 只读加载现有索引（若目录尚未初始化则绝不污染磁盘）
 */
export function loadBizIndex(cwd = process.cwd(), options = {}) {
  const cfg = resolveBizConfig(cwd, options);
  const indexPath = getBizIndexPath(cwd, cfg);
  if (fs.existsSync(indexPath)) {
    try {
      return JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
    } catch (_) {}
  }

  const contextDir = getBizContextDir(cwd, cfg);
  if (fs.existsSync(contextDir)) {
    return rebuildBizIndex(cwd, { ...cfg, save: false, includeGit: false });
  }

  return null;
}

// ==========================================
// 6. 代码依赖调用链穿透 & 低 Token 改前红线注入
// ==========================================

function loadCodebaseGraph(cwd) {
  const indexPath = path.join(cwd, CODEBASE_INDEX_REL);
  if (!fs.existsSync(indexPath)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
    return parsed?.nodes || null;
  } catch (_) {
    return null;
  }
}

function matchFileKeyInMap(mapObj = {}, targetFile = '') {
  if (!mapObj || !targetFile) return null;
  const norm = normalizeRelPath(targetFile);
  const keys = Object.keys(mapObj);
  return (
    keys.find(k => k === norm)
    || keys.find(k => k.toLowerCase() === norm.toLowerCase())
    || keys.find(k => k.endsWith('/' + norm) || norm.endsWith('/' + k))
    || null
  );
}

/**
 * 收集某文件在内存中（已有索引 + 实时单文件锚点）的生效业务背景与锚点，零磁盘写入
 */
function inspectFileContextReadOnly(cwd, relPath, indexCache = null, options = {}) {
  const norm = normalizeRelPath(relPath);
  const index = indexCache !== undefined ? indexCache : loadBizIndex(cwd, options);
  const includeInactive = options.includeInactive === true;

  // 实时读取该单文件的锚点（保证刚写的 @biz/@why 无需手动 reindex 即可见）
  const liveAnchors = scanFileAnchors(cwd, norm);
  const matchedFileKey = index ? matchFileKeyInMap(index.byFile, norm) : null;
  const indexedEntry = matchedFileKey ? index.byFile[matchedFileKey] : null;

  const anchors = liveAnchors.length > 0 ? liveAnchors : (indexedEntry?.anchors || []);
  const bizIdSet = new Set(indexedEntry?.bizIds || []);
  for (const a of anchors) {
    if (a.bizId) bizIdSet.add(a.bizId);
  }

  const bizRecords = [];
  for (const bid of bizIdSet) {
    const meta = index?.byBiz?.[bid] || findBizDocument(cwd, bid, options);
    if (!meta) continue;
    if (!includeInactive && meta.status !== 'active') continue;
    bizRecords.push(meta);
  }

  return {
    file: matchedFileKey || norm,
    bizRecords,
    anchors,
  };
}

/**
 * 专供 map --focus 上下游依赖行使用的超轻量预警徽章（约 5 Token，无记录返回空串）
 */
export function getFileBizBadge(cwd = process.cwd(), relPath = '', options = {}) {
  const cfg = resolveBizConfig(cwd, options);
  if (!cfg.enabled) return '';

  const info = inspectFileContextReadOnly(cwd, relPath, options.index, {
    ...cfg,
    includeInactive: false,
  });

  const bizCount = info.bizRecords.length;
  const anchorCount = info.anchors.length;
  if (bizCount === 0 && anchorCount === 0) return '';

  const parts = [];
  if (bizCount > 0) parts.push(`BIZ:${bizCount}`);
  if (anchorCount > 0) parts.push(`@biz:${anchorCount}`);
  return ` ⚠️ [${parts.join(', ')}]`;
}

/**
 * 专供 AI 改代码前注入（map --focus / 工兵微切片）的超低 Token 业务背景与特殊逻辑红线摘要
 * - 目标文件无关联业务背景且无 @biz/@why 注释时，严格返回 "" (0 Token 增量)
 * - 默认过滤已废止 (superseded/deprecated) 记录，只注入 active 生效红线
 * - 强制执行 maxChars 硬截断预算，超额以 sansheng_why 指针折叠
 */
export function getFileBizBrief(cwd = process.cwd(), relPath = '', options = {}) {
  const cfg = resolveBizConfig(cwd, options);
  if (!cfg.enabled || (options.respectAutoInject !== false && !cfg.autoInjectOnFocus)) {
    return '';
  }

  const maxTokens = options.maxTokens ?? cfg.injectBudgetTokens ?? DEFAULT_INJECT_BUDGET_TOKENS;
  const maxChars = Math.max(240, Number(options.maxChars || maxTokens * 4));
  const info = inspectFileContextReadOnly(cwd, relPath, options.index, {
    ...cfg,
    includeInactive: false,
  });

  if (info.bizRecords.length === 0 && info.anchors.length === 0) {
    return '';
  }

  const lines = [];
  const header = options.heading || `## 🧭 业务背景与特殊逻辑红线 (Business Context: \`${info.file}\`)`;
  lines.push(header);
  lines.push(`> ⚠️ 修改前请遵守以下业务红线，严禁擅自删除带 \`@biz\`/\`@why\` 标注的特殊逻辑。`);

  const maxBizItems = options.maxBizItems ?? 5;
  const maxAnchorItems = options.maxAnchorItems ?? 8;

  if (info.bizRecords.length > 0) {
    const shownBiz = info.bizRecords.slice(0, maxBizItems);
    for (const b of shownBiz) {
      const ruleTag = (b.rules || []).length > 0 ? ` [${b.rules.slice(0, 3).join(',')}]` : '';
      const summary = b.summaryLine && b.summaryLine !== b.title ? ` — ${b.summaryLine}` : '';
      lines.push(`* **\`[${b.id}]\`** ${b.title}${ruleTag}${summary}`);
    }
    if (info.bizRecords.length > maxBizItems) {
      lines.push(`* *...另有 ${info.bizRecords.length - maxBizItems} 条关联业务记录，调用 \`sansheng_why("${info.file}")\` 按需展开*`);
    }
  }

  if (info.anchors.length > 0) {
    const shownAnchors = info.anchors.slice(0, maxAnchorItems);
    for (const a of shownAnchors) {
      const tag = a.kind === 'biz' ? `@biz ${a.bizId}` : '@why';
      const sym = a.symbol ? ` (${a.symbol})` : '';
      const rule = a.ruleRef ? ` [${a.ruleRef}]` : '';
      lines.push(`* \`L${a.line}\`${sym} \`${tag}\`${rule}: ${a.reason}`);
    }
    if (info.anchors.length > maxAnchorItems) {
      lines.push(`* *...另有 ${info.anchors.length - maxAnchorItems} 处源码锚点*`);
    }
  }

  let output = lines.join('\n');
  if (output.length > maxChars) {
    const tail = `\n> 💡 *[Token 护栏已折叠]* 完整背景请按需调用 \`sansheng_why("${info.file}")\`。`;
    const cutAt = Math.max(120, maxChars - tail.length);
    output = output.slice(0, cutAt).replace(/\n[^\n]*$/, '') + tail;
  }

  return output;
}

/**
 * 沿 codebase_index.json 双向依赖边做 1~2 跳调用链业务红线穿透
 */
export function collectCallChainContext(cwd = process.cwd(), relPath = '', options = {}) {
  const depth = Math.max(0, Math.min(2, Number(options.chainDepth ?? 0)));
  if (depth === 0) return { upstream: [], downstream: [], graphAvailable: false };

  const graph = loadCodebaseGraph(cwd);
  if (!graph) return { upstream: [], downstream: [], graphAvailable: false };

  const startKey = matchFileKeyInMap(graph, relPath);
  if (!startKey) return { upstream: [], downstream: [], graphAvailable: true };

  const index = options.index !== undefined ? options.index : loadBizIndex(cwd, options);

  const traverse = (edgeField) => {
    const visited = new Set([startKey]);
    let frontier = [startKey];
    const hits = [];

    for (let hop = 1; hop <= depth; hop++) {
      const nextFrontier = [];
      for (const cur of frontier) {
        const neighbors = graph[cur]?.[edgeField] || [];
        for (const nb of neighbors) {
          if (visited.has(nb)) continue;
          visited.add(nb);
          nextFrontier.push(nb);

          const info = inspectFileContextReadOnly(cwd, nb, index, {
            ...options,
            includeInactive: false,
          });
          if (info.bizRecords.length > 0 || info.anchors.length > 0) {
            hits.push({
              hop,
              file: nb,
              bizRecords: info.bizRecords.map(b => ({ id: b.id, title: b.title, summaryLine: b.summaryLine })),
              anchors: info.anchors.slice(0, 4),
            });
          }
        }
      }
      frontier = nextFrontier;
      if (frontier.length === 0) break;
    }

    return hits;
  };

  return {
    graphAvailable: true,
    upstream: traverse('dependents'),
    downstream: traverse('dependencies'),
  };
}

// ==========================================
// 7. 多模态反向查询引擎 (sansheng why)
// ==========================================

function paginateText(text = '', offset = 0, limit = DEFAULT_WHY_LIMIT_CHARS) {
  const safeText = String(text || '');
  const safeOffset = Math.max(0, Number.isFinite(Number(offset)) ? Number(offset) : 0);
  const safeLimit = Math.max(200, Number.isFinite(Number(limit)) ? Number(limit) : DEFAULT_WHY_LIMIT_CHARS);
  const slice = safeText.slice(safeOffset, safeOffset + safeLimit);
  const endPos = safeOffset + slice.length;
  const truncated = endPos < safeText.length;

  return {
    content: slice,
    offset: safeOffset,
    limit: safeLimit,
    totalLength: safeText.length,
    truncated,
    nextOffset: truncated ? endPos : null,
  };
}

function parseFileLineTarget(rawTarget = '') {
  const trimmed = String(rawTarget || '').trim();
  // 匹配 file.cs:45 或 file.cs:40-60 或 file.cs#L45-L60（兼容 Windows 盘符 C:/...）
  const lineMatch = trimmed.match(/^(.+?)(?::|#L)(\d+)(?:-(?:L)?(\d+))?$/i);
  if (lineMatch) {
    return {
      filePart: normalizeRelPath(lineMatch[1]),
      lineStart: parseInt(lineMatch[2], 10),
      lineEnd: lineMatch[3] ? parseInt(lineMatch[3], 10) : parseInt(lineMatch[2], 10),
    };
  }
  return { filePart: normalizeRelPath(trimmed), lineStart: null, lineEnd: null };
}

function resolveTargetFile(cwd, filePart, index) {
  if (!filePart) return null;
  const directAbs = path.isAbsolute(filePart) ? filePart : path.join(cwd, filePart);
  if (fs.existsSync(directAbs) && fs.statSync(directAbs).isFile()) {
    return normalizeRelPath(path.relative(cwd, directAbs));
  }
  if (index?.byFile) {
    const matched = matchFileKeyInMap(index.byFile, filePart);
    if (matched) return matched;
  }
  const graph = loadCodebaseGraph(cwd);
  if (graph) {
    const matched = matchFileKeyInMap(graph, filePart);
    if (matched) return matched;
  }
  return null;
}

function formatEvolutionNote(doc) {
  const parts = [];
  if (doc.status === 'superseded') {
    const by = (doc.supersededBy || []).join(', ');
    parts.push(`⚠️ 已废止${by ? `，被 ${by} 替代` : ''}`);
  } else if (doc.status === 'deprecated') {
    parts.push('⚠️ 已废弃');
  }
  if ((doc.supersedes || []).length > 0) {
    parts.push(`替代旧口径: ${doc.supersedes.join(', ')}`);
  }
  if ((doc.relatedBiz || []).length > 0) {
    parts.push(`关联: ${doc.relatedBiz.join(', ')}`);
  }
  return parts.length > 0 ? ` (${parts.join(' | ')})` : '';
}

function appendChainSection(sections, chainData, related) {
  const hasUp = chainData.upstream.length > 0;
  const hasDown = chainData.downstream.length > 0;
  if (!hasUp && !hasDown) return;

  sections.push('## 🔗 调用链关联业务红线 (Call Chain)');
  if (hasDown) {
    sections.push('### ⬇️ 下游依赖雷区 (Dependencies)');
    for (const item of chainData.downstream) {
      const bizStr = item.bizRecords.map(b => `\`${b.id}\` ${b.title}`).join('; ');
      sections.push(`- [跳数 ${item.hop}] \`${item.file}\`${bizStr ? ` ➔ ${bizStr}` : ''}`);
      for (const a of item.anchors) {
        const tag = a.kind === 'biz' ? `@biz ${a.bizId}` : '@why';
        sections.push(`  - \`L${a.line}\` \`${tag}\`: ${a.reason}`);
      }
      for (const b of item.bizRecords) {
        related.push({ id: b.id, type: 'BIZ', summary: `[下游 ${item.file}] ${b.title}` });
      }
    }
  }
  if (hasUp) {
    sections.push('### ⬆️ 上游调用方关联 (Dependents)');
    for (const item of chainData.upstream) {
      const bizStr = item.bizRecords.map(b => `\`${b.id}\` ${b.title}`).join('; ');
      sections.push(`- [跳数 ${item.hop}] \`${item.file}\`${bizStr ? ` ➔ ${bizStr}` : ''}`);
      for (const b of item.bizRecords) {
        related.push({ id: b.id, type: 'BIZ', summary: `[上游 ${item.file}] ${b.title}` });
      }
    }
  }
  sections.push('');
}

function dedupeRelated(items = []) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    if (!item?.id || seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out.slice(0, 12);
}

/**
 * 反向查询某段代码 / 文件 / 符号 / BIZ-ID 对应的业务需求、背景与特殊逻辑
 */
export function queryWhy(cwd = process.cwd(), target = '', options = {}) {
  const cfg = resolveBizConfig(cwd, options);
  const rawTarget = String(target || '').trim();
  const offset = options.offset ?? 0;
  const limit = options.limit ?? cfg.whyBudgetChars ?? DEFAULT_WHY_LIMIT_CHARS;
  const includeGit = options.includeGit !== false;
  const chainDepth = Math.max(0, Math.min(2, Number(options.chainDepth ?? 0)));

  if (!rawTarget) {
    return {
      found: false,
      mode: 'unknown',
      target: '',
      message: '请提供查询目标，如 "src/OrderService.cs:45"、"src/OrderService.cs"、"ValidateTaxNo" 或 "BIZ-20261128-01"',
      related: [],
    };
  }

  // 加载或只读构建索引
  const existingIndex = loadBizIndex(cwd, cfg);
  const index = existingIndex || rebuildBizIndex(cwd, { ...cfg, save: false, includeGit: false });

  // 模式 1：直接按 BIZ-YYYYMMDD-NN 查完整档案 + 关联源码锚点
  if (BIZ_ID_REGEX.test(rawTarget)) {
    const bizId = rawTarget.toUpperCase();
    const doc = findBizDocument(cwd, bizId, cfg);
    if (!doc) {
      return {
        found: false,
        mode: 'biz',
        target: bizId,
        message: `未找到业务背景档案 [${bizId}]`,
        related: [],
      };
    }

    const matchedAnchors = (index.anchors || []).filter(a => a.bizId === bizId);
    const sections = [
      `# 🧭 [${doc.id}] ${doc.title}${formatEvolutionNote(doc)}`,
      `- **状态**: \`${doc.status}\` | **更新**: ${doc.updatedAt || doc.createdAt || '-'}${doc.externalRef ? ` | **外部单号**: ${doc.externalRef}` : ''}`,
      doc.reqs.length > 0 ? `- **关联需求**: ${doc.reqs.map(r => `\`${r}\``).join(', ')}` : '',
      doc.rules.length > 0 ? `- **业务红线**: ${doc.rules.map(r => `\`${r}\``).join(', ')}` : '',
      doc.files.length > 0 ? `- **关联文件**: ${doc.files.map(f => `\`${f}\``).join(', ')}` : '',
      doc.commits.length > 0 ? `- **关联提交**: ${doc.commits.map(c => `\`${c}\``).join(', ')}` : '',
      '',
      doc.body,
    ].filter(s => s !== null && s !== undefined);

    if (matchedAnchors.length > 0) {
      sections.push('', '## 📍 源码特殊逻辑锚点');
      for (const a of matchedAnchors) {
        const sym = a.symbol ? ` (${a.symbol})` : '';
        sections.push(`- \`${a.file}:L${a.line}\`${sym}: ${a.reason}`);
      }
    }

    const related = [];
    for (const s of doc.supersededBy) related.push({ id: s, type: 'BIZ', summary: '替代当前口径的新业务档案' });
    for (const s of doc.supersedes) related.push({ id: s, type: 'BIZ', summary: '被当前档案替代的旧业务口径' });
    for (const r of doc.relatedBiz) related.push({ id: r, type: 'BIZ', summary: '关联业务档案' });
    for (const req of doc.reqs) related.push({ id: req, type: 'REQ', summary: `可通过 sansheng_recall("${req}") 查看需求细节` });

    const fullText = sections.filter(Boolean).join('\n');
    const page = paginateText(fullText, offset, limit);
    return {
      found: true,
      mode: 'biz',
      target: bizId,
      source: doc.relPath,
      ...page,
      related: dedupeRelated(related),
    };
  }

  // 模式 2 / 3：文件路径或文件:行号反查
  const { filePart, lineStart, lineEnd } = parseFileLineTarget(rawTarget);
  const resolvedFile = resolveTargetFile(cwd, filePart, index);

  if (resolvedFile) {
    const isLineMode = Number.isFinite(lineStart);
    const fileInfo = inspectFileContextReadOnly(cwd, resolvedFile, index, {
      ...cfg,
      includeInactive: true,
    });

    // 若是行模式，额外提取当前行附近 ±15 行的锚点与外层函数符号
    let nearbyAnchors = fileInfo.anchors;
    let enclosingSym = '';
    if (isLineMode) {
      nearbyAnchors = fileInfo.anchors.filter(a => a.line >= lineStart - 15 && a.line <= lineEnd + 15);
      const absFile = path.join(cwd, resolvedFile);
      if (fs.existsSync(absFile)) {
        try {
          const lines = fs.readFileSync(absFile, 'utf-8').replace(/\r\n/g, '\n').split('\n');
          enclosingSym = findEnclosingSymbol(lines, Math.min(lines.length - 1, Math.max(0, lineStart - 1)), path.extname(resolvedFile).toLowerCase());
        } catch (_) {}
      }
    }

    // 读取 Git 历史与 Biz-Context Trailer
    const gitCommits = includeGit
      ? readGitBizTrailers(cwd, {
          filePath: resolvedFile,
          ...(isLineMode ? { lineStart, lineEnd } : {}),
          maxCount: isLineMode ? 5 : 8,
        })
      : [];

    // 从 Git Commit Trailer 补齐可能未写入文件列表的 BIZ 档案
    const bizMap = new Map(fileInfo.bizRecords.map(b => [b.id, b]));
    for (const c of gitCommits) {
      for (const bid of c.bizIds) {
        if (!bizMap.has(bid)) {
          const doc = index.byBiz?.[bid] || findBizDocument(cwd, bid, cfg);
          if (doc) bizMap.set(bid, doc);
        }
      }
    }
    const allBiz = [...bizMap.values()].sort((a, b) => {
      if (a.status === 'active' && b.status !== 'active') return -1;
      if (a.status !== 'active' && b.status === 'active') return 1;
      return String(b.id).localeCompare(String(a.id));
    });

    // 调用链穿透（按需）
    const chainData = collectCallChainContext(cwd, resolvedFile, {
      ...cfg,
      chainDepth,
      index,
    });

    const hasAnyEvidence =
      allBiz.length > 0
      || fileInfo.anchors.length > 0
      || gitCommits.length > 0
      || chainData.upstream.length > 0
      || chainData.downstream.length > 0;

    if (!hasAnyEvidence) {
      return {
        found: false,
        mode: isLineMode ? 'line' : 'file',
        target: rawTarget,
        file: resolvedFile,
        message: `未检索到 \`${resolvedFile}\` 关联的业务背景档案、@biz/@why 锚点或 Git 提交记录。可使用 \`sansheng biz create\` 建立业务背景卡，或在特殊逻辑上方添加 \`// @why: 原因\`。`,
        related: [],
      };
    }

    const sections = [];
    const headerLoc = isLineMode
      ? `${resolvedFile}:L${lineStart}${lineEnd !== lineStart ? `-L${lineEnd}` : ''}${enclosingSym ? ` (${enclosingSym})` : ''}`
      : resolvedFile;
    sections.push(`# 🧭 业务溯源报告: \`${headerLoc}\``);
    sections.push('');

    const related = [];

    // 1. 源码内联锚点（最高精准度）
    const anchorsToShow = isLineMode && nearbyAnchors.length > 0 ? nearbyAnchors : fileInfo.anchors;
    if (anchorsToShow.length > 0) {
      sections.push(isLineMode && nearbyAnchors.length > 0 ? '## 📍 附近源码特殊逻辑锚点 (±15 行)' : '## 📍 源码特殊逻辑锚点');
      for (const a of anchorsToShow) {
        const tag = a.kind === 'biz' ? `@biz ${a.bizId}` : '@why';
        const sym = a.symbol ? ` (${a.symbol})` : '';
        const rule = a.ruleRef ? ` [${a.ruleRef}]` : '';
        sections.push(`- \`L${a.line}\`${sym} \`${tag}\`${rule}: ${a.reason}`);
      }
      sections.push('');
    }

    // 2. 关联业务背景档案
    if (allBiz.length > 0) {
      sections.push('## 📚 关联业务背景与决策档案');
      for (const b of allBiz) {
        const fullDoc = findBizDocument(cwd, b.id, cfg);
        sections.push(`### \`[${b.id}]\` ${b.title}${formatEvolutionNote(b)}`);
        if (fullDoc?.why?.length > 0) {
          sections.push(`- **业务背景**: ${fullDoc.why.join('；')}`);
        } else if (b.summaryLine) {
          sections.push(`- **业务背景**: ${b.summaryLine}`);
        }
        if (fullDoc?.decisions?.length > 0) {
          sections.push(`- **决策取舍**: ${fullDoc.decisions.join('；')}`);
        }
        if (fullDoc?.specialLogic?.length > 0) {
          sections.push(`- **特殊逻辑**: ${fullDoc.specialLogic.join('；')}`);
        }
        if ((b.reqs || []).length > 0) {
          sections.push(`- **关联需求**: ${b.reqs.join(', ')}`);
          for (const req of b.reqs) {
            related.push({ id: req, type: 'REQ', summary: `来自 ${b.id} 的原子需求` });
          }
        }
        related.push({ id: b.id, type: 'BIZ', summary: `${b.title} (${b.status})` });
        for (const oldId of b.supersedes || []) {
          related.push({ id: oldId, type: 'BIZ', summary: `被 ${b.id} 替代的历史业务口径` });
        }
        for (const newId of b.supersededBy || []) {
          related.push({ id: newId, type: 'BIZ', summary: `替代 ${b.id} 的最新业务口径` });
        }
      }
      sections.push('');
    }

    // 3. 调用链关联（仅在 --chain / chainDepth >= 1 时输出）
    appendChainSection(sections, chainData, related);

    // 4. Git 历史提交与 Trailer
    if (gitCommits.length > 0) {
      sections.push(isLineMode ? '## 🕒 该行段 Git 修改历史' : '## 🕒 近期 Git 提交记录');
      for (const c of gitCommits.slice(0, 6)) {
        const bizTag = c.bizIds.length > 0 ? ` [${c.bizIds.join(', ')}]` : '';
        const reqTag = c.reqIds.length > 0 ? ` (${c.reqIds.join(', ')})` : '';
        sections.push(`- \`${c.shortHash}\` (${c.date}) ${c.subject}${bizTag}${reqTag}`);
      }
      sections.push('');
    }

    const fullText = sections.join('\n').trim();
    const page = paginateText(fullText, offset, limit);
    return {
      found: true,
      mode: isLineMode ? 'line' : 'file',
      target: rawTarget,
      file: resolvedFile,
      ...(isLineMode ? { lineStart, lineEnd, enclosingSymbol: enclosingSym } : {}),
      chainDepth,
      source: resolvedFile,
      ...page,
      related: dedupeRelated(related),
    };
  }

  // 模式 4：符号名 / 关键词跨索引检索
  const kw = rawTarget.toLowerCase();
  const matchedBiz = [];
  const matchedAnchors = [];
  const seenBiz = new Set();

  // 4.1 精确/模糊匹配符号表
  for (const [sym, entry] of Object.entries(index.bySymbol || {})) {
    if (sym.toLowerCase() === kw || sym.toLowerCase().includes(kw)) {
      for (const bid of entry.bizIds || []) {
        if (!seenBiz.has(bid) && index.byBiz[bid]) {
          seenBiz.add(bid);
          matchedBiz.push(index.byBiz[bid]);
        }
      }
      for (const a of entry.anchors || []) {
        matchedAnchors.push(a);
      }
    }
  }

  // 4.2 检索所有档案标题/摘要/正文/需求号
  for (const doc of loadAllBizDocuments(cwd, cfg)) {
    if (seenBiz.has(doc.id)) continue;
    const hay = `${doc.id} ${doc.title} ${doc.externalRef} ${doc.reqs.join(' ')} ${doc.rules.join(' ')} ${doc.symbols.join(' ')} ${doc.body}`.toLowerCase();
    if (hay.includes(kw)) {
      seenBiz.add(doc.id);
      matchedBiz.push(index.byBiz[doc.id] || doc);
    }
  }

  // 4.3 检索锚点文本
  for (const a of index.anchors || []) {
    const hay = `${a.reason} ${a.symbol} ${a.ruleRef} ${a.bizId || ''}`.toLowerCase();
    if (hay.includes(kw) && !matchedAnchors.some(x => x.file === a.file && x.line === a.line)) {
      matchedAnchors.push(a);
    }
  }

  if (matchedBiz.length === 0 && matchedAnchors.length === 0) {
    return {
      found: false,
      mode: 'symbol_or_keyword',
      target: rawTarget,
      message: `未在业务背景档案或源码 @biz/@why 锚点中检索到与 [${rawTarget}] 匹配的记录`,
      related: [],
    };
  }

  const sections = [`# 🧭 业务溯源检索: \`${rawTarget}\``, ''];
  const related = [];

  if (matchedAnchors.length > 0) {
    sections.push('## 📍 命中的源码特殊逻辑锚点');
    for (const a of matchedAnchors.slice(0, 12)) {
      const tag = a.kind === 'biz' ? `@biz ${a.bizId}` : '@why';
      const sym = a.symbol ? ` (${a.symbol})` : '';
      sections.push(`- \`${a.file}:L${a.line}\`${sym} \`${tag}\`: ${a.reason}`);
      if (a.bizId && index.byBiz[a.bizId]) {
        related.push({ id: a.bizId, type: 'BIZ', summary: index.byBiz[a.bizId].title });
      }
    }
    sections.push('');
  }

  if (matchedBiz.length > 0) {
    sections.push('## 📚 命中的业务背景档案');
    for (const b of matchedBiz.slice(0, 8)) {
      sections.push(`- **\`[${b.id}]\`** ${b.title}${formatEvolutionNote(b)}`);
      if (b.summaryLine) sections.push(`  - 摘要: ${b.summaryLine}`);
      if ((b.files || []).length > 0) sections.push(`  - 文件: ${b.files.slice(0, 5).map(f => `\`${f}\``).join(', ')}`);
      related.push({ id: b.id, type: 'BIZ', summary: `${b.title} (${b.status})` });
    }
    sections.push('');
  }

  const fullText = sections.join('\n').trim();
  const page = paginateText(fullText, offset, limit);
  return {
    found: true,
    mode: 'symbol_or_keyword',
    target: rawTarget,
    source: '.sansheng/context',
    ...page,
    related: dedupeRelated(related),
  };
}

// ==========================================
// 8. 轻量防腐化审计 & 结项同步
// ==========================================

/**
 * 审计业务上下文健康度：检出幽灵 @biz 锚点、指向已废止档案的旧锚点、失联文件与悬空档案
 */
export function auditBizContext(cwd = process.cwd(), options = {}) {
  const cfg = resolveBizConfig(cwd, options);
  const hasContextDir = fs.existsSync(getBizContextDir(cwd, cfg));
  const shouldSave = options.save !== undefined ? Boolean(options.save) : hasContextDir;
  const index = rebuildBizIndex(cwd, { ...cfg, save: shouldSave, includeGit: false });

  const orphanAnchors = index.orphanAnchors || [];
  const supersededAnchors = [];
  const missingFiles = [];
  const unlinkedActiveBiz = [];

  for (const anchor of index.anchors || []) {
    if (anchor.kind === 'biz' && anchor.bizId && index.byBiz[anchor.bizId]) {
      const biz = index.byBiz[anchor.bizId];
      if (biz.status === 'superseded' || biz.status === 'deprecated') {
        supersededAnchors.push({
          ...anchor,
          status: biz.status,
          supersededBy: biz.supersededBy || [],
        });
      }
    }
  }

  for (const biz of Object.values(index.byBiz || {})) {
    for (const f of biz.files || []) {
      const abs = path.join(cwd, f);
      if (!fs.existsSync(abs)) {
        missingFiles.push({ bizId: biz.id, file: f });
      }
    }
    if (biz.status === 'active' && (biz.files || []).length === 0 && (biz.commits || []).length === 0 && biz.anchorCount === 0) {
      unlinkedActiveBiz.push({ id: biz.id, title: biz.title });
    }
  }

  const passed = orphanAnchors.length === 0 && missingFiles.length === 0;

  return {
    passed,
    stats: index.stats,
    orphanAnchors,
    supersededAnchors,
    missingFiles,
    unlinkedActiveBiz,
  };
}

/**
 * 供尚书省结项归档时调用：自动将活跃任务涉及的 BIZ 档案与最新代码改动同步并刷新索引
 */
export function syncMilestoneToBizContext(cwd = process.cwd(), options = {}) {
  const cfg = resolveBizConfig(cwd, options);
  if (!cfg.enabled) return { skipped: true, reason: 'disabled' };

  const contextDir = getBizContextDir(cwd, cfg);
  if (!fs.existsSync(contextDir)) {
    return { skipped: true, reason: 'no_context_dir' };
  }

  const docs = loadAllBizDocuments(cwd, cfg);
  if (docs.length === 0) {
    return { skipped: true, reason: 'no_biz_docs' };
  }

  const activeBizIds = uniqueStrings(options.bizIds || [], { upper: true });
  const changedFiles = collectGitChangedFiles(cwd);
  const headSha = getLatestGitCommit(cwd);

  const linkedBizIds = [];
  for (const bid of activeBizIds) {
    if (changedFiles.length > 0 || headSha) {
      const res = linkBizContext(cwd, bid, {
        files: changedFiles,
        commits: headSha ? [headSha] : [],
      }, cfg);
      if (res.success) linkedBizIds.push(bid);
    }
  }

  // 可选将尚未同步的 active 业务档案同步至永乐大典
  const yongleSyncedIds = [];
  if (cfg.syncToYongle) {
    const bridge = new YongleBridge();
    if (typeof bridge.syncBizContext === 'function') {
      for (const doc of loadAllBizDocuments(cwd, cfg)) {
        if (doc.status === 'active' && !doc.yongleSynced) {
          try {
            const syncRes = bridge.syncBizContext(doc, cwd);
            if (syncRes?.synced) {
              doc.yongleSynced = true;
              fs.writeFileSync(doc.filePath, serializeBizDocument(doc), 'utf-8');
              yongleSyncedIds.push(doc.id);
            }
          } catch (_) {}
        }
      }
    }
  }

  const index = rebuildBizIndex(cwd, { ...cfg, includeGit: true });

  return {
    skipped: false,
    linkedBizIds,
    yongleSyncedIds,
    stats: index.stats,
  };
}
