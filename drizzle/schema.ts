import { int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/** 本地账号体系：用户名 + 密码哈希，管理员可创建/禁用用户 */
export const localUsers = mysqlTable("local_users", {
  id: int("id").autoincrement().primaryKey(),
  username: varchar("username", { length: 64 }).notNull().unique(),
  passwordHash: varchar("passwordHash", { length: 255 }).notNull(),
  displayName: varchar("displayName", { length: 128 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  status: mysqlEnum("status", ["active", "disabled"]).default("active").notNull(),
  mustChangePassword: int("mustChangePassword").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastLoginAt: timestamp("lastLoginAt"),
  lastLoginIp: varchar("lastLoginIp", { length: 64 }),
});

export type LocalUser = typeof localUsers.$inferSelect;
export type InsertLocalUser = typeof localUsers.$inferInsert;

/** 登录日志：每次登录记录 IP 地址 */
export const loginLogs = mysqlTable("login_logs", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  username: varchar("username", { length: 64 }).notNull(),
  ip: varchar("ip", { length: 64 }).notNull(),
  userAgent: varchar("userAgent", { length: 512 }),
  success: int("success").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type LoginLog = typeof loginLogs.$inferSelect;

/** LLM 配置：支持多套配置，OpenAI 兼容接口 */
export const llmConfigs = mysqlTable("llm_configs", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 128 }).notNull(),
  baseUrl: varchar("baseUrl", { length: 512 }).notNull(),
  apiKey: varchar("apiKey", { length: 512 }).notNull(),
  model: varchar("model", { length: 128 }).notNull(),
  prompt: text("prompt"),
  temperature: varchar("temperature", { length: 16 }).default("0.2"),
  concurrency: int("concurrency").default(5).notNull(),
  isDefault: int("isDefault").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type LlmConfig = typeof llmConfigs.$inferSelect;
export type InsertLlmConfig = typeof llmConfigs.$inferInsert;

/** 违禁词列表 */
export const forbiddenWords = mysqlTable("forbidden_words", {
  id: int("id").autoincrement().primaryKey(),
  word: varchar("word", { length: 255 }).notNull().unique(),
  category: varchar("category", { length: 64 }).default("general"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ForbiddenWord = typeof forbiddenWords.$inferSelect;

/** 不规范表述替换规则：键值对，如 "的的地" → "得" */
export const replaceRules = mysqlTable("replace_rules", {
  id: int("id").autoincrement().primaryKey(),
  pattern: varchar("pattern", { length: 255 }).notNull().unique(),
  replacement: varchar("replacement", { length: 255 }).notNull(),
  note: varchar("note", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ReplaceRule = typeof replaceRules.$inferSelect;

/** API Token：管理员生成，用于开放 API 调用与 iframe 免登录嵌入 */
export const apiTokens = mysqlTable("api_tokens", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 128 }).notNull(),
  token: varchar("token", { length: 128 }).notNull().unique(),
  createdBy: int("createdBy").notNull(),
  status: mysqlEnum("status", ["active", "revoked"]).default("active").notNull(),
  lastUsedAt: timestamp("lastUsedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ApiToken = typeof apiTokens.$inferSelect;
