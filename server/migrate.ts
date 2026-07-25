/**
 * 启动时自动执行数据库迁移（独立 Docker 部署场景）。
 * 按 drizzle journal 顺序读取 ./drizzle 目录下的 SQL 迁移文件并逐语句执行：
 * - 已记录在 __drizzle_migrations 表中的迁移直接跳过（与 drizzle-kit migrate 兼容）
 * - 执行时遇到"表/索引已存在"等幂等性错误跳过该语句（兼容曾手动建表的库）
 * - MySQL 容器可能比应用晚就绪，因此带重试等待
 */
import mysql from "mysql2/promise";
import crypto from "crypto";
import path from "path";
import fs from "fs";

/** 可安全忽略的 MySQL 错误码（幂等性冲突：对象已存在/重复） */
const IGNORABLE_ERRNOS = new Set([
  1050, // ER_TABLE_EXISTS_ERROR
  1060, // ER_DUP_FIELDNAME
  1061, // ER_DUP_KEYNAME
  1062, // ER_DUP_ENTRY（迁移记录并发插入）
  1826, // ER_DUP_CONSTRAINT_NAME
]);

function resolveMigrationsFolder(): string | null {
  // 生产镜像中迁移文件位于 /app/drizzle；开发环境位于项目根 ./drizzle
  const candidates = [
    path.resolve(process.cwd(), "drizzle"),
    path.resolve(import.meta.dirname ?? ".", "../drizzle"),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, "meta", "_journal.json"))) return dir;
  }
  return null;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function applyMigrations(url: string, folder: string): Promise<void> {
  const journal = JSON.parse(
    fs.readFileSync(path.join(folder, "meta", "_journal.json"), "utf8"),
  ) as { entries: { idx: number; when: number; tag: string }[] };

  const connection = await mysql.createConnection({ uri: url, multipleStatements: false });
  try {
    await connection.query(
      `CREATE TABLE IF NOT EXISTS __drizzle_migrations (
        id SERIAL PRIMARY KEY,
        hash text NOT NULL,
        created_at bigint
      )`,
    );
    const [rows] = await connection.query("SELECT hash FROM __drizzle_migrations");
    const applied = new Set((rows as { hash: string }[]).map(r => r.hash));

    for (const entry of journal.entries.sort((a, b) => a.idx - b.idx)) {
      const file = path.join(folder, `${entry.tag}.sql`);
      if (!fs.existsSync(file)) {
        console.warn(`[LLM-Proofread] 迁移文件缺失，跳过: ${entry.tag}.sql`);
        continue;
      }
      const sql = fs.readFileSync(file, "utf8");
      const hash = crypto.createHash("sha256").update(sql).digest("hex");
      if (applied.has(hash)) continue;

      // drizzle 迁移文件用 "--> statement-breakpoint" 分隔语句
      const statements = sql
        .split("--> statement-breakpoint")
        .map(s => s.trim())
        .filter(Boolean);
      let skipped = 0;
      for (const statement of statements) {
        try {
          await connection.query(statement);
        } catch (err) {
          const errno = (err as { errno?: number }).errno;
          if (errno !== undefined && IGNORABLE_ERRNOS.has(errno)) {
            skipped++;
            continue; // 对象已存在，幂等跳过
          }
          throw err;
        }
      }
      await connection.query(
        "INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)",
        [hash, entry.when],
      );
      console.log(
        `[LLM-Proofread] 已应用迁移 ${entry.tag}（${statements.length} 条语句${skipped ? `，跳过已存在 ${skipped} 条` : ""}）`,
      );
    }
  } finally {
    await connection.end().catch(() => {});
  }
}

export async function runMigrations(): Promise<boolean> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.warn("[LLM-Proofread] DATABASE_URL 未配置，跳过数据库迁移");
    return false;
  }
  const folder = resolveMigrationsFolder();
  if (!folder) {
    console.warn("[LLM-Proofread] 未找到 drizzle 迁移目录，跳过自动迁移");
    return false;
  }

  const maxAttempts = 12;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await applyMigrations(url, folder);
      console.log("[LLM-Proofread] 数据库结构已就绪");
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (attempt < maxAttempts) {
        console.warn(
          `[LLM-Proofread] 数据库迁移失败（第 ${attempt}/${maxAttempts} 次），5 秒后重试: ${message}`,
        );
        await sleep(5000);
      } else {
        console.error("[LLM-Proofread] 数据库迁移最终失败，请检查 DATABASE_URL 与数据库状态:", err);
      }
    }
  }
  return false;
}
