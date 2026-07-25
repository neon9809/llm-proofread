import { diffChars } from "diff";
import { useMemo } from "react";

export interface RuleHitView {
  type: "forbidden" | "replace";
  word: string;
  replacement?: string | null;
  positions: Array<[number, number]>;
}

/**
 * 段落级 Inline Diff：
 * - 绿色高亮新增内容，红色删除线标注删除内容（原文 vs 校对结果字符级 diff）
 * - 违禁词标红（mark-forbidden）
 * - 替换规则命中高亮（mark-replace）
 */
export function InlineDiff({
  original,
  corrected,
  ruleHits = [],
}: {
  original: string;
  corrected: string;
  ruleHits?: RuleHitView[];
}) {
  const parts = useMemo(() => diffChars(original, corrected), [original, corrected]);

  // 找出原文中违禁词/规则命中的字符区间
  const marks = useMemo(() => {
    const arr = new Array<"forbidden" | "replace" | null>(original.length).fill(null);
    for (const hit of ruleHits) {
      for (const [start, end] of hit.positions) {
        for (let i = start; i < end && i < original.length; i++) {
          // 违禁词优先级更高
          if (arr[i] !== "forbidden") arr[i] = hit.type;
        }
      }
    }
    return arr;
  }, [original, ruleHits]);

  // 渲染：跟踪原文位置，为未变更/删除的字符叠加违禁词标注
  let origPos = 0;
  const nodes: React.ReactNode[] = [];

  parts.forEach((part, pi) => {
    if (part.added) {
      nodes.push(
        <ins key={pi} className="diff-add">
          {part.value}
        </ins>,
      );
      return;
    }

    // unchanged 或 removed 都对应原文字符，需要按标注切段
    const start = origPos;
    origPos += part.value.length;

    let segStart = 0;
    let segMark = marks[start] ?? null;
    const segments: Array<{ text: string; mark: "forbidden" | "replace" | null }> = [];
    for (let i = 1; i <= part.value.length; i++) {
      const m = i < part.value.length ? (marks[start + i] ?? null) : undefined;
      if (i === part.value.length || m !== segMark) {
        segments.push({ text: part.value.slice(segStart, i), mark: segMark });
        segStart = i;
        if (m !== undefined) segMark = m;
      }
    }

    segments.forEach((seg, si) => {
      const key = `${pi}-${si}`;
      const markClass =
        seg.mark === "forbidden" ? "mark-forbidden" : seg.mark === "replace" ? "mark-replace" : "";
      if (part.removed) {
        nodes.push(
          <del key={key} className={`diff-del ${markClass}`}>
            {seg.text}
          </del>,
        );
      } else if (markClass) {
        nodes.push(
          <mark key={key} className={markClass}>
            {seg.text}
          </mark>,
        );
      } else {
        nodes.push(<span key={key}>{seg.text}</span>);
      }
    });
  });

  return <p className="leading-7 text-[15px] whitespace-pre-wrap break-words">{nodes}</p>;
}
