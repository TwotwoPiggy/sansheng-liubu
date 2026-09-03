import fs from 'fs';
import path from 'path';

const DEFAULT_IGNORED_DIRS = ['node_modules', 'bin', 'obj', '.git', 'dist', 'build', '.tasks', '.sansheng', '.system_generated', '.vscode', '.idea'];

/**
 * 递归扫描并提取工作区 C# / Vue3 / TS / JS 代码符号骨架 (SPEC §8)
 */
export function extractCodebaseMap(dir = process.cwd(), maxDepth = 4) {
  const ignored = loadIgnorePatterns(dir);
  const skeletons = [];

  walkDir(dir, 0, maxDepth, ignored, (filePath) => {
    const ext = path.extname(filePath).toLowerCase();
    if (['.cs', '.vue', '.ts', '.js', '.tsx', '.jsx'].includes(ext)) {
      const relPath = path.relative(dir, filePath);
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const skeleton = extractFileSkeleton(content, ext, relPath);
        if (skeleton) {
          skeletons.push(skeleton);
        }
      } catch (_) {}
    }
  });

  return `# 🗺️ 代码库符号拓扑地图 (Codebase Skeleton Map)\n> 自动提取自项目源码 (只含类/方法签名与Props，剔除实现细节，Token压缩率>95%)\n\n` + skeletons.join('\n\n');
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

export function extractFileSkeleton(content, ext, relPath) {
  const lines = content.split('\n');
  const extracted = [];

  if (ext === '.cs') {
    // 提取 C# 命名空间、类、接口、Record、属性与跨行方法签名
    for (let i = 0; i < lines.length; i++) {
      let line = lines[i].trim();
      if (!line || line.startsWith('//') || line.startsWith('/*')) continue;

      if (/^(namespace)\s+[\w\.]+/.test(line)) {
        extracted.push(`${line} // L${i + 1}`);
      } else if (/^(public|private|protected|internal)?\s*(static|async|abstract|virtual|override|sealed|partial)?\s*(class|interface|record|enum|struct)\s+\w+/.test(line)) {
        extracted.push(`${lines[i]} // L${i + 1}`);
      } else if (/^(public|protected|internal)\s+[A-Za-z0-9_<>,\[\]\?\s]+\s+\w+\s*\{\s*(get|set|init)/.test(line)) {
        // C# 属性 (e.g., public string Name { get; set; })
        extracted.push(`  ${line} // L${i + 1}`);
      } else if (/^(public|protected|internal)\s+(static\s+|async\s+|virtual\s+|override\s+|abstract\s+)*[A-Za-z0-9_<>,\[\]\?\s]+\s+\w+\s*\(/.test(line) && !line.includes('=')) {
        // C# 方法签名 (包含跨行参数扫描支持)
        let fullSig = line;
        let startLine = i + 1;
        while (!fullSig.includes(')') && !fullSig.includes(';') && !fullSig.includes('{') && i + 1 < lines.length) {
          i++;
          fullSig += ' ' + lines[i].trim();
        }
        const cleanSig = fullSig.replace(/\s*\{.*$/, '').replace(/;.*$/, '');
        extracted.push(`  ${cleanSig}; // L${startLine}`);
      }
    }
  } else if (ext === '.vue') {
    // 提取 Vue 3 <script setup> 中的 defineProps, defineEmits, 导出的函数
    let inScript = false;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('<script')) inScript = true;
      if (line.startsWith('</script>')) inScript = false;
      if (inScript) {
        if (line.includes('defineProps') || line.includes('defineEmits') || line.includes('defineExpose') || line.includes('defineSlots')) {
          extracted.push(`  ${line} // L${i + 1}`);
        } else if (/^(export\s+)?(async\s+)?function\s+\w+|const\s+\w+\s*=\s*\(.*\)\s*=>/.test(line)) {
          extracted.push(`  ${line} // L${i + 1}`);
        }
      }
    }
  } else {
    // TS / JS / TSX / JSX
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || line.startsWith('//')) continue;
      if (/^(export\s+)?(default\s+)?(class|interface|type|enum)\s+\w+/.test(line) || /^(export\s+)?(async\s+)?function\s+\w+/.test(line) || /^export\s+(const|let)\s+\w+\s*=\s*(\(.*\)|async\s*\(.*\))\s*=>/.test(line)) {
        extracted.push(`${line} // L${i + 1}`);
      }
    }
  }

  if (extracted.length === 0) return null;
  return `### 📄 \`${relPath}\`\n\`\`\`${ext.slice(1)}\n${extracted.join('\n')}\n\`\`\``;
}
