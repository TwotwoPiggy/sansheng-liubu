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

  it('5. buildWorkerSliceContext 能够为工兵生成纯净的任务微切片并过滤无关需求', () => {
    const task = {
      id: 'Task 1.2',
      title: '实现手机号脱敏与空列表防御',
      boundReqs: ['REQ-02', 'REQ-03']
    };
    const reqs = [
      { id: 'REQ-01', title: '异步导出管道', acs: ['正常导出文件'] },
      { id: 'REQ-02', title: '手机号脱敏', acs: ['138****0000 掩码'] },
      { id: 'REQ-03', title: '空列表拦截', acs: ['按钮置灰禁用'] },
      { id: 'REQ-04', title: '邮件通知', acs: ['发送激活邮件'] }
    ];
    const rules = [
      { id: 'RULE-01', content: '敏感字段必须掩码' }
    ];

    const slice = shangshu.buildWorkerSliceContext(task, { reqs, rules });
    assert.ok(slice.includes('Task 1.2: 实现手机号脱敏与空列表防御'));
    assert.ok(slice.includes('REQ-02'));
    assert.ok(slice.includes('REQ-03'));
    // 无关需求 REQ-01 和 REQ-04 应该被过滤排除
    assert.ok(!slice.includes('REQ-01 异步导出管道'));
    assert.ok(!slice.includes('REQ-04 邮件通知'));
    assert.ok(slice.includes('RULE-01'));
    assert.ok(slice.includes('工兵特战执行守则'));
  });

  it('6. verifyTaskDiff 能够防范空修改与伪交付', () => {
    const emptyResult = shangshu.verifyTaskDiff({}, '');
    assert.strictEqual(emptyResult.passed, false);
    assert.ok(emptyResult.reason.includes('Git Diff 为空'));

    const validDiff = `
--- a/src/ExportService.cs
+++ b/src/ExportService.cs
@@ -10,3 +10,5 @@
+    if (list.Count == 0) return false;
+    var masked = MaskPhone(phone);
`;
    const validResult = shangshu.verifyTaskDiff({}, validDiff);
    assert.strictEqual(validResult.passed, true);
    assert.strictEqual(validResult.addedLineCount, 2);
  });
});
