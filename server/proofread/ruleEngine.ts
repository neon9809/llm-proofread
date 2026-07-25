/**
 * 规则引擎：违禁词检测 + 不规范表述替换建议。
 * 对每个段落扫描，返回命中位置与建议。
 */
export interface RuleHit {
  type: "forbidden" | "replace";
  /** 命中的词或模式 */
  word: string;
  /** 替换建议（仅 replace 类型） */
  replacement?: string;
  /** 说明 */
  note?: string;
  /** 在段落中的起止位置 [start, end)，可能多处命中 */
  positions: Array<[number, number]>;
}

export interface ForbiddenWordItem {
  word: string;
  category?: string | null;
}

export interface ReplaceRuleItem {
  pattern: string;
  replacement: string;
  note?: string | null;
}

/** 查找 needle 在 haystack 中所有出现位置 */
function findAll(haystack: string, needle: string): Array<[number, number]> {
  const positions: Array<[number, number]> = [];
  if (!needle) return positions;
  let idx = haystack.indexOf(needle);
  while (idx !== -1) {
    positions.push([idx, idx + needle.length]);
    idx = haystack.indexOf(needle, idx + needle.length);
  }
  return positions;
}

export function checkParagraph(
  text: string,
  forbiddenWords: ForbiddenWordItem[],
  replaceRules: ReplaceRuleItem[],
): RuleHit[] {
  const hits: RuleHit[] = [];

  for (const fw of forbiddenWords) {
    const positions = findAll(text, fw.word);
    if (positions.length > 0) {
      hits.push({ type: "forbidden", word: fw.word, positions });
    }
  }

  for (const rule of replaceRules) {
    const positions = findAll(text, rule.pattern);
    if (positions.length > 0) {
      hits.push({
        type: "replace",
        word: rule.pattern,
        replacement: rule.replacement,
        note: rule.note ?? undefined,
        positions,
      });
    }
  }

  return hits;
}

/** 应用所有替换规则，返回替换后的文本（用于"接受规则建议"）*/
export function applyReplaceRules(text: string, replaceRules: ReplaceRuleItem[]): string {
  let result = text;
  for (const rule of replaceRules) {
    result = result.split(rule.pattern).join(rule.replacement);
  }
  return result;
}
