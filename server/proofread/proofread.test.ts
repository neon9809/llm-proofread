import { describe, expect, it } from "vitest";
import { splitParagraphs } from "./splitter";
import { checkParagraph, applyReplaceRules } from "./ruleEngine";
import { parseLlmJson, normalizeBaseUrl } from "./llmEngine";

describe("splitParagraphs", () => {
  it("splits text by newlines and filters empty lines", () => {
    const text = "第一段。\n\n第二段。\n   \n第三段。";
    const paras = splitParagraphs(text);
    expect(paras.map(p => p.text)).toEqual(["第一段。", "第二段。", "第三段。"]);
    expect(paras.map(p => p.index)).toEqual([0, 1, 2]);
  });

  it("returns empty array for blank input", () => {
    expect(splitParagraphs("")).toEqual([]);
    expect(splitParagraphs("   \n  \n")).toEqual([]);
  });

  it("keeps a single paragraph intact", () => {
    const paras = splitParagraphs("只有一段");
    expect(paras).toHaveLength(1);
    expect(paras[0]?.text).toBe("只有一段");
  });
});

describe("checkParagraph (rule engine)", () => {
  const forbidden = [{ word: "赌博" }, { word: "彩票" }];
  const rules = [{ pattern: "的的地", replacement: "地", note: null }];

  it("detects forbidden words with correct positions", () => {
    const hits = checkParagraph("这里禁止赌博。", forbidden, []);
    const fw = hits.filter(h => h.type === "forbidden");
    expect(fw).toHaveLength(1);
    expect(fw[0]?.word).toBe("赌博");
    expect(fw[0]?.positions[0]).toEqual([4, 6]);
  });

  it("detects multiple occurrences of the same forbidden word", () => {
    const hits = checkParagraph("赌博害人，远离赌博。", forbidden, []);
    const fw = hits.find(h => h.type === "forbidden" && h.word === "赌博");
    expect(fw?.positions).toHaveLength(2);
  });

  it("reports replace rule hits and applyReplaceRules produces corrected text", () => {
    const hits = checkParagraph("我们的的地走了。", [], rules);
    const rr = hits.find(h => h.type === "replace");
    expect(rr?.word).toBe("的的地");
    expect(rr?.replacement).toBe("地");
    expect(applyReplaceRules("我们的的地走了。", rules)).toBe("我们地走了。");
  });

  it("returns no hits for clean text", () => {
    const hits = checkParagraph("春天来了。", forbidden, rules);
    expect(hits).toHaveLength(0);
  });
});

describe("parseLlmJson", () => {
  it("parses plain JSON response", () => {
    const out = parseLlmJson('{"corrected":"文本","reason":"无误"}');
    expect(out?.corrected).toBe("文本");
  });

  it("parses JSON wrapped in markdown code fence", () => {
    const out = parseLlmJson('```json\n{"corrected":"改后","reason":"改错字"}\n```');
    expect(out?.corrected).toBe("改后");
    expect(out?.reason).toBe("改错字");
  });

  it("extracts JSON embedded in surrounding prose", () => {
    const out = parseLlmJson('好的，结果如下：{"corrected":"内容","reason":"ok"} 以上。');
    expect(out?.corrected).toBe("内容");
  });

  it("returns null for invalid payloads", () => {
    expect(parseLlmJson("完全不是 JSON")).toBeNull();
  });
});

describe("normalizeBaseUrl", () => {
  it("appends /v1 when missing", () => {
    expect(normalizeBaseUrl("https://api.openai.com")).toBe("https://api.openai.com/v1");
  });

  it("keeps existing version path", () => {
    expect(normalizeBaseUrl("https://api.deepseek.com/v1/")).toBe("https://api.deepseek.com/v1");
  });

  it("keeps compatible-mode path (dashscope)", () => {
    expect(normalizeBaseUrl("https://dashscope.aliyuncs.com/compatible-mode/v1")).toBe(
      "https://dashscope.aliyuncs.com/compatible-mode/v1"
    );
  });
});
