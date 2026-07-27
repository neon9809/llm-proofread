import { desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  apiTokens,
  forbiddenWords,
  InsertLlmConfig,
  InsertLocalUser,
  llmConfigs,
  localUsers,
  loginLogs,
  replaceRules,
  settings,
} from "../drizzle/schema";

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      // 显式配置连接池，提升并发能力（mysql2 默认仅 10 连接）
      _db = drizzle({
        connection: {
          uri: process.env.DATABASE_URL,
          connectionLimit: 20,
          waitForConnections: true,
          queueLimit: 0,
        },
      });
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ---------- 本地用户 ----------

export async function getLocalUserByUsername(username: string) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(localUsers).where(eq(localUsers.username, username)).limit(1);
  return rows[0];
}

export async function getLocalUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(localUsers).where(eq(localUsers.id, id)).limit(1);
  return rows[0];
}

export async function listLocalUsers() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(localUsers).orderBy(desc(localUsers.createdAt));
}

export async function createLocalUser(user: InsertLocalUser) {
  const db = await getDb();
  if (!db) throw new Error("数据库不可用");
  await db.insert(localUsers).values(user);
}

export async function updateLocalUser(id: number, patch: Partial<InsertLocalUser>) {
  const db = await getDb();
  if (!db) throw new Error("数据库不可用");
  await db.update(localUsers).set(patch).where(eq(localUsers.id, id));
}

export async function deleteLocalUser(id: number) {
  const db = await getDb();
  if (!db) throw new Error("数据库不可用");
  await db.delete(localUsers).where(eq(localUsers.id, id));
}

export async function countLocalUsers(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const rows = await db.select({ id: localUsers.id }).from(localUsers);
  return rows.length;
}

// ---------- 登录日志 ----------

export async function recordLogin(entry: {
  userId: number;
  username: string;
  ip: string;
  userAgent?: string;
  success: boolean;
}) {
  const db = await getDb();
  if (!db) return;
  await db.insert(loginLogs).values({
    userId: entry.userId,
    username: entry.username,
    ip: entry.ip,
    userAgent: entry.userAgent?.slice(0, 500),
    success: entry.success ? 1 : 0,
  });
}

export async function listLoginLogs(limit = 100) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(loginLogs).orderBy(desc(loginLogs.createdAt)).limit(limit);
}

// ---------- LLM 配置 ----------

export async function listLlmConfigs() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(llmConfigs).orderBy(desc(llmConfigs.isDefault), desc(llmConfigs.createdAt));
}

export async function getDefaultLlmConfig() {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(llmConfigs).where(eq(llmConfigs.isDefault, 1)).limit(1);
  if (rows[0]) return rows[0];
  const all = await db.select().from(llmConfigs).limit(1);
  return all[0];
}

export async function getLlmConfigById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(llmConfigs).where(eq(llmConfigs.id, id)).limit(1);
  return rows[0];
}

export async function createLlmConfig(config: InsertLlmConfig) {
  const db = await getDb();
  if (!db) throw new Error("数据库不可用");
  await db.insert(llmConfigs).values(config);
}

export async function updateLlmConfig(id: number, patch: Partial<InsertLlmConfig>) {
  const db = await getDb();
  if (!db) throw new Error("数据库不可用");
  await db.update(llmConfigs).set(patch).where(eq(llmConfigs.id, id));
}

export async function deleteLlmConfig(id: number) {
  const db = await getDb();
  if (!db) throw new Error("数据库不可用");
  await db.delete(llmConfigs).where(eq(llmConfigs.id, id));
}

export async function setDefaultLlmConfig(id: number) {
  const db = await getDb();
  if (!db) throw new Error("数据库不可用");
  await db.update(llmConfigs).set({ isDefault: 0 });
  await db.update(llmConfigs).set({ isDefault: 1 }).where(eq(llmConfigs.id, id));
}

// ---------- 违禁词 ----------

// 简单 TTL 内存缓存：违禁词、替换规则、默认 LLM 配置变化不频繁，
// 缓存 30s 可大幅降低高并发校对时的数据库压力。写操作后自动失效。
function createTtlCache<T>() {
  let value: T | undefined;
  let expiresAt = 0;
  return {
    get: () => (Date.now() < expiresAt ? value : undefined),
    set: (v: T) => {
      value = v;
      expiresAt = Date.now() + 30_000;
    },
    invalidate: () => {
      value = undefined;
      expiresAt = 0;
    },
  };
}

