import { describe, it } from 'node:test';
import assert from 'node:assert';
import { Zhongshu } from '../src/index.js';

describe('中书省 (Zhongshu) 需求起草与参数防御性测试套件', () => {
  const zhongshu = new Zhongshu();

  it('1. formatQuestion 生成标准四要素锚定质询结构', () => {
    const question = zhongshu.formatQuestion({
      id: 1,
      title: '认证中间件技术选型',
      coordinate: 'Server/Program.cs#L45',
      quote: 'builder.Services.AddAuthentication()',
      dilemma: 'JWT Bearer vs Cookie 认证',
      options: [
        { text: '采用 JWT Bearer Token 无状态方案', recommended: true },
        { text: '采用 ASP.NET Core Cookie 会话方案', recommended: false }
      ]
    });

    assert.ok(question.includes('#### ❓ 问题 1：【认证中间件技术选型】'));
    assert.ok(question.includes('Server/Program.cs#L45'));
    assert.ok(question.includes('[选项 A (推荐)]'));
    assert.ok(question.includes('[选项 B]'));
  });

  it('2. formatQuestion 对空参数具有完备的防御性默认值', () => {
    const question = zhongshu.formatQuestion({});
    assert.ok(question.includes('#### ❓ 问题 1：【需求待确认项】'));
    assert.ok(question.includes('选项 A (推荐)'));
    assert.ok(question.includes('选项 B'));

    const questionNull = zhongshu.formatQuestion(null);
    assert.ok(questionNull.includes('#### ❓ 问题 1：【需求待确认项】'));
  });

  it('3. formatQuestion 支持超过 26 个选项时的字母标签防溢出', () => {
    const manyOptions = Array.from({ length: 30 }, (_, i) => ({
      text: `选项描述 ${i + 1}`,
      recommended: i === 0
    }));

    const question = zhongshu.formatQuestion({ id: 2, title: '多分支选型', options: manyOptions });
    assert.ok(question.includes('[选项 A (推荐)]'));
    assert.ok(question.includes('[选项 Z]'));
    assert.ok(question.includes('[选项 AA]'));
    assert.ok(question.includes('[选项 AD]'));
  });

  it('4. formatInvariants 提炼业务边界铁律清单', () => {
    const rules = [
      { title: '零明文存储', content: '密码与敏感秘钥严禁明文入库' },
      { title: '幂等写入', content: '支付与扣费接口必须提供唯一幂等键' }
    ];
    const output = zhongshu.formatInvariants(rules);
    assert.ok(output.includes('[RULE-01 零明文存储]'));
    assert.ok(output.includes('[RULE-02 幂等写入]'));
  });

  it('5. formatInvariants 对空规则列表具有安全兜底输出', () => {
    const output = zhongshu.formatInvariants([]);
    assert.ok(output.includes('核心业务边界与铁律'));
    assert.ok(output.includes('[RULE-01 基础铁律]'));
  });

  it('6. formatRequirements 能够将需求粉碎为规范挂载 AC 的离散清单', () => {
    const reqs = [
      {
        id: 'REQ-01',
        title: '订单异步导出',
        acs: ['勾选订单后点击导出生成 xlsx 文件', '空列表时导出按钮置灰禁用']
      },
      {
        id: 'REQ-02',
        title: '手机号脱敏',
        ac: '导出的 Excel 中手机号按 138****0000 掩码'
      }
    ];

    const output = zhongshu.formatRequirements(reqs);
    assert.ok(output.includes('[REQ-01 订单异步导出]'));
    assert.ok(output.includes('**AC-1**: 勾选订单后点击导出生成 xlsx 文件'));
    assert.ok(output.includes('**AC-2**: 空列表时导出按钮置灰禁用'));
    assert.ok(output.includes('[REQ-02 手机号脱敏]'));
    assert.ok(output.includes('**AC-1**: 导出的 Excel 中手机号按 138****0000 掩码'));
  });

  it('7. parseRequirementsFromMarkdown 能够从 Markdown 文本中精准提取离散 REQ 与 AC', () => {
    const markdown = `
### 📋 原子需求清单 (Atomic Requirements & AC)
- **[REQ-01 订单异步导出]**
  - **AC-1**: 正常流点击导出
  - **AC-2**: 异常拦截
- [REQ-02 手机号脱敏]
  - AC-1: 手机号掩码脱敏
`;

    const parsed = zhongshu.parseRequirementsFromMarkdown(markdown);
    assert.strictEqual(parsed.length, 2);
    assert.strictEqual(parsed[0].id, 'REQ-01');
    assert.strictEqual(parsed[0].title, '订单异步导出');
    assert.strictEqual(parsed[0].acs.length, 2);
    assert.strictEqual(parsed[1].id, 'REQ-02');
    assert.strictEqual(parsed[1].title, '手机号脱敏');
    assert.strictEqual(parsed[1].acs.length, 1);
  });
});
