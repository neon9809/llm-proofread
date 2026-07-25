/**
 * 审计日志：将每次校对任务以 txt 文件写入磁盘，供合规审计查阅。
 *
 * 启用方式：环境变量 ENABLE_AUDIT_LOG=true
 * 日志保留期：AUDIT_LOG_RETENTION_DAYS（默认 90，0=永久保留）
 * 日志目录：AUDIT_LOG_DIR（默认 /app/audit-logs，开发环境为 ./audit-logs）
 *
 * 文件名：YYYYMMDD-HHMMSS_<来源>_<sessionid>.txt
 *   来源：用户名 / token名 / embed
 *   sessionid：8 位随机串，防止同秒重名
 *
 * 文件内容：时间、来源 IP、UA、认证方式、提交文本、校对结果、段落明细
 */
import { randomBytes, createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const LOG_DIR = process.env.AUDIT_LOG_DIR
  || (process.env.NODE_ENV === "production" ? "/app/audit-logs" : path.resolve(process.cwd(), "audit-logs"));

const RETENTION_DAYS = Number(process.env.AUDIT_LOG_RETENTION_DAYS ?? "90");

let retentionTimer: ReturnType<typeof setInterval> | null = null;
let dirEnsured = false;

export function isAuditLogEnabled(): boolean {
  return process.env.ENABLE_AUDIT_LOG === "true";
}

function ensureLogDir(): void {
  if (dirEnsured) return;
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    dirEnsured = true;
  } catch (err) {
    console.error("[AuditLog] 无法创建日志目录", LOG_DIR, err);
  }
}

/** 启动时清理过期日志，并定期清理（每小时一次） */
export function startAuditLogRetention(): void {
  if (!isAuditLogEnabled()) return;
  if (RETENTION_DAYS > 0) {
    cleanExpiredLogs();
    if (retentionTimer) clearInterval(retentionTimer);
    retentionTimer = setInterval(cleanExpiredLogs, 60 * 60 * 1000);
  }
}

function cleanExpiredLogs(): void {
  if (RETENTION_DAYS <= 0) return; // 0 = 永久保留
  try {
    ensureLogDir();
    const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
    const files = fs.readdirSync(LOG_DIR);
    let removed = 0;
    for (const file of files) {
      if (!file.endsWith(".txt")) continue;
      const fullPath = path.join(LOG_DIR, file);
      try {
        const stat = fs.statSync(fullPath);
        if (stat.mtimeMs < cutoff) {
          fs.unlinkSync(fullPath);
          removed++;
        }
      } catch {
        /* 单文件失败不影响整体 */
      }
    }
    if (removed > 0) {
      console.log(`[AuditLog] 清理过期日志 ${removed} 个（保留 ${RETENTION_DAYS} 天）`);
    }
  } catch (err) {
    console.error("[AuditLog] 清理过期日志失败", err);
  }
}

export interface AuditLogEntry {
  /** 来源 IP */
  ip: string;
  /** 浏览器 UA */
  userAgent: string;
  /** 认证方式描述，如 "用户(admin)" / "API Token(我的Token)" / "嵌入访客" */
  authLabel: string;
  /** 用于文件名的来源标识，如 "admin" / "token-xxx" / "embed" */
  sourceName: string;
  /** 提交的原文 */
  originalText: string;
  /** 校对后全文 */
  correctedText: string;
  /** 使用的 LLM 配置名 */
  llmConfigName: string | null;
  /** 段落明细 */
  paragraphs: Array<{
    index: number;
    original: string;
    corrected: string;
    changed: boolean;
    llmReason: string;
    llmError: string | null;
    ruleHits: Array<{ type: string; word: string; replacement: string | null }>;
  }>;
}

/** 写入一条审计日志 */
export function writeAuditLog(entry: AuditLogEntry): void {
  if (!isAuditLogEnabled()) return;
  try {
    ensureLogDir();
    const now = new Date();
    const ts = formatTimestamp(now);
    const sessionId = randomBytes(4).toString("hex");
    const safeSource = entry.sourceName.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 40) || "unknown";
    const filename = `${ts}_${safeSource}_${sessionId}.txt`;

    const content = buildLogContent(now, entry);
    const fullPath = path.join(LOG_DIR, filename);
    fs.writeFile(fullPath, content, "utf-8", err => {
      if (err) console.error("[AuditLog] 写入失败", fullPath, err);
    });
  } catch (err) {
    console.error("[AuditLog] 写入异常", err);
  }
}

function formatTimestamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function formatReadable(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function buildLogContent(time: Date, entry: AuditLogEntry): string {
  const lines: string[] = [];
  lines.push(`========================================`);
  lines.push(`  文语校对 — 审计日志`);
  lines.push(`========================================`);
  lines.push(`时间: ${formatReadable(time)}`);
  lines.push(`来源 IP: ${entry.ip}`);
  lines.push(`浏览器 UA: ${entry.userAgent || "(无)"}`);
  lines.push(`认证方式: ${entry.authLabel}`);
  lines.push(`LLM 配置: ${entry.llmConfigName || "(未使用)"}`);
  lines.push(``);
  lines.push(`========== 提交文本 ==========`);
  lines.push(entry.originalText);
  lines.push(``);
  lines.push(`========== 校对结果 ==========`);
  lines.push(entry.correctedText);
  lines.push(``);
  lines.push(`========== 段落明细 ==========`);
  for (const p of entry.paragraphs) {
    lines.push(`--- 段落 ${p.index} ${p.changed ? "(有修改)" : "(无修改)"} ---`);
    lines.push(`原文: ${p.original}`);
    lines.push(`校对: ${p.corrected}`);
    if (p.llmError) {
      lines.push(`LLM 错误: ${p.llmError}`);
    } else if (p.llmReason) {
      lines.push(`修改说明: ${p.llmReason}`);
    }
    if (p.ruleHits.length > 0) {
      lines.push(`规则命中:`);
      for (const h of p.ruleHits) {
        lines.push(`  [${h.type}] ${h.word}${h.replacement ? ` → ${h.replacement}` : ""}`);
      }
    }
    lines.push(``);
  }
  lines.push(`========================================`);
  return lines.join("\n");
}

/** 生成 token 的简短标识用于文件名（取 hash 前 8 位，避免泄露完整 token） */
export function tokenShortId(token: string): string {
  return createHash("sha256").update(token).digest("hex").slice(0, 8);
}