const forbiddenWordsCache = createTtlCache<unknown[]>();
const replaceRulesCache = createTtlCache<unknown[]>();

export async function listForbiddenWords() {
  const cached = forbiddenWordsCache.get();
  if (cached) return cached as never;
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select().from(forbiddenWords).orderBy(desc(forbiddenWords.createdAt));
  forbiddenWordsCache.set(rows);
  return rows;
}

export async function addForbiddenWord(word: string, category = "general") {
  const db = await getDb();
  if (!db) throw new Error("数据库不可用");
  await db.insert(forbiddenWords).values({ word, category }).onDuplicateKeyUpdate({ set: { category } });
  forbiddenWordsCache.invalidate();
}

export async function deleteForbiddenWord(id: number) {
  const db = await getDb();
  if (!db) throw new Error("数据库不可用");
  await db.delete(forbiddenWords).where(eq(forbiddenWords.id, id));
  forbiddenWordsCache.invalidate();
}

// ---------- 替换规则 ----------

export async function listReplaceRules() {
  const cached = replaceRulesCache.get();
  if (cached) return cached as never;
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select().from(replaceRules).orderBy(desc(replaceRules.createdAt));
  replaceRulesCache.set(rows);
  return rows;
}

export async function addReplaceRule(pattern: string, replacement: string, note?: string) {
  const db = await getDb();
  if (!db) throw new Error("数据库不可用");
  await db.insert(replaceRules).values({ pattern, replacement, note }).onDuplicateKeyUpdate({ set: { replacement, note } });
  replaceRulesCache.invalidate();
}

export async function deleteReplaceRule(id: number) {
  const db = await getDb();
  if (!db) throw new Error("数据库不可用");
  await db.delete(replaceRules).where(eq(replaceRules.id, id));
  replaceRulesCache.invalidate();
}

export async function updateReplaceRule(
  id: number,
  patch: { pattern: string; replacement: string; note?: string | null },
) {
  const db = await getDb();
  if (!db) throw new Error("数据库不可用");
  await db.update(replaceRules).set(patch).where(eq(replaceRules.id, id));
  replaceRulesCache.invalidate();
}

// ---------- API Token ----------

export async function listApiTokens() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(apiTokens).orderBy(desc(apiTokens.createdAt));
}

export async function createApiToken(name: string, token: string, createdBy: number) {
  const db = await getDb();
  if (!db) throw new Error("数据库不可用");
  await db.insert(apiTokens).values({ name, token, createdBy });
}

export async function revokeApiToken(id: number) {
  const db = await getDb();
  if (!db) throw new Error("数据库不可用");
  await db.update(apiTokens).set({ status: "revoked" }).where(eq(apiTokens.id, id));
}

export async function deleteApiToken(id: number) {
  const db = await getDb();
  if (!db) throw new Error("数据库不可用");
  await db.delete(apiTokens).where(eq(apiTokens.id, id));
}

export async function getActiveApiToken(token: string) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(apiTokens).where(eq(apiTokens.token, token)).limit(1);
  const found = rows[0];
  if (!found || found.status !== "active") return undefined;
  return found;
}

export async function touchApiToken(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(apiTokens).set({ lastUsedAt: new Date() }).where(eq(apiTokens.id, id));
}

// ---------- 通用设置（键值表） ----------

// 设置项内存缓存（固定表述等内容不频繁变更，30s TTL 降低 DB 压力）
const settingsCache = new Map<string, { value: string; expiresAt: number }>();

export async function getSetting(key: string): Promise<string | null> {
  const cached = settingsCache.get(key);
  if (cached && Date.now() < cached.expiresAt) return cached.value;
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(settings).where(eq(settings.key, key)).limit(1);
  const value = rows[0]?.value ?? null;
  if (value !== null) {
    settingsCache.set(key, { value, expiresAt: Date.now() + 30_000 });
  }
  return value;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("数据库不可用");
  await db.insert(settings).values({ key, value }).onDuplicateKeyUpdate({ set: { value } });
  settingsCache.set(key, { value, expiresAt: Date.now() + 30_000 });
}
