import fs from 'fs';
import path from 'path';
import { getFileBizBrief, getFileBizBadge, loadBizIndex } from '../core/biz-context.js';

const DEFAULT_IGNORED_DIRS = ['node_modules', 'bin', 'obj', '.git', 'dist', 'build', '.tasks', '.sansheng', '.system_generated', '.vscode', '.idea'];
const CACHE_FILE_REL = path.join('.sansheng', 'cache', 'map_cache.json');
const INDEX_FILE_REL = path.join('.sansheng', 'codebase_index.json');

/**
 * 递归扫描并提取工作区代码库拓扑地图 (SPEC §8)
 * 支持增量缓存、依赖继承网络构建、双层产物输出与向下兼容
 */
export function extractCodebaseMap(dir = process.cwd(), maxDepth = 4, options = {}) {
  const ignored = loadIgnorePatterns(dir);
  const cachePath = path.join(dir, CACHE_FILE_REL);
  const cache = options.skipCache ? { version: 2, files: {} } : loadMapCache(cachePath);

  const scannedFiles = [];
  walkDir(dir, 0, maxDepth, ignored, (filePath) => {
    const ext = path.extname(filePath).toLowerCase();
    if (['.cs', '.vue', '.ts', '.js', '.tsx', '.jsx'].includes(ext)) {
      scannedFiles.push(filePath);
    }
  });

  let cacheHits = 0;
  let cacheMisses = 0;
  const nodes = {};

  // 1. 增量解析或读取缓存
  for (const filePath of scannedFiles) {
    const relPath = path.relative(dir, filePath).replace(/\\/g, '/');
    const ext = path.extname(filePath).toLowerCase();

    let stat;
    try {
      stat = fs.statSync(filePath);
    } catch (_) {
      continue;
    }

    const cachedEntry = cache.files?.[relPath];
    if (cachedEntry && cachedEntry.mtimeMs === stat.mtimeMs && cachedEntry.size === stat.size) {
      nodes[relPath] = cachedEntry;
      cacheHits++;
    } else {
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const parsed = parseCodeFile(content, ext, relPath);
        const entry = {
          mtimeMs: stat.mtimeMs,
          size: stat.size,
          ext,
          exports: parsed.exports,
          imports: parsed.imports,
          inherits: parsed.inherits,
          symbols: parsed.symbols,
          skeleton: parsed.skeleton,
          lines: content.split('\n').length
        };
        nodes[relPath] = entry;
        cache.files[relPath] = entry;
        cacheMisses++;
      } catch (_) {
        // 容错跳过不可读文件
      }
    }
  }

  // 2. 清理已在磁盘被删除的旧缓存条目
  if (cache.files) {
    for (const cachedPath of Object.keys(cache.files)) {
      if (!nodes[cachedPath]) {
        delete cache.files[cachedPath];
      }
    }
  }

  // 3. 持久化增量缓存
  if (!options.skipCache) {
    saveMapCache(cachePath, cache);
  }

  // 4. 构建全库双向依赖图谱 (Topology Graph)
  const graph = buildCodebaseGraph(nodes, dir);

  // 5. 组合结构化数据与统计
  const totalFiles = Object.keys(nodes).length;
  const totalSymbols = Object.values(nodes).reduce((acc, n) => acc + (n.symbols?.length || 0), 0);
  const totalEdges = Object.values(graph).reduce((acc, n) => acc + (n.dependencies?.length || 0), 0);

  const stats = {
    totalFiles,
    totalSymbols,
    totalEdges,
    cacheHits,
    cacheMisses,
    generatedAt: new Date().toISOString()
  };

  // 6. 持久化结构化索引 .sansheng/codebase_index.json
  const indexData = { stats, nodes: graph };
  const indexPath = path.join(dir, INDEX_FILE_REL);
  try {
    ensureDir(path.dirname(indexPath));
    fs.writeFileSync(indexPath, JSON.stringify(indexData, null, 2), 'utf-8');
  } catch (_) {}

  // 7. 渲染生成两级 Markdown 拓扑地图
  return renderFullMarkdownMap(graph, stats, options);
}

