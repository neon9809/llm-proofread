/**
 * 启动初始化：确保存在管理员账号。
 * 若数据库中没有任何管理员，自动创建 admin 用户，
 * 随机生成密码并打印在启动日志（Docker 日志）中。
 */
import { createLocalUser, getLocalUserByUsername, listLocalUsers } from "./db";
import { DEFAULT_ADMIN_USERNAME, generateRandomPassword, hashPassword } from "./localAuth";

export async function ensureAdminUser(): Promise<void> {
  try {
    const users = await listLocalUsers();
    const hasAdmin = users.some(u => u.role === "admin");
    if (hasAdmin) return;

    // 若 admin 用户名已被占用但不是管理员，提升为管理员并重置密码
    const password = process.env.ADMIN_INITIAL_PASSWORD || generateRandomPassword();
    const passwordHash = await hashPassword(password);
    const existing = await getLocalUserByUsername(DEFAULT_ADMIN_USERNAME);
    if (existing) {
      const { updateLocalUser } = await import("./db");
      await updateLocalUser(existing.id, { role: "admin", passwordHash, mustChangePassword: 1 });
    } else {
      await createLocalUser({
        username: DEFAULT_ADMIN_USERNAME,
        passwordHash,
        displayName: "管理员",
        role: "admin",
        status: "active",
        mustChangePassword: 1,
      });
    }

    // 打印到 stdout（Docker 日志可见）
    console.log("");
    console.log("=".repeat(60));
    console.log("[LLM-Proofread] 管理员账号已初始化");
    console.log(`[LLM-Proofread]   用户名: ${DEFAULT_ADMIN_USERNAME}`);
    console.log(`[LLM-Proofread]   初始密码: ${password}`);
    console.log("[LLM-Proofread] 请登录后立即修改密码！");
    console.log("=".repeat(60));
    console.log("");
  } catch (err) {
    console.error("[LLM-Proofread] 管理员初始化失败:", err);
  }
}
