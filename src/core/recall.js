import fs from 'fs';
import path from 'path';
import { Shangshu } from './shangshu.js';
import { parseUATBlocks } from './uat-runner.js';

const DEFAULT_LIMIT = 2000;

/**
 * 从文本中提取关联的三省六部对象 ID (REQ / TASK / UAT / RULE)
 */
export function extractRelatedRefs(text = '', excludeId = '') {
  if (!text || typeof text !== 'string') return [];
  const cleanExclude = String(excludeId || '').trim().toUpperCase();
  const seen = new Set();
  const refs = [];

  const patterns = [
    { type: 'TASK', regex: /\bTASK-\d+(?:[-_][A-Z0-9]+)*/gi },
    { type: 'REQ', regex: /\bREQ-\d+\b/gi },
    { type: 'UAT', regex: /\bUAT-\d+\b/gi },
    { type: 'JOB', regex: /\bJOB-[A-Z0-9_-]+\b/gi },
  ];

  for (const { type, regex } of patterns) {
    const matches = text.match(regex) || [];
    for (const raw of matches) {
      const id = raw.toUpperCase();
      if (id === cleanExclude || seen.has(id)) continue;
      seen.add(id);
      refs.push({ id, type });
    }
  }

  return refs;
}

/**
 * 按 Inline & Spill 规则分页切片文本
 */
