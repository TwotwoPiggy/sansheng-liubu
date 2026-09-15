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

  /**
   * 生成标准原子需求清单规范模板 (SPEC §2, §9)
   * 必须包含 [REQ-xx] 离散编号，并强制挂载 Given-When-Then 形式的验收准则 (AC)
   */
  formatRequirements(reqs = []) {
    const safeReqs = Array.isArray(reqs) ? reqs : [];
    if (safeReqs.length === 0) {
      return `### 📋 原子需求清单 (Atomic Requirements & AC)\n- **[REQ-01 核心业务功能]**\n  - **AC-1 (正常流)**: 满足基础业务输入与预期输出\n  - **AC-2 (边界/异常流)**: 异常超限参数或边界场景下给出友好拦截与提示`;
    }

    const list = safeReqs.map((r, i) => {
      const id = r?.id || `REQ-${String(i + 1).padStart(2, '0')}`;
      const title = r?.title || (typeof r === 'string' ? r : `需求项 ${id}`);
      const acs = Array.isArray(r?.acs) && r.acs.length > 0
        ? r.acs
        : (r?.ac ? [r.ac] : ['正常流满足预期业务流转', '边界流及异常输入受到合规防御拦截']);
      
      const acList = acs.map((acText, acIdx) => `  - **AC-${acIdx + 1}**: ${acText}`).join('\n');
      return `- **[${id} ${title}]**\n${acList}`;
    }).join('\n');

    return `### 📋 原子需求清单 (Atomic Requirements & AC)\n${list}`;
  }

  /**
   * 从 Markdown 文本中提取解析结构化原子需求清单 (SPEC §9)
   */
  parseRequirementsFromMarkdown(markdown = '') {
    if (!markdown || typeof markdown !== 'string') return [];
    const lines = markdown.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    const reqs = [];
    let currentReq = null;

    for (const line of lines) {
      // 匹配行首或列表项中的 [REQ-xx] 标签，如 `- **[REQ-01 订单导出]**` 或 `* [REQ-02] ...`
      const match = line.match(/(?:^|\s*[-*]\s*(?:\*\*)?)\[?(REQ-\d+)\]?(?:\s+([^\]*]+))?/i);
      if (match) {
        if (currentReq) {
          reqs.push(currentReq);
        }
        currentReq = {
          id: match[1].toUpperCase(),
          title: (match[2] || '').trim() || match[1].toUpperCase(),
          acs: [],
          lines: [line]
        };
      } else if (currentReq) {
        // 匹配验收标准 AC-x，如 `- **AC-1 (正常流)**: ...`
        const acMatch = line.match(/[-*]\s*(?:\*\*)?AC-\d+.*?[：:](.*)/i);
        if (acMatch) {
          currentReq.acs.push(acMatch[1].trim());
        }
        currentReq.lines.push(line);
      }
    }

    if (currentReq) {
      reqs.push(currentReq);
    }

    return reqs;
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

