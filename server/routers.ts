import { COOKIE_NAME } from "@shared/const";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getSessionCookieOptions, isSecureRequest } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import {
  localAdminProcedure,
  localProtectedProcedure,
  publicProcedure,
  router,
} from "./_core/trpc";
import * as db from "./db";
import {
  LOCAL_COOKIE_NAME,
  generateApiToken,
  generateRandomPassword,
  getClientIp,
  hashPassword,
  signSession,
  verifyPassword,
  verifyTurnstileToken,
} from "./localAuth";
import { DEFAULT_PROOFREAD_PROMPT, testLlmConnection } from "./proofread/llmEngine";
import { proofreadText } from "./proofread/service";

function localCookieOptions(req: { protocol?: string; headers: Record<string, unknown> }) {
  const secure = isSecureRequest(req as never);
  return {
    httpOnly: true,
    // Secure Cookie 仅在 HTTPS 下生效；HTTP 部署（如 docker 直接暴露端口）需关掉 secure，
    // 否则浏览器会丢弃会话 Cookie，导致登录后立即被判定为未认证。
    // SameSite=None 要求必须同时带 Secure，故 HTTP 下回退为 Lax。
    secure,
    sameSite: (secure ? "none" : "lax") as "none" | "lax",
    path: "/",
  };
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  /** 本地账号认证 */
  localAuth: router({
    /** 公开配置：登录页需要的运行时配置（Turnstile 站点密钥、备案信息等） */
    publicSettings: publicProcedure.query(() => {
      const siteKey = process.env.TURNSTILE_SITE_KEY ?? "";
      const secretKey = process.env.TURNSTILE_SECRET_KEY ?? "";
      // 环境变量里的字面 \n 转为真换行，支持多行备案文本
      const footerBeian = (process.env.FOOTER_BEIAN ?? "").replace(/\\n/g, "\n");
      return {
        turnstile: {
          // 同时配置 siteKey 与 secretKey 才视为启用，避免半配置状态
          enabled: Boolean(siteKey && secretKey),
          siteKey,
        },
        footerBeian,
      };
    }),

    me: publicProcedure.query(async ({ ctx }) => {
      if (ctx.tokenAuth && !ctx.localSession) {
        return { id: 0, username: "embed", displayName: "嵌入访客", role: "user" as const, tokenAuth: true, mustChangePassword: false };
      }
      if (!ctx.localSession) return null;
      const user = await db.getLocalUserById(ctx.localSession.uid);
      if (!user || user.status !== "active") return null;
      return {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        role: user.role,
        tokenAuth: false,
        mustChangePassword: user.mustChangePassword === 1,
      };
    }),

    login: publicProcedure
      .input(
        z.object({
          username: z.string().min(1).max(64),
          password: z.string().min(1).max(128),
          turnstileToken: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        // Turnstile 校验：配置了 secret key 时强制要求有效 token
        const turnstileSecret = process.env.TURNSTILE_SECRET_KEY ?? "";
        if (turnstileSecret) {
          if (!input.turnstileToken) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "请先完成人机验证" });
          }
          const ok = await verifyTurnstileToken(
            input.turnstileToken,
            turnstileSecret,
            getClientIp(ctx.req)
          );
          if (!ok) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "人机验证失败，请重试" });
          }
        }

        const ip = getClientIp(ctx.req);
        const userAgent = typeof ctx.req.headers["user-agent"] === "string" ? ctx.req.headers["user-agent"] : undefined;
        const user = await db.getLocalUserByUsername(input.username);

        if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
          if (user) {
            await db.recordLogin({ userId: user.id, username: user.username, ip, userAgent, success: false });
          }
          throw new TRPCError({ code: "UNAUTHORIZED", message: "用户名或密码错误" });
        }
        if (user.status !== "active") {
          await db.recordLogin({ userId: user.id, username: user.username, ip, userAgent, success: false });
          throw new TRPCError({ code: "FORBIDDEN", message: "账号已被禁用，请联系管理员" });
        }

        await db.recordLogin({ userId: user.id, username: user.username, ip, userAgent, success: true });
        await db.updateLocalUser(user.id, { lastLoginAt: new Date(), lastLoginIp: ip });

        const token = await signSession({ uid: user.id, username: user.username, role: user.role });
        ctx.res.cookie(LOCAL_COOKIE_NAME, token, { ...localCookieOptions(ctx.req), maxAge: 7 * 24 * 3600 * 1000 });
        return {
          success: true,
          user: { id: user.id, username: user.username, role: user.role, mustChangePassword: user.mustChangePassword === 1 },
        };
      }),

    logout: publicProcedure.mutation(({ ctx }) => {
      ctx.res.clearCookie(LOCAL_COOKIE_NAME, { ...localCookieOptions(ctx.req), maxAge: -1 });
      return { success: true } as const;
    }),

    changePassword: localProtectedProcedure
      .input(z.object({ oldPassword: z.string().min(1), newPassword: z.string().min(8).max(128) }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.localSession) throw new TRPCError({ code: "UNAUTHORIZED", message: "请先登录" });
        const user = await db.getLocalUserById(ctx.localSession.uid);
        if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "用户不存在" });
        if (!(await verifyPassword(input.oldPassword, user.passwordHash))) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "原密码错误" });
        }
        await db.updateLocalUser(user.id, {
          passwordHash: await hashPassword(input.newPassword),
          mustChangePassword: 0,
        });
        return { success: true } as const;
      }),
  }),

  /** 用户管理（管理员） */
  adminUsers: router({
    list: localAdminProcedure.query(async () => {
      const users = await db.listLocalUsers();
      return users.map(u => ({
        id: u.id,
        username: u.username,
        displayName: u.displayName,
        role: u.role,
        status: u.status,
        lastLoginAt: u.lastLoginAt,
        lastLoginIp: u.lastLoginIp,
        createdAt: u.createdAt,
      }));
    }),

    create: localAdminProcedure
      .input(z.object({
        username: z.string().min(2).max(64).regex(/^[a-zA-Z0-9_.-]+$/, "用户名仅支持字母、数字、下划线"),
        password: z.string().min(8).max(128).optional(),
        displayName: z.string().max(128).optional(),
        role: z.enum(["user", "admin"]).default("user"),
      }))
      .mutation(async ({ input }) => {
        const existing = await db.getLocalUserByUsername(input.username);
        if (existing) throw new TRPCError({ code: "CONFLICT", message: "用户名已存在" });
        const password = input.password || generateRandomPassword(12);
        await db.createLocalUser({
          username: input.username,
          passwordHash: await hashPassword(password),
          displayName: input.displayName,
          role: input.role,
          status: "active",
          mustChangePassword: input.password ? 0 : 1,
        });
        return { success: true, initialPassword: input.password ? undefined : password };
      }),

    setStatus: localAdminProcedure
      .input(z.object({ id: z.number(), status: z.enum(["active", "disabled"]) }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.localSession?.uid === input.id) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "不能禁用自己的账号" });
        }
        await db.updateLocalUser(input.id, { status: input.status });
        return { success: true } as const;
      }),

    resetPassword: localAdminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const password = generateRandomPassword(12);
        await db.updateLocalUser(input.id, { passwordHash: await hashPassword(password), mustChangePassword: 1 });
        return { success: true, newPassword: password };
      }),

    remove: localAdminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.localSession?.uid === input.id) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "不能删除自己的账号" });
        }
        await db.deleteLocalUser(input.id);
        return { success: true } as const;
      }),

    loginLogs: localAdminProcedure
      .input(z.object({ limit: z.number().min(1).max(500).default(100) }).optional())
      .query(async ({ input }) => db.listLoginLogs(input?.limit ?? 100)),
  }),

  /** LLM 配置管理（管理员可写，登录用户可读列表） */
  llmConfigs: router({
    list: localProtectedProcedure.query(async () => {
      const configs = await db.listLlmConfigs();
      // 不向前端泄露完整 API Key
      return configs.map(c => ({
        id: c.id,
        name: c.name,
        baseUrl: c.baseUrl,
        apiKeyMasked: c.apiKey.length > 8 ? `${c.apiKey.slice(0, 4)}****${c.apiKey.slice(-4)}` : "****",
        model: c.model,
        prompt: c.prompt,
        temperature: c.temperature,
        isDefault: c.isDefault === 1,
      }));
    }),

    defaultPrompt: publicProcedure.query(() => DEFAULT_PROOFREAD_PROMPT),

    create: localAdminProcedure
      .input(z.object({
        name: z.string().min(1).max(128),
        baseUrl: z.string().url(),
        apiKey: z.string().min(1).max(512),
        model: z.string().min(1).max(128),
        prompt: z.string().max(4000).optional(),
        temperature: z.string().optional(),
        isDefault: z.boolean().default(false),
      }))
      .mutation(async ({ input }) => {
        await db.createLlmConfig({
          name: input.name,
          baseUrl: input.baseUrl,
          apiKey: input.apiKey,
          model: input.model,
          prompt: input.prompt,
          temperature: input.temperature ?? "0.2",
          isDefault: 0,
        });
        if (input.isDefault) {
          const configs = await db.listLlmConfigs();
          const created = configs.find(c => c.name === input.name);
          if (created) await db.setDefaultLlmConfig(created.id);
        }
        return { success: true } as const;
      }),

    update: localAdminProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(1).max(128).optional(),
        baseUrl: z.string().url().optional(),
        apiKey: z.string().max(512).optional(),
        model: z.string().min(1).max(128).optional(),
        prompt: z.string().max(4000).optional(),
        temperature: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, apiKey, ...rest } = input;
        const patch: Record<string, unknown> = { ...rest };
        if (apiKey && apiKey.trim().length > 0 && !apiKey.includes("****")) {
          patch.apiKey = apiKey.trim();
        }
        await db.updateLlmConfig(id, patch);
        return { success: true } as const;
      }),

    remove: localAdminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await db.deleteLlmConfig(input.id);
        return { success: true } as const;
      }),

    setDefault: localAdminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await db.setDefaultLlmConfig(input.id);
        return { success: true } as const;
      }),

    test: localAdminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const config = await db.getLlmConfigById(input.id);
        if (!config) throw new TRPCError({ code: "NOT_FOUND", message: "配置不存在" });
        return testLlmConnection(config);
      }),
  }),

  /** 违禁词管理 */
  forbiddenWords: router({
    list: localProtectedProcedure.query(async () => db.listForbiddenWords()),

    add: localAdminProcedure
      .input(z.object({ word: z.string().min(1).max(255), category: z.string().max(64).optional() }))
      .mutation(async ({ input }) => {
        await db.addForbiddenWord(input.word.trim(), input.category ?? "general");
        return { success: true } as const;
      }),

    addBatch: localAdminProcedure
      .input(z.object({ words: z.array(z.string().min(1).max(255)).min(1).max(1000) }))
      .mutation(async ({ input }) => {
        let added = 0;
        for (const word of input.words) {
          const trimmed = word.trim();
          if (trimmed) {
            await db.addForbiddenWord(trimmed);
            added++;
          }
        }
        return { success: true, added };
      }),

    remove: localAdminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await db.deleteForbiddenWord(input.id);
        return { success: true } as const;
      }),
  }),

  /** 不规范表述替换规则管理 */
  replaceRules: router({
    list: localProtectedProcedure.query(async () => db.listReplaceRules()),

    add: localAdminProcedure
      .input(z.object({
        pattern: z.string().min(1).max(255),
        replacement: z.string().min(1).max(255),
        note: z.string().max(255).optional(),
      }))
      .mutation(async ({ input }) => {
        await db.addReplaceRule(input.pattern.trim(), input.replacement.trim(), input.note);
        return { success: true } as const;
      }),

    remove: localAdminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await db.deleteReplaceRule(input.id);
        return { success: true } as const;
      }),

    update: localAdminProcedure
      .input(z.object({
        id: z.number(),
        pattern: z.string().min(1).max(255),
        replacement: z.string().min(1).max(255),
        note: z.string().max(255).optional(),
      }))
      .mutation(async ({ input }) => {
        await db.updateReplaceRule(input.id, {
          pattern: input.pattern.trim(),
          replacement: input.replacement.trim(),
          note: input.note ?? null,
        });
        return { success: true } as const;
      }),
  }),

  /** API Token 管理（管理员） */
  apiTokens: router({
    list: localAdminProcedure.query(async () => {
      const tokens = await db.listApiTokens();
      return tokens.map(t => ({
        id: t.id,
        name: t.name,
        token: t.token,
        status: t.status,
        lastUsedAt: t.lastUsedAt,
        createdAt: t.createdAt,
      }));
    }),

    create: localAdminProcedure
      .input(z.object({ name: z.string().min(1).max(128) }))
      .mutation(async ({ ctx, input }) => {
        const token = generateApiToken();
        await db.createApiToken(input.name, token, ctx.localSession!.uid);
        return { success: true, token };
      }),

    revoke: localAdminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await db.revokeApiToken(input.id);
        return { success: true } as const;
      }),

    remove: localAdminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await db.deleteApiToken(input.id);
        return { success: true } as const;
      }),
  }),

  /** 校对核心接口（登录用户或 Token 免登录均可用） */
  proofread: router({
    run: localProtectedProcedure
      .input(z.object({
        text: z.string().min(1).max(100000),
        useLlm: z.boolean().default(true),
        useRules: z.boolean().default(true),
        llmConfigId: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        return proofreadText(input.text, {
          useLlm: input.useLlm,
          useRules: input.useRules,
          llmConfigId: input.llmConfigId,
        });
      }),
  }),
});

export type AppRouter = typeof appRouter;
