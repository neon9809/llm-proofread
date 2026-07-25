/**
 * LLM 校对引擎：调用 OpenAI 兼容接口（OpenAI / DeepSeek / 通义千问等）。
 * 用户可在配置中心自定义 Base URL、API Key、模型与 Prompt。
 */
export interface LlmProofreadConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  prompt?: string | null;
  temperature?: string | null;
  concurrency?: number;
}

export interface LlmParagraphResult {
  corrected: string;
  reason: string;
}

export const DEFAULT_PROOFREAD_PROMPT = `你是一名专业的中文文本校对员。请对用户提供的段落进行校对，修正其中的错别字、语法错误、标点符号错误和不规范表述。要求：
1. 只修正确有错误之处，不要改写句子风格，不要增删原意；
2. 若段落没有错误，corrected 字段原样返回；
3. 以 JSON 格式输出：{"corrected": "修改后的段落", "reason": "修改说明，无修改时为'无修改'"}。`;

/** 从 LLM 返回内容中提取 JSON（容忍 markdown 代码块包裹） */
export function parseLlmJson(content: string): LlmParagraphResult | null {
  if (!content) return null;
  let raw = content.trim();
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fence) raw = fence[1].trim();
  // 尝试直接解析；失败则截取第一个 { 到最后一个 }
  const tryParse = (s: string): LlmParagraphResult | null => {
    try {
      const obj = JSON.parse(s);
      if (typeof obj?.corrected === "string") {
        return { corrected: obj.corrected, reason: typeof obj.reason === "string" ? obj.reason : "" };
      }
    } catch {
      /* noop */
    }
    return null;
  };
  const direct = tryParse(raw);
  if (direct) return direct;
  const first = raw.indexOf("{");
  const last = raw.lastIndexOf("}");
  if (first !== -1 && last > first) {
    return tryParse(raw.slice(first, last + 1));
  }
  return null;
}

/** 规范化 baseUrl：兼容带/不带 /v1 结尾的写法 */
export function normalizeBaseUrl(baseUrl: string): string {
  let url = baseUrl.trim().replace(/\/+$/, "");
  if (!/\/v\d+$/.test(url)) {
    url = `${url}/v1`;
  }
  return url;
}

/** 单段 LLM 调用超时（毫秒）。长文本时 LLM 响应较慢，给足 90s */
const LLM_REQUEST_TIMEOUT_MS = 90_000;

export async function proofreadParagraphWithLlm(
  text: string,
  config: LlmProofreadConfig,
): Promise<LlmParagraphResult> {
  const url = `${normalizeBaseUrl(config.baseUrl)}/chat/completions`;
  const systemPrompt = config.prompt?.trim() || DEFAULT_PROOFREAD_PROMPT;
  const temperature = Number(config.temperature ?? "0.2");

  // AbortController 防止 LLM 卡死导致请求无限挂起
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LLM_REQUEST_TIMEOUT_MS);

  let resp: Response;
  try {
    resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        temperature: Number.isFinite(temperature) ? temperature : 0.2,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: text },
        ],
      }),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`LLM 请求超时（${LLM_REQUEST_TIMEOUT_MS / 1000}s）`);
    }
    throw err;
  }
  clearTimeout(timer);

  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(`LLM API 请求失败 (${resp.status}): ${body.slice(0, 300)}`);
  }

  const data = (await resp.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content ?? "";
  const parsed = parseLlmJson(content);
  if (parsed) return parsed;
  // 兜底：模型没有按 JSON 返回时，将全文视为 corrected
  return { corrected: content.trim() || text, reason: "模型未按结构化格式返回，已使用其原始输出" };
}

/** 测试 LLM 连接是否可用 */
export async function testLlmConnection(config: LlmProofreadConfig): Promise<{ ok: boolean; message: string }> {
  try {
    const result = await proofreadParagraphWithLlm("今天天气很好。", config);
    return { ok: true, message: `连接成功，模型返回：${result.corrected.slice(0, 50)}` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}
