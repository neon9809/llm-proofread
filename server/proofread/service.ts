/**
 * 校对服务：整合段落切分、规则引擎与 LLM 双重审核，合并结果。
 */
import { listForbiddenWords, listReplaceRules, getDefaultLlmConfig, getLlmConfigById, getSetting } from "../db";
import { splitParagraphs } from "./splitter";
import { checkParagraph, applyReplaceRules, type RuleHit } from "./ruleEngine";
import { proofreadParagraphWithLlm, type LlmProofreadConfig } from "./llmEngine";

export interface ParagraphResult {
  index: number;
  original: string;
  /** 合并后的建议文本（先应用替换规则，再采用 LLM 修改） */
  corrected: string;
  /** LLM 修改说明 */
  llmReason: string;
  /** 规则引擎命中明细 */
  ruleHits: RuleHit[];
  /** 是否有任何修改建议 */
  changed: boolean;
  /** LLM 是否调用失败 */
  llmError?: string;
}

export interface ProofreadOptions {
  useLlm?: boolean;
  useRules?: boolean;
  llmConfigId?: number;
  /** 是否启用固定表述参考库（追加到 LLM system prompt） */
  useFixedExpressions?: boolean;
  /** 并发调用 LLM 的段落数 */
  concurrency?: number;
}

export interface ProofreadResult {
  paragraphs: ParagraphResult[];
  /** 使用的 LLM 配置名称（若启用） */
  llmConfigName?: string;
}

export async function proofreadText(text: string, options: ProofreadOptions = {}): Promise<ProofreadResult> {
  const { useLlm = true, useRules = true, llmConfigId, useFixedExpressions = false } = options;

  const paragraphs = splitParagraphs(text);
  const [forbidden, rules] = useRules
    ? await Promise.all([listForbiddenWords(), listReplaceRules()])
    : [[], []];

  let llmConfig: LlmProofreadConfig | undefined;
  let llmConfigName: string | undefined;
  if (useLlm) {
    const cfg = llmConfigId ? await getLlmConfigById(llmConfigId) : await getDefaultLlmConfig();
    if (cfg) {
      llmConfig = cfg;
      llmConfigName = cfg.name;
      // 启用固定表述时，从设置表加载文本追加到 LLM 配置的 prompt
      if (useFixedExpressions) {
        const fixedExpressions = await getSetting("fixed_expressions");
        if (fixedExpressions) {
          llmConfig = { ...cfg, fixedExpressions };
        }
      }
    }
  }
  // 并发数优先用 LLM 配置里的值，其次 options 传入，默认 5
  const concurrency = options.concurrency ?? llmConfig?.concurrency ?? 5;

  const results: ParagraphResult[] = paragraphs.map(p => ({
    index: p.index,
    original: p.text,
    corrected: p.text,
    llmReason: "",
    ruleHits: [],
    changed: false,
  }));

  // 规则引擎（同步、快速）
  if (useRules) {
    for (const r of results) {
      r.ruleHits = checkParagraph(r.original, forbidden, rules);
    }
  }

  // LLM 校对（并发受限）
  if (llmConfig) {
    const queue = [...results];
    const workers = Array.from({ length: Math.max(1, concurrency) }, async () => {
      while (queue.length > 0) {
        const item = queue.shift();
        if (!item) break;
        try {
          const llmResult = await proofreadParagraphWithLlm(item.original, llmConfig!);
          item.corrected = llmResult.corrected;
          item.llmReason = llmResult.reason;
        } catch (err) {
          item.llmError = err instanceof Error ? err.message : String(err);
        }
      }
    });
    await Promise.all(workers);
  }

  // 合并：对 LLM 结果（或原文）再应用替换规则，确保规则建议不被遗漏
  for (const r of results) {
    if (useRules) {
      const replaceOnly = r.ruleHits.filter(h => h.type === "replace");
      if (replaceOnly.length > 0) {
        r.corrected = applyReplaceRules(
          r.corrected,
          replaceOnly.map(h => ({ pattern: h.word, replacement: h.replacement || h.word })),
        );
      }
    }
    r.changed = r.corrected !== r.original || r.ruleHits.length > 0;
  }

  return { paragraphs: results, llmConfigName };
}
