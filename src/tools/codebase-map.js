import fs from 'fs';
import path from 'path';

const IGNORED_DIRS = ['node_modules', 'bin', 'obj', '.git', 'dist', 'build', '.tasks', '.sansheng', '.system_generated'];

/**
 * 递归扫描并提取工作区 C# / Vue3 / TS / JS 代码符号骨架
 */
export function extractCodebaseMap(dir, maxDepth = 4) {
  const skeletons = [];
  walkDir(dir, 0, maxDepth, (filePath) => {
    const ext = path.extname(filePath).toLowerCase();
    if (['.cs', '.vue', '.ts', '.js'].includes(ext)) {
      const relPath = path.relative(dir, filePath);
      const content = fs.readFileSync(filePath, 'utf-8');
      const skeleton = extractFileSkeleton(content, ext, relPath);
      if (skeleton) {
        skeletons.push(skeleton);
      }
    }
  });

  return `# 🗺️ 代码库符号拓扑地图 (Codebase Skeleton Map)\n> 自动提取自项目源码 (只含类/方法签名与Props，剔除实现细节，Token压缩率>95%)\n\n` + skeletons.join('\n\n');
}

function walkDir(currentDir, depth, maxDepth, callback) {
  if (depth > maxDepth) return;
  const entries = fs.readdirSync(currentDir, { withFileTypes: true });
  for (const entry of entries) {
    if (IGNORED_DIRS.includes(entry.name)) continue;
    const fullPath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      walkDir(fullPath, depth + 1, maxDepth, callback);
    } else if (entry.isFile()) {
      callback(fullPath);
    }
  }
}

function extractFileSkeleton(content, ext, relPath) {
  const lines = content.split('\n');
  const extracted = [];

  if (ext === '.cs') {
    // 提取 C# 命名空间、类、接口、方法签名
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (/^(public|private|protected|internal)?\s*(static|async|abstract|virtual|override)?\s*(class|interface|record|enum)\s+\w+/.test(line)) {
        extracted.push(`${lines[i]} // L${i + 1}`);
      } else if (/^(public|protected|internal)\s+[A-Za-z0-9_<>,\[\]\?]+\s+\w+\s*\(.*\)/.test(line) && !line.includes(';')) {
        extracted.push(`  ${line}; // L${i + 1}`);
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
        if (line.includes('defineProps') || line.includes('defineEmits') || line.includes('defineExpose')) {
          extracted.push(`  ${line} // L${i + 1}`);
        } else if (/^(export\s+)?(async\s+)?function\s+\w+|const\s+\w+\s*=\s*\(.*\)\s*=>/.test(line)) {
          extracted.push(`  ${line} // L${i + 1}`);
        }
      }
    }
  } else {
    // TS / JS
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (/^(export\s+)?(class|interface|type)\s+\w+/.test(line) || /^(export\s+)?(async\s+)?function\s+\w+/.test(line)) {
        extracted.push(`${line} // L${i + 1}`);
      }
    }
  }

  if (extracted.length === 0) return null;
  return `### 📄 \`${relPath}\`\n\`\`\`${ext.slice(1)}\n${extracted.join('\n')}\n\`\`\``;
}