/**
 * 构建全库双向引用拓扑图
 */
export function buildCodebaseGraph(nodes, baseDir) {
  const graph = {};

  // 初始化图节点
  for (const [relPath, node] of Object.entries(nodes)) {
    graph[relPath] = {
      ...node,
      dependencies: [],
      dependents: []
    };
  }

  // 符号倒排索引 (用于 C# 继承/接口实现匹配)
  const symbolToFile = new Map();
  for (const [relPath, node] of Object.entries(nodes)) {
    if (node.exports) {
      for (const exp of node.exports) {
        if (!symbolToFile.has(exp)) symbolToFile.set(exp, []);
        symbolToFile.get(exp).push(relPath);
      }
    }
  }

  // 计算依赖边
  for (const [relPath, node] of Object.entries(nodes)) {
    const currentDir = path.dirname(relPath);
    const deps = new Set();

    // 解析 import 路径 (TS / JS / Vue)
    if (node.imports) {
      for (const rawImport of node.imports) {
        if (rawImport.startsWith('.')) {
          // 相对路径解析
          const resolved = resolveRelativePath(currentDir, rawImport, nodes);
          if (resolved && resolved !== relPath) {
            deps.add(resolved);
          }
        }
      }
    }

    // 解析继承与接口实现 (C# / TS)
    if (node.inherits) {
      for (const iname of node.inherits) {
        const targetFiles = symbolToFile.get(iname);
        if (targetFiles) {
          for (const tf of targetFiles) {
            if (tf !== relPath) deps.add(tf);
          }
        }
      }
    }

    graph[relPath].dependencies = Array.from(deps);
  }

  // 计算反向依赖边 (dependents)
  for (const [relPath, node] of Object.entries(graph)) {
    for (const dep of node.dependencies) {
      if (graph[dep] && !graph[dep].dependents.includes(relPath)) {
        graph[dep].dependents.push(relPath);
      }
    }
  }

  return graph;
}

/**
 * 局部焦点切片与预算控制查询 (JIT Slice)
 * 供中书省/门下省/六部按需索取高相关上下文
 */
