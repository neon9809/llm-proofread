/**
 * 文本段落切分：按换行符切分为段落，保留段落顺序。
 * 空行被忽略，每段保留原始文本。
 */
export interface Paragraph {
  index: number;
  text: string;
}

export function splitParagraphs(text: string): Paragraph[] {
  if (!text) return [];
  return text
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .map((line, index) => ({ index, text: line }));
}
