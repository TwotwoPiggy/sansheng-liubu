import { describe, it } from 'node:test';
import assert from 'node:assert';
import { Shangshu } from '../src/index.js';

describe('尚书省 (Shangshu) 执行统领与滑动窗口语义感知测试套件', () => {
  const shangshu = new Shangshu();

  it('1. enforceSlidingWindow 在 150 行以内保持原始内容不变', () => {
    const shortContent = Array.from({ length: 50 }, (_, i) => `- [x] Task ${i + 1}`).join('\n');
    const result = shangshu.enforceSlidingWindow(shortContent);
    assert.strictEqual(result, shortContent);
  });

  it('2. enforceSlidingWindow 超过 150 行时安全折叠并在边界处截断', () => {
    const lines = [];
    lines.push('# 任务看板 (TASK.md)');
    for (let i = 1; i <= 100; i++) {
      lines.push(`- [x] [TASK-${String(i).padStart(2, '0')}] 已完成任务项 ${i}`);
    }
    lines.push('## Phase 2: 当前活跃阶段');
    for (let i = 101; i <= 200; i++) {
      lines.push(`- [ ] [TASK-${String(i).padStart(2, '0')}] 待执行任务项 ${i}`);
    }
    const longContent = lines.join('\n');
    const result = shangshu.enforceSlidingWindow(longContent, 150);

    const resultLines = result.split('\n');
    assert.ok(resultLines.length <= 155);
    assert.ok(result.includes('尚书省提示'));
    assert.ok(result.includes('.sansheng/archive/'));
  });

  it('3. enforceSlidingWindow 截断时自动闭合未闭合的代码块', () => {
    const lines = [];
    lines.push('## 接口定义示例');
    lines.push('```csharp');
    for (let i = 0; i < 160; i++) {
      lines.push(`public void Method${i}() { }`);
    }
    lines.push('```');

    const content = lines.join('\n');
    const result = shangshu.enforceSlidingWindow(content, 150);

    // 统计反引号闭合状态
    const codeBlockTags = result.split('\n').filter(l => l.trim().startsWith('```'));
    assert.strictEqual(codeBlockTags.length % 2, 0, '代码块反引号必须成对闭合');
  });

  it('4. cleanTemporaryFiles 能够安全清理临时文件而不报错', () => {
    assert.doesNotThrow(() => {
      shangshu.cleanTemporaryFiles();
    });
  });
});
