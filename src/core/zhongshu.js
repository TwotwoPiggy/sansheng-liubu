/**
 * 中书省 (Zhongshu) - 掌管起草与需求对齐 (ALIGN 阶段)
 * 职责: 需求原子化提取 [REQ-xx]、微引用锚定质询、提炼边界铁律 [RULE-xx]
 */

export class Zhongshu {
  /**
   * 生成四要素锚定质询结构
   */
  formatQuestion({ id, title, coordinate, quote, dilemma, options }) {
    const formattedOptions = options.map((opt, idx) => {
      const label = String.fromCharCode(65 + idx);
      const isRec = opt.recommended ? ' (推荐)' : '';
      return `  - **[选项 ${label}${isRec}]** ${opt.text}`;
    }).join('\n');

    return `#### ❓ 问题 ${id}：【${title}】
* **📍 需求坐标**：\`${coordinate}\`
* **📝 原文微引用**：“${quote}”
* **🔍 疑点/两难**：${dilemma}
* **💡 决策选项**：
${formattedOptions}`;
  }

  /**
   * 提炼边界铁律清单
   */
  formatInvariants(rules) {
    const list = rules.map((r, i) => `- **[RULE-${String(i+1).padStart(2, '0')} ${r.title}]**：${r.content}`).join('\n');
    return `### ⚠️ 核心业务边界与铁律 (Invariants & Rules)\n${list}`;
  }
}