function paginateContent(fullText = '', offset = 0, limit = DEFAULT_LIMIT) {
  const safeText = String(fullText || '');
  const safeOffset = Math.max(0, Number.isFinite(Number(offset)) ? Number(offset) : 0);
  const safeLimit = Math.max(100, Number.isFinite(Number(limit)) ? Number(limit) : DEFAULT_LIMIT);

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

/**
 * 收集工作区内的全部候选 Markdown 文档用于 REQ / UAT 检索
 */
function collectSearchableDocs(shangshu) {
  const docs = [];
  const candidates = [shangshu.taskPath, shangshu.roadmapPath];
  for (const filePath of candidates) {
    if (filePath && fs.existsSync(filePath)) {
      docs.push({
        label: path.relative(shangshu.cwd, filePath) || path.basename(filePath),
        content: fs.readFileSync(filePath, 'utf-8'),
      });
    }
  }

  if (fs.existsSync(shangshu.tasksDir)) {
    try {
      const files = fs.readdirSync(shangshu.tasksDir).filter(f => f.endsWith('.md') && !f.startsWith('.')).sort();
      for (const f of files) {
        const full = path.join(shangshu.tasksDir, f);
        docs.push({
          label: `.sansheng/tasks/${f}`,
          taskId: (f.match(/^(TASK-\d+)/i)?.[1] || f.replace(/\.md$/i, '')).toUpperCase(),
          content: fs.readFileSync(full, 'utf-8'),
        });
      }
    } catch (_) {}
  }

  return docs;
}

/**
 * 为关联 ID 生成 1 行 Inline 摘要 (Chain of Recall 下一跳指针)
 */
function summarizeRelated(refs, shangshu) {
  const tasks = shangshu.listTasks();
  const taskMap = new Map(tasks.map(t => [t.id.toUpperCase(), t]));
  const jobsDir = path.join(shangshu.sanshengDir, 'jobs');

  return refs.slice(0, 12).map(ref => {
    if (ref.type === 'TASK') {
      const t = taskMap.get(ref.id) || tasks.find(item => ref.id.startsWith(item.id));
      if (t) {
        return {
          id: t.id,
          type: 'TASK',
          summary: `${t.title} (${t.completed ? '已完成' : '进行中'}, UAT ${t.completedUats}/${t.totalUats})`,
        };
      }
    }
    if (ref.type === 'JOB') {
      const jobFile = path.join(jobsDir, `${ref.id}.json`);
      if (fs.existsSync(jobFile)) {
        try {
          const j = JSON.parse(fs.readFileSync(jobFile, 'utf-8'));
          return {
            id: ref.id,
            type: 'JOB',
            summary: `状态: ${j.status} | 任务: ${j.taskId} | 模型: ${j.modelUsed || j.model}`,
          };
        } catch (_) {}
      }
    }
    return {
      id: ref.id,
      type: ref.type,
      summary: `可通过 sansheng_recall("${ref.id}") 按需展开详情`,
    };
  });
}

/**
 * 链式按需召回三省六部对象 (支持 TASK / REQ / UAT / JOB / ARCHIVE)
 */
export function recallById(id, options = {}) {
  const cwd = options.cwd || process.cwd();
  const offset = options.offset ?? 0;
  const limit = options.limit ?? DEFAULT_LIMIT;

  if (!id || typeof id !== 'string' || !id.trim()) {
    return {
      found: false,
      id: '',
      type: 'UNKNOWN',
      message: '请提供有效的对象 ID（如 TASK-01、REQ-01、UAT-01、JOB-xxx 或 ARCHIVE）',
      related: [],
    };
  }

  const rawId = id.trim();
  const upperId = rawId.toUpperCase();
  const shangshu = new Shangshu(cwd);

  // 1. JOB-xx 召回 (异步后台工兵状态与完整日志 Spill)
  if (upperId.startsWith('JOB-')) {
    const jobsDir = path.join(shangshu.sanshengDir, 'jobs');
    const cleanJobId = rawId.replace(/\.json$/i, '');
    const jobFile = path.join(jobsDir, `${cleanJobId}.json`);
    if (!fs.existsSync(jobFile)) {
      return { found: false, id: rawId, type: 'JOB', message: `未找到后台工兵记录 [${rawId}]`, related: [] };
    }
    let jobMeta;
    try {
      jobMeta = JSON.parse(fs.readFileSync(jobFile, 'utf-8'));
    } catch (err) {
      return { found: false, id: rawId, type: 'JOB', message: `Job 元数据损坏: ${err.message}`, related: [] };
    }

    const logFile = path.isAbsolute(jobMeta.logPath || '')
      ? jobMeta.logPath
      : path.join(cwd, jobMeta.logPath || path.join('.sansheng', 'jobs', `${cleanJobId}.log`));
    const logContent = fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf-8') : '(暂无日志输出)';
    const fullText = [
      `# [JOB] ${jobMeta.jobId} (${jobMeta.status})`,
      `- 任务: [${jobMeta.taskId}] ${jobMeta.taskTitle || ''}`,
      `- 模型: ${jobMeta.modelUsed || jobMeta.model || 'default'} | 重试: ${jobMeta.retryCount ?? 0}`,
      `- 开始: ${jobMeta.startedAt || '-'} | 结束: ${jobMeta.finishedAt || '-'}`,
      ``,
      `## 执行日志`,
      logContent,
    ].join('\n');

    const page = paginateContent(fullText, offset, limit);
    const refs = extractRelatedRefs(`${jobMeta.taskId || ''}\n${logContent}`, jobMeta.jobId);
    return {
      found: true,
      id: jobMeta.jobId,
      type: 'JOB',
      source: path.relative(cwd, jobFile),
      ...page,
      related: summarizeRelated(refs, shangshu),
    };
  }

  // 2. ARCHIVE 召回 (列出归档索引或读取指定归档切片)
  if (upperId === 'ARCHIVE' || upperId.startsWith('ARCHIVE/')) {
    const archiveDir = path.resolve(shangshu.archiveDir);
    if (!fs.existsSync(archiveDir)) {
      return { found: false, id: rawId, type: 'ARCHIVE', message: '当前尚无归档记录 (.sansheng/archive 不存在)', related: [] };
    }

    if (upperId === 'ARCHIVE') {
      const entries = [];
      const walk = (dir) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            walk(full);
          } else if (entry.name.endsWith('.md')) {
            const rel = path.relative(archiveDir, full).replace(/\\/g, '/');
            entries.push(rel);
          }
        }
      };
      walk(archiveDir);
      const listing = entries.length > 0
        ? entries.map(rel => `- \`ARCHIVE/${rel}\``).join('\n')
        : '（归档目录为空）';
      const page = paginateContent(`# 归档索引 (.sansheng/archive)\n${listing}`, offset, limit);
      return {
        found: true,
        id: 'ARCHIVE',
        type: 'ARCHIVE',
        source: '.sansheng/archive',
        ...page,
        related: entries.slice(0, 12).map(rel => ({
          id: `ARCHIVE/${rel}`,
          type: 'ARCHIVE',
          summary: `历史归档文档 (${rel})`,
        })),
      };
    }

    const relSubPath = rawId.slice('ARCHIVE/'.length).replace(/^[/\\]+/, '');
    const targetPath = path.resolve(archiveDir, relSubPath);
    if (!targetPath.startsWith(archiveDir + path.sep) && targetPath !== archiveDir) {
      return { found: false, id: rawId, type: 'ARCHIVE', message: '安全阻断：非法归档路径越界访问', related: [] };
    }
    if (!fs.existsSync(targetPath) || fs.statSync(targetPath).isDirectory()) {
      return { found: false, id: rawId, type: 'ARCHIVE', message: `未找到归档文件 [${rawId}]`, related: [] };
    }

    const content = fs.readFileSync(targetPath, 'utf-8');
    const page = paginateContent(content, offset, limit);
    const refs = extractRelatedRefs(content, upperId);
    return {
      found: true,
      id: rawId,
      type: 'ARCHIVE',
      source: path.relative(cwd, targetPath),
      ...page,
      related: summarizeRelated(refs, shangshu),
    };
  }

  // 3. TASK-xx 召回
  if (upperId.startsWith('TASK-')) {
    const taskPath = shangshu.getTaskPath(upperId);
    if (taskPath && fs.existsSync(taskPath)) {
      const content = fs.readFileSync(taskPath, 'utf-8');
      const page = paginateContent(content, offset, limit);
      const refs = extractRelatedRefs(content, upperId);

      // 同时关联该 TASK 对应的后台 JOB
      const jobsDir = path.join(shangshu.sanshengDir, 'jobs');
      if (fs.existsSync(jobsDir)) {
        try {
          const jobFiles = fs.readdirSync(jobsDir).filter(f => f.endsWith('.json') && !f.endsWith('.task.json'));
          for (const jf of jobFiles) {
            const j = JSON.parse(fs.readFileSync(path.join(jobsDir, jf), 'utf-8'));
            if (String(j.taskId || '').toUpperCase() === upperId) {
              refs.push({ id: j.jobId, type: 'JOB' });
            }
          }
        } catch (_) {}
      }

      return {
        found: true,
        id: upperId,
        type: 'TASK',
        source: path.relative(cwd, taskPath),
        ...page,
        related: summarizeRelated(refs, shangshu),
      };
    }
    return { found: false, id: upperId, type: 'TASK', message: `未找到任务分片 [${upperId}]`, related: [] };
  }

  // 4. REQ-xx 召回 (从文档与任务分片中聚合提取该 REQ 区块与 AC)
  if (upperId.startsWith('REQ-')) {
    const docs = collectSearchableDocs(shangshu);
    const matchedBlocks = [];
    const relatedTasks = [];

    for (const doc of docs) {
      const lines = doc.content.replace(/\r\n/g, '\n').split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (new RegExp(`\\[?${upperId}\\b`, 'i').test(lines[i])) {
          // 收集当前 REQ 行及其缩进子行 (AC 等)
          const block = [lines[i]];
          for (let j = i + 1; j < lines.length; j++) {
            const line = lines[j];
            if (/^\s*[-*]\s*\[?(?:REQ-\d+|TASK-\d+|UAT-\d+)/i.test(line) || /^#{1,4}\s/.test(line)) {
              break;
            }
            if (line.trim() === '' && block.length > 1) break;
            block.push(line);
          }
          matchedBlocks.push(`### 来源: ${doc.label}\n${block.join('\n')}`);
          if (doc.taskId) relatedTasks.push({ id: doc.taskId, type: 'TASK' });
        }
      }
    }

    if (matchedBlocks.length === 0) {
      return { found: false, id: upperId, type: 'REQ', message: `未在当前工作区文档中检索到 [${upperId}]`, related: [] };
    }

    const fullText = matchedBlocks.join('\n\n');
    const page = paginateContent(fullText, offset, limit);
    const refs = [...relatedTasks, ...extractRelatedRefs(fullText, upperId)];
    return {
      found: true,
      id: upperId,
      type: 'REQ',
      source: 'workspace-docs',
      ...page,
      related: summarizeRelated(refs, shangshu),
    };
  }

  // 5. UAT-xx 召回
  if (upperId.startsWith('UAT-')) {
    const docs = collectSearchableDocs(shangshu);
    for (const doc of docs) {
      const blocks = parseUATBlocks(doc.content);
      const foundUat = blocks.find(b => b.id.toUpperCase() === upperId);
      if (foundUat) {
        const fullText = [
          `# [${foundUat.id}] ${foundUat.title} (${foundUat.passed ? '已通过' : '待验收'})`,
          `- 来源文档: ${doc.label}`,
          foundUat.trace ? `- 溯源: ${foundUat.trace}` : '',
          foundUat.preconditions ? `- 前置与数据: ${foundUat.preconditions}` : '',
          foundUat.steps ? `- 操作步骤: ${foundUat.steps}` : '',
          foundUat.expected ? `- PRD预期对照: ${foundUat.expected}` : '',
          foundUat.rawText ? `- 详情: ${foundUat.rawText}` : '',
        ].filter(Boolean).join('\n');
        const page = paginateContent(fullText, offset, limit);
        const refs = extractRelatedRefs(fullText, upperId);
        if (doc.taskId) refs.unshift({ id: doc.taskId, type: 'TASK' });
        return {
          found: true,
          id: upperId,
          type: 'UAT',
          source: doc.label,
          ...page,
          related: summarizeRelated(refs, shangshu),
        };
      }
    }
    return { found: false, id: upperId, type: 'UAT', message: `未找到验收用例 [${upperId}]`, related: [] };
  }

  return {
    found: false,
    id: rawId,
    type: 'UNKNOWN',
    message: `不支持的对象 ID 前缀 [${rawId}]，支持 TASK-xx / REQ-xx / UAT-xx / JOB-xx / ARCHIVE`,
    related: [],
  };
}