export function queryFocusedMap(dir = process.cwd(), focusPath = '', options = {}) {
  const normFocus = focusPath.replace(/\\/g, '/').replace(/^\.\//, '');
  const maxTokens = options.budget || 2000;
  const maxCharBudget = maxTokens * 4; // 经验估算：1 Token ≈ 4 字符

  const indexPath = path.join(dir, INDEX_FILE_REL);
  let graph = null;

  if (fs.existsSync(indexPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
      graph = parsed.nodes;
    } catch (_) {}
  }

  if (!graph) {
    // 尚未生成索引，即时构建
    extractCodebaseMap(dir, 4);
    try {
      graph = JSON.parse(fs.readFileSync(indexPath, 'utf-8')).nodes;
    } catch (_) {
      return `⚠️ 无法构建代码库索引图谱。`;
    }
  }

  // 模糊匹配最相近的节点
  let matchedKey = Object.keys(graph).find(k => k === normFocus || k.endsWith('/' + normFocus) || normFocus.endsWith('/' + k));
  if (!matchedKey) {
    matchedKey = Object.keys(graph).find(k => k.toLowerCase().includes(normFocus.toLowerCase()));
  }

  if (!matchedKey) {
    return `⚠️ 未在代码库中检索到与 \`${focusPath}\` 匹配的文件。\n当前可查文件总数: ${Object.keys(graph).length}`;
  }

  const focusNode = graph[matchedKey];
  const upstream = focusNode.dependents || [];
  const downstream = focusNode.dependencies || [];

  let sliceMd = `# 🎯 聚焦代码拓扑切片 (Focused Codebase Slice)\n`;
  sliceMd += `> 聚焦目标: \`${matchedKey}\` | 上游调用方: ${upstream.length} | 下游依赖项: ${downstream.length}\n\n`;

  // 1. 核心目标文件完整骨架 (最高优先级)
  sliceMd += `## 🌟 核心目标骨架: \`${matchedKey}\`\n`;
  if (focusNode.skeleton) {
    sliceMd += `${focusNode.skeleton}\n\n`;
  }

  // 1.5 AI 改前自动注入目标文件业务背景与特殊逻辑红线 (无记录时 0 Token 增量，受硬预算护栏保护)
  const bizIndex = options.includeBiz === false ? null : loadBizIndex(dir);
  if (options.includeBiz !== false) {
    const bizBrief = getFileBizBrief(dir, matchedKey, {
      index: bizIndex,
      ...(options.bizBudgetTokens ? { maxTokens: options.bizBudgetTokens } : {}),
    });
    if (bizBrief) {
      sliceMd += `${bizBrief}\n\n`;
    }
  }

  let remainingChars = maxCharBudget - sliceMd.length;

  // 2. 下游依赖契约 (直接被它调用的服务/工具，仅附 ~5 Token 业务雷区微徽章)
  if (downstream.length > 0 && remainingChars > 300) {
    sliceMd += `## ⬇️ 下游依赖契约 (Dependencies)\n`;
    for (const dep of downstream) {
      const depNode = graph[dep];
      if (!depNode) continue;
      const badge = options.includeBiz === false ? '' : getFileBizBadge(dir, dep, { index: bizIndex });
      const compactSkel = depNode.skeleton || `* \`${dep}\` (导出: ${depNode.exports?.join(', ') || '内部实现'})`;
      const block = `### 📄 \`${dep}\` (依赖项)${badge}\n${compactSkel}\n\n`;
      if (block.length < remainingChars) {
        sliceMd += block;
        remainingChars -= block.length;
      } else {
        sliceMd += `* \`${dep}\`${badge} (导出: ${depNode.exports?.join(', ') || '无导出'})\n`;
      }
    }
  }

  // 3. 上游调用方 (谁在调用/使用它，仅附 ~5 Token 业务微徽章)
  if (upstream.length > 0 && remainingChars > 200) {
    sliceMd += `\n## ⬆️ 上游调用方 (Dependents)\n`;
    for (const up of upstream) {
      const badge = options.includeBiz === false ? '' : getFileBizBadge(dir, up, { index: bizIndex });
      sliceMd += `* \`${up}\`${badge} (关系: 依赖当前目标文件)\n`;
    }
  }

  return sliceMd;
}

/**
 * 解析单文件提取符号、导入依赖、继承实现与骨架
 */
export function parseCodeFile(content, ext, relPath) {
  const lines = content.split('\n');
  const skeletonLines = [];
  const exports = [];
  const imports = [];
  const inherits = [];
  const symbols = [];

  if (ext === '.cs') {
    // 解析 C#
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || line.startsWith('//') || line.startsWith('/*')) continue;

      // using 依赖
      const usingMatch = line.match(/^using\s+([\w\.]+);/);
      if (usingMatch) {
        imports.push(usingMatch[1]);
        continue;
      }

      // namespace
      if (/^namespace\s+[\w\.]+/.test(line)) {
        skeletonLines.push(`${line} // L${i + 1}`);
        continue;
      }

      // 类 / 接口 / Record 声明与继承
      const typeMatch = line.match(/^(public|private|protected|internal)?\s*(static|async|abstract|virtual|override|sealed|partial)?\s*(class|interface|record|enum|struct)\s+(\w+)(<[^>]+>)?(\s*:\s*([^{]+))?/);
      if (typeMatch) {
        const typeName = typeMatch[4];
        symbols.push(typeName);
        exports.push(typeName);

        if (typeMatch[7]) {
          const rawInherits = typeMatch[7].split(',').map(s => s.trim().replace(/<.*>$/, '')).filter(Boolean);
          inherits.push(...rawInherits);
        }
        skeletonLines.push(`${lines[i]} // L${i + 1}`);
        continue;
      }

      // 属性 (public string Name { get; set; })
      const propMatch = line.match(/^(public|protected|internal)\s+[A-Za-z0-9_<>,\[\]\?\s]+\s+(\w+)\s*\{\s*(get|set|init)/);
      if (propMatch) {
        symbols.push(propMatch[2]);
        skeletonLines.push(`  ${line} // L${i + 1}`);
        continue;
      }

      // 方法签名 (含跨行扫描支持)
      if (/^(public|protected|internal)\s+(static\s+|async\s+|virtual\s+|override\s+|abstract\s+)*[A-Za-z0-9_<>,\[\]\?\s]+\s+(\w+)\s*\(/.test(line) && !line.includes('=')) {
        const methodMatch = line.match(/\s+(\w+)\s*\(/);
        if (methodMatch) symbols.push(methodMatch[1]);

        let fullSig = line;
        let startLine = i + 1;
        while (!fullSig.includes(')') && !fullSig.includes(';') && !fullSig.includes('{') && i + 1 < lines.length) {
          i++;
          fullSig += ' ' + lines[i].trim();
        }
        const cleanSig = fullSig.replace(/\s*\{.*$/, '').replace(/;.*$/, '');
        skeletonLines.push(`  ${cleanSig}; // L${startLine}`);
      }
    }
  } else if (ext === '.vue') {
    // 解析 Vue 3 SFC
    let inScript = false;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('<script')) inScript = true;
      if (line.startsWith('</script>')) inScript = false;

      if (inScript) {
        // import
        const impMatch = line.match(/^import\s+.*?\s+from\s+['"]([^'"]+)['"]/);
        if (impMatch) {
          imports.push(impMatch[1]);
          continue;
        }

        if (line.includes('defineProps') || line.includes('defineEmits') || line.includes('defineExpose') || line.includes('defineSlots')) {
          skeletonLines.push(`  ${line} // L${i + 1}`);
        } else if (/^(export\s+)?(async\s+)?function\s+(\w+)|const\s+(\w+)\s*=\s*\(.*\)\s*=>/.test(line)) {
          const fnMatch = line.match(/function\s+(\w+)|const\s+(\w+)\s*=/);
          const fnName = fnMatch ? (fnMatch[1] || fnMatch[2]) : null;
          if (fnName) {
            symbols.push(fnName);
            exports.push(fnName);
          }
          skeletonLines.push(`  ${line} // L${i + 1}`);
        }
      }
    }
  } else {
    // TS / JS / TSX / JSX
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || line.startsWith('//') || line.startsWith('/*')) continue;

      // import
      const impMatch = line.match(/^import\s+.*?\s+from\s+['"]([^'"]+)['"]/);
      if (impMatch) {
        imports.push(impMatch[1]);
        continue;
      }

      // export (class|interface|type|enum|function|const)
      const expMatch = line.match(/^export\s+(default\s+)?(class|interface|type|enum|function|const|let)\s+(\w+)/);
      if (expMatch) {
        const sym = expMatch[3];
        symbols.push(sym);
        exports.push(sym);
        skeletonLines.push(`${line} // L${i + 1}`);
        continue;
      }

      // 捕获未导出的重要 class
      const classMatch = line.match(/^(class|interface)\s+(\w+)(\s+extends\s+(\w+))?(\s+implements\s+([^{]+))?/);
      if (classMatch) {
        const clsName = classMatch[2];
        symbols.push(clsName);
        if (classMatch[4]) inherits.push(classMatch[4]);
        if (classMatch[6]) {
          inherits.push(...classMatch[6].split(',').map(s => s.trim()).filter(Boolean));
        }
        skeletonLines.push(`${line} // L${i + 1}`);
      }
    }
  }

  let skeleton = null;
  if (skeletonLines.length > 0) {
    skeleton = `### 📄 \`${relPath}\`\n\`\`\`${ext.slice(1)}\n${skeletonLines.join('\n')}\n\`\`\``;
  }

  return { exports, imports, inherits, symbols, skeleton };
}

/**
 * 兼容旧接口的 extractFileSkeleton
 */
export function extractFileSkeleton(content, ext, relPath) {
  const res = parseCodeFile(content, ext, relPath);
  return res.skeleton;
}

/**
 * 清除地图缓存
 */
export function clearMapCache(dir = process.cwd()) {
  const cachePath = path.join(dir, CACHE_FILE_REL);
  if (fs.existsSync(cachePath)) {
    try {
      fs.unlinkSync(cachePath);
      return true;
    } catch (_) {}
  }
  return false;
}

// ================== 辅助函数 ==================

function renderFullMarkdownMap(graph, stats, options = {}) {
  const isFull = options.full === true;
  const entries = Object.entries(graph);

  // 按被依赖数量及符号重要性排序
  const sorted = [...entries].sort((a, b) => {
    const depDiff = (b[1].dependents?.length || 0) - (a[1].dependents?.length || 0);
    if (depDiff !== 0) return depDiff;
    return (b[1].exports?.length || 0) - (a[1].exports?.length || 0);
  });

  const hubs = sorted.filter(([_, n]) => (n.dependents?.length || 0) > 0).slice(0, 10);

  let md = `# 🗺️ 代码库符号拓扑地图 (Codebase Skeleton Map)\n`;
  md += `> 自动提取自项目源码 (Token 压缩率 > 95%，含双向拓扑引用与增量指纹缓存)\n\n`;

  md += `## 📊 架构拓扑概览\n`;
  md += `* 📁 **扫描文件**: ${stats.totalFiles} | **提取符号**: ${stats.totalSymbols} | **拓扑依赖关系**: ${stats.totalEdges} 条\n`;
  md += `* ⚡ **增量缓存**: 命中 ${stats.cacheHits} / 新解析 ${stats.cacheMisses} (性能加速比: ${stats.totalFiles > 0 ? ((stats.cacheHits / stats.totalFiles) * 100).toFixed(1) : 0}%)\n`;

  if (hubs.length > 0) {
    md += `* 🏛️ **核心拓扑枢纽 (Top Hubs)**:\n`;
    for (const [f, n] of hubs.slice(0, 5)) {
      md += `  - \`${f}\` (被 ${n.dependents.length} 个模块依赖引用)\n`;
    }
  }

  // 如果显式指定了 --full 或文件总数本来就很少 (<= 15 个)，输出全量展开
  if (isFull || stats.totalFiles <= 15) {
    md += `\n---\n\n## 📦 模块分层与代码骨架 (全量)\n\n`;
    const skeletons = [];
    for (const [relPath, node] of entries) {
      if (node.skeleton) {
        let block = node.skeleton;
        const meta = [];
        if (node.dependencies?.length > 0) meta.push(`依赖: ${node.dependencies.join(', ')}`);
        if (node.dependents?.length > 0) meta.push(`被依赖: ${node.dependents.join(', ')}`);
        if (meta.length > 0) {
          block = `> 🔗 [拓扑] ${meta.join(' | ')}\n` + block;
        }
        skeletons.push(block);
      }
    }
    md += skeletons.join('\n\n');
    return md;
  }

  // 默认启用：Top-K 枢纽详细展开 + 其余分层聚合折叠 (永远控制在 ≤ 180 行)
  md += `\n---\n\n## 🌟 核心枢纽架构骨架 (Top Hubs)\n> 包含核心基类、关键接口与高频依赖中枢；微观文件细节请用 \`sansheng map --focus <file>\` 按需索取。\n\n`;

  const renderedHubPaths = new Set();
  const hubSkeletons = [];
  for (const [relPath, node] of hubs.slice(0, 8)) {
    if (node.skeleton) {
      renderedHubPaths.add(relPath);
      let block = node.skeleton;
      const meta = [];
      if (node.dependencies?.length > 0) meta.push(`依赖: ${node.dependencies.join(', ')}`);
      if (node.dependents?.length > 0) meta.push(`被依赖: ${node.dependents.slice(0, 3).join(', ')}${node.dependents.length > 3 ? ` 等 ${node.dependents.length} 个模块` : ''}`);
      if (meta.length > 0) {
        block = `> 🔗 [拓扑] ${meta.join(' | ')}\n` + block;
      }
      hubSkeletons.push(block);
    }
  }
  md += hubSkeletons.join('\n\n') + '\n\n';

  md += `---\n\n## 📂 模块分层目录与叶子清单 (Compact Catalog)\n`;

  // 按顶级目录分组
  const groups = new Map();
  let testFileCount = 0;

  for (const [relPath, node] of entries) {
    if (renderedHubPaths.has(relPath)) continue;

    const lower = relPath.toLowerCase();
    if (lower.includes('test') || lower.includes('spec') || lower.includes('.tests/')) {
      testFileCount++;
      continue;
    }

    const parts = relPath.split('/');
    const groupKey = parts.length > 1 ? parts[0] : 'Root';
    if (!groups.has(groupKey)) groups.set(groupKey, []);
    groups.get(groupKey).push({ relPath, node });
  }

  for (const [groupName, fileItems] of groups.entries()) {
    md += `\n### 📦 \`${groupName}\` (${fileItems.length} 个文件)\n`;
    const displayItems = fileItems.slice(0, 5);
    for (const item of displayItems) {
      const expStr = item.node.exports?.length > 0 ? ` (导出: ${item.node.exports.slice(0, 2).join(', ')}${item.node.exports.length > 2 ? '...' : ''})` : '';
      const inhStr = item.node.inherits?.length > 0 ? ` [继承: ${item.node.inherits.join(', ')}]` : '';
      md += `* \`${item.relPath}\`${expStr}${inhStr}\n`;
    }
    if (fileItems.length > 5) {
      md += `* *... 以及该目录下其余 ${fileItems.length - 5} 个文件 (运行 \`sansheng map --focus <file>\` 查看详情)*\n`;
    }
  }

  if (testFileCount > 0) {
    md += `\n### 🧪 测试套件 (Tests)\n* 共收敛 ${testFileCount} 个测试文件 (含单测、集成测试)，已自动折叠，不占用架构上下文。\n`;
  }

  md += `\n---\n> 💡 **按需索取提示**：全库索引结构已保存至 \`.sansheng/codebase_index.json\`。\n`;
  md += `> • 查看指定模块精准切片：\`sansheng map --focus <path/to/file>\` (~400 Token)\n`;
  md += `> • 查看全量平铺骨架地图：\`sansheng map --full\`\n`;

  return md;
}

function resolveRelativePath(currentDir, rawImport, nodes) {
  const candidateBase = path.normalize(path.join(currentDir, rawImport)).replace(/\\/g, '/');
  const possibleExts = ['', '.js', '.ts', '.vue', '.cs', '.tsx', '.jsx', '/index.js', '/index.ts'];

  for (const ext of possibleExts) {
    const full = candidateBase + ext;
    if (nodes[full]) return full;
  }
  return null;
}

function loadIgnorePatterns(dir) {
  const ignored = new Set(DEFAULT_IGNORED_DIRS);
  const gitignorePath = path.join(dir, '.gitignore');
  if (fs.existsSync(gitignorePath)) {
    try {
      const lines = fs.readFileSync(gitignorePath, 'utf-8').split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const clean = trimmed.replace(/^\//, '').replace(/\/$/, '');
          if (clean) ignored.add(clean);
        }
      }
    } catch (_) {}
  }
  return ignored;
}

function walkDir(currentDir, depth, maxDepth, ignored, callback) {
  if (depth > maxDepth) return;
  let entries = [];
  try {
    entries = fs.readdirSync(currentDir, { withFileTypes: true });
  } catch (_) {
    return;
  }

  for (const entry of entries) {
    if (ignored.has(entry.name)) continue;
    const fullPath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      walkDir(fullPath, depth + 1, maxDepth, ignored, callback);
    } else if (entry.isFile()) {
      callback(fullPath);
    }
  }
}

function loadMapCache(cachePath) {
  if (fs.existsSync(cachePath)) {
    try {
      return JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
    } catch (_) {}
  }
  return { version: 2, files: {} };
}

function saveMapCache(cachePath, cache) {
  try {
    ensureDir(path.dirname(cachePath));
    fs.writeFileSync(cachePath, JSON.stringify(cache), 'utf-8');
  } catch (_) {}
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}
