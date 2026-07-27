import { AppShell } from "@/components/AppShell";
import { usePageTitle } from "@/hooks/usePageTitle";

const REQUEST_EXAMPLE = `curl -X POST https://your-domain/api/v1/proofread \\
  -H "Authorization: Bearer pk_xxxxxxxx" \\
  -H "Content-Type: application/json" \\
  -d '{
    "text": "今天天气很好，我们的的地去公园玩。",
    "use_llm": true,
    "use_rules": true
  }'`;

const RESPONSE_EXAMPLE = `{
  "original": "今天天气很好，我们的的地去公园玩。",
  "corrected": "今天天气很好，我们高兴地去公园玩。",
  "llm_config": "DeepSeek V3",
  "total_paragraphs": 1,
  "changed_count": 1,
  "paragraphs": [
    {
      "index": 0,
      "original": "今天天气很好，我们的的地去公园玩。",
      "corrected": "今天天气很好，我们高兴地去公园玩。",
      "changed": true,
      "llm_reason": "修正重复用词\\"的的\\"",
      "llm_error": null,
      "rule_hits": [
        {
          "type": "replace",
          "word": "的的地",
          "replacement": "地",
          "positions": [[7, 10]]
        }
      ]
    }
  ]
}`;

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="rounded-xl bg-secondary p-4 text-xs font-mono leading-5 overflow-x-auto whitespace-pre">
      {children}
    </pre>
  );
}

export default function ApiDocs() {
  usePageTitle("API 文档");
  return (
    <AppShell>
      <div className="max-w-3xl mx-auto animate-rise space-y-8">
        <div>
          <h1 className="text-[28px] font-semibold tracking-tight mb-1">API 文档</h1>
          <p className="text-sm text-muted-foreground">
            通过开放 API 将校对能力集成到您的系统，Token 由管理员在「API Token」页面生成
          </p>
        </div>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold tracking-tight">校对接口</h2>
          <div className="rounded-xl border border-border bg-card p-4 space-y-1">
            <p className="text-sm font-mono">
              <span className="inline-block rounded-md bg-primary text-primary-foreground text-[11px] font-semibold px-2 py-0.5 mr-2">POST</span>
              /api/v1/proofread
            </p>
            <p className="text-xs text-muted-foreground">
              认证方式：请求头 <code className="bg-secondary rounded px-1">Authorization: Bearer &lt;token&gt;</code> 或{" "}
              <code className="bg-secondary rounded px-1">x-api-token: &lt;token&gt;</code>
            </p>
          </div>

          <h3 className="text-sm font-semibold mt-4">请求参数</h3>
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-secondary/60">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">字段</th>
                  <th className="text-left px-4 py-2 font-medium">类型</th>
                  <th className="text-left px-4 py-2 font-medium">说明</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                <tr>
                  <td className="px-4 py-2 font-mono">text</td>
                  <td className="px-4 py-2">string</td>
                  <td className="px-4 py-2">必填，待校对文本（≤100000 字符），按换行切分段落</td>
                </tr>
                <tr>
                  <td className="px-4 py-2 font-mono">use_llm</td>
                  <td className="px-4 py-2">boolean</td>
                  <td className="px-4 py-2">可选，默认 true，是否启用大模型校对</td>
                </tr>
                <tr>
                  <td className="px-4 py-2 font-mono">use_rules</td>
                  <td className="px-4 py-2">boolean</td>
                  <td className="px-4 py-2">可选，默认 true，是否启用规则引擎（违禁词 + 替换规则）</td>
                </tr>
                <tr>
                  <td className="px-4 py-2 font-mono">llm_config_id</td>
                  <td className="px-4 py-2">number</td>
                  <td className="px-4 py-2">可选，指定 LLM 配置 ID，缺省使用默认配置</td>
                </tr>
              </tbody>
            </table>
          </div>

          <h3 className="text-sm font-semibold mt-4">请求示例</h3>
          <CodeBlock>{REQUEST_EXAMPLE}</CodeBlock>

          <h3 className="text-sm font-semibold mt-4">响应示例</h3>
          <p className="text-xs text-muted-foreground">
            返回原文（original）、修改后全文（corrected）以及具体修改段落明细（paragraphs）
          </p>
          <CodeBlock>{RESPONSE_EXAMPLE}</CodeBlock>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold tracking-tight">iframe 嵌入</h2>
          <p className="text-sm text-muted-foreground leading-6">
            使用 Token 可将校对工作区免登录嵌入到任意网页中：
          </p>
          <CodeBlock>{`<iframe
  src="https://your-domain/embed?token=pk_xxxxxxxx"
  width="100%"
  height="720"
  frameborder="0"
></iframe>`}</CodeBlock>
        </section>
      </div>
    </AppShell>
  );
}
