/**
 * 中书省 (Zhongshu) - 掌管起草与需求对齐 (ALIGN 阶段)
 * 职责: 需求原子化提取 [REQ-xx]、微引用锚定质询、提炼边界铁律 [RULE-xx]
 */

export class Zhongshu {
  /**
   * 生成四要素锚定质询结构 (SPEC §2)
   */
  formatQuestion(params = {}) {
    const {
      id = 1,
      title = '需求待确认项',
      coordinate = '未指定坐标',
      quote = '（无具体引用）',
      dilemma = '存在技术/业务选型分歧',
      options = []
    } = (params || {});

    const safeOptions = Array.isArray(options) ? options : [];
    const formattedOptions = safeOptions.length > 0
      ? safeOptions.map((opt, idx) => {
          const rawOpt = typeof opt === 'string' ? { text: opt } : (opt || {});
          const label = getOptionLabel(idx);
          const isRec = rawOpt.recommended ? ' (推荐)' : '';
          return `  - **[选项 ${label}${isRec}]** ${rawOpt.text || '未定义选项描述'}`;
        }).join('\n')
      : '  - **[选项 A (推荐)]** 采用默认标准方案\n  - **[选项 B]** 自定义扩展方案';

    return `#### ❓ 问题 ${id}：【${title}】
* **📍 需求坐标**：\`${coordinate}\`
* **📝 原文微引用**：“${quote}”
* **🔍 疑点/两难**：${dilemma}
* **💡 决策选项**：
${formattedOptions}`;
  }

  /**
   * 提炼边界铁律清单 (SPEC §2)
   */
  formatInvariants(rules = []) {
    const safeRules = Array.isArray(rules) ? rules : [];
    if (safeRules.length === 0) {
      return `### ⚠️ 核心业务边界与铁律 (Invariants & Rules)\n- **[RULE-01 基础铁律]**：系统所有外部输入必须进行严格校验与类型防御。`;
    }

    const list = safeRules.map((r, i) => {
      const title = r?.title || `铁律-${i + 1}`;
      const content = r?.content || r?.text || (typeof r === 'string' ? r : '未定义规则内容');
      return `- **[RULE-${String(i + 1).padStart(2, '0')} ${title}]**：${content}`;
    }).join('\n');

    return `### ⚠️ 核心业务边界与铁律 (Invariants & Rules)\n${list}`;
  }
}

/**
 * 计算选项字母编号（支持超出 26 个选项后的多字母如 A..Z, AA..AZ）
 */
function getOptionLabel(idx) {
  if (idx < 26) {
    return String.fromCharCode(65 + idx);
  }
  const first = String.fromCharCode(65 + Math.floor(idx / 26) - 1);
  const second = String.fromCharCode(65 + (idx % 26));
  return `${first}${second}`;
}

