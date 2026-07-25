import { desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  apiTokens,
  forbiddenWords,
  InsertLlmConfig,
  InsertLocalUser,
  InsertUser,
  llmConfigs,
  localUsers,
  loginLogs,
  replaceRules,
  users,
} from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
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

export async function listForbiddenWords() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(forbiddenWords).orderBy(desc(forbiddenWords.createdAt));
}

export async function addForbiddenWord(word: string, category = "general") {
  const db = await getDb();
  if (!db) throw new Error("数据库不可用");
  await db.insert(forbiddenWords).values({ word, category }).onDuplicateKeyUpdate({ set: { category } });
}

export async function deleteForbiddenWord(id: number) {
  const db = await getDb();
  if (!db) throw new Error("数据库不可用");
  await db.delete(forbiddenWords).where(eq(forbiddenWords.id, id));
}

// ---------- 替换规则 ----------

export async function listReplaceRules() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(replaceRules).orderBy(desc(replaceRules.createdAt));
}

export async function addReplaceRule(pattern: string, replacement: string, note?: string) {
  const db = await getDb();
  if (!db) throw new Error("数据库不可用");
  await db.insert(replaceRules).values({ pattern, replacement, note }).onDuplicateKeyUpdate({ set: { replacement, note } });
}

export async function deleteReplaceRule(id: number) {
  const db = await getDb();
  if (!db) throw new Error("数据库不可用");
  await db.delete(replaceRules).where(eq(replaceRules.id, id));
}

export async function updateReplaceRule(
  id: number,
  patch: { pattern: string; replacement: string; note?: string | null },
) {
  const db = await getDb();
  if (!db) throw new Error("数据库不可用");
  await db.update(replaceRules).set(patch).where(eq(replaceRules.id, id));
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
