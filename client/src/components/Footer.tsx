import { trpc } from "@/lib/trpc";
import { type ReactNode } from "react";

/**
 * 解析备案文本中的 [text](url) markdown 链接，返回 React 节点数组。
 * 仅支持 http/https 链接（防 javascript: 等 XSS），其余按纯文本渲染。
 * 换行符由 footer 的 whitespace-pre-line 样式保留。
 */
const LINK_RE = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;

function renderBeianMarkdown(text: string, baseKey: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let i = 0;
  while ((match = LINK_RE.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    const [, label, url] = match;
    nodes.push(
      <a
        key={`${baseKey}-l${i++}`}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="underline hover:text-foreground transition-colors"
      >
        {label}
      </a>
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }
  return nodes;
}

const DEFAULT_FOOTER = "GitHub开源项目 [文语校对](https://github.com/neon9809/llm-proofread)";

/**
 * 统一 footer 组件，在登录页、工作区、iframe 嵌入页共用。
 *
 * 显示逻辑基于 FOOTER_BEIAN 环境变量（通过 publicSettings 接口下发）：
 * - "disable"：不显示任何内容
 * - 空字符串：显示默认（GitHub 开源项目）
 * - 其他文本：按 markdown 链接解析后显示
 */
export function Footer() {
  const { data: publicSettings } = trpc.localAuth.publicSettings.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
  });
  const footerBeian = publicSettings?.footerBeian ?? "";

  // "disable" 显式关闭：不显示任何内容
  if (footerBeian === "disable") return null;

  // 空字符串：显示默认 footer（GitHub 开源项目）
  // 其他：按 markdown 解析用户配置的文本
  const content = footerBeian || DEFAULT_FOOTER;

  return (
    <footer className="mt-8 text-center text-[11px] text-muted-foreground/80 leading-relaxed max-w-md mx-auto whitespace-pre-line">
      {renderBeianMarkdown(content, "footer")}
    </footer>
  );
}
