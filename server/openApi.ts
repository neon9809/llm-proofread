/**
 * 开放 REST API：供外部程序通过 API Token 调用校对能力。
 *
 * POST /api/v1/proofread
 *   Header:  Authorization: Bearer <token>  或  x-api-token: <token>
 *   Body:    { "text": "...", "use_llm": true, "use_rules": true }
 *   Return:  { original, corrected, paragraphs: [{index, original, corrected, changed, rule_hits, llm_reason}] }
 */
import type { Express, Request, Response } from "express";
import { getActiveApiToken, touchApiToken } from "./db";
import { writeAuditLog, tokenShortId } from "./auditLog";
import { getClientIp } from "./localAuth";
import { proofreadText } from "./proofread/service";
import type { ApiToken } from "../drizzle/schema";

async function authenticate(req: Request): Promise<ApiToken | null> {
  let token: string | undefined;
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) token = authHeader.slice(7).trim();
  if (!token) {
    const headerToken = req.headers["x-api-token"];
    if (typeof headerToken === "string") token = headerToken;
  }
  if (!token && typeof req.query.token === "string") token = req.query.token;
  if (!token) return null;

  const found = await getActiveApiToken(token);
  if (!found) return null;
  void touchApiToken(found.id);
  return found;
}

export function registerOpenApi(app: Express) {
  app.post("/api/v1/proofread", async (req: Request, res: Response) => {
    try {
      const tokenRecord = await authenticate(req);
      if (!tokenRecord) {
        res.status(401).json({ error: "无效或缺失的 API Token" });
        return;
      }

      const { text, use_llm = true, use_rules = true, llm_config_id } = req.body ?? {};
      if (typeof text !== "string" || text.trim().length === 0) {
        res.status(400).json({ error: "text 字段必填且不能为空" });
        return;
      }
      if (text.length > 100000) {
        res.status(400).json({ error: "文本长度超过限制（100000 字符）" });
        return;
      }

      const result = await proofreadText(text, {
        useLlm: Boolean(use_llm),
        useRules: Boolean(use_rules),
        llmConfigId: typeof llm_config_id === "number" ? llm_config_id : undefined,
      });

      const correctedFull = result.paragraphs.map(p => p.corrected).join("\n");

      // 审计日志（异步写文件，不阻塞响应）
      writeAuditLog({
        ip: getClientIp(req),
        userAgent: typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : "",
        authLabel: `API Token(${tokenRecord.name})`,
        sourceName: `token-${tokenShortId(tokenRecord.token)}`,
        originalText: text,
        correctedText: correctedFull,
        llmConfigName: result.llmConfigName ?? null,
        paragraphs: result.paragraphs.map(p => ({
          index: p.index,
          original: p.original,
          corrected: p.corrected,
          changed: p.changed,
          llmReason: p.llmReason,
          llmError: p.llmError ?? null,
          ruleHits: p.ruleHits.map(h => ({ type: h.type, word: h.word, replacement: h.replacement ?? null })),
        })),
      });

      const changedParagraphs = result.paragraphs.filter(p => p.changed);

      res.json({
        original: text,
        corrected: correctedFull,
        llm_config: result.llmConfigName ?? null,
        total_paragraphs: result.paragraphs.length,
        changed_count: changedParagraphs.length,
        paragraphs: result.paragraphs.map(p => ({
          index: p.index,
          original: p.original,
          corrected: p.corrected,
          changed: p.changed,
          llm_reason: p.llmReason,
          llm_error: p.llmError ?? null,
          rule_hits: p.ruleHits.map(h => ({
            type: h.type,
            word: h.word,
            replacement: h.replacement ?? null,
            positions: h.positions,
          })),
        })),
      });
    } catch (err) {
      console.error("[OpenAPI] proofread error:", err);
      res.status(500).json({ error: "服务器内部错误" });
    }
  });
}
