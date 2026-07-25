import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";
import { LOCAL_COOKIE_NAME, verifySession, type SessionPayload } from "../localAuth";
import { getActiveApiToken } from "../db";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
  /** 本地账号会话（用户名/密码登录） */
  localSession: SessionPayload | null;
  /** 通过 API Token 认证（iframe 嵌入免登录） */
  tokenAuth: boolean;
};

function parseCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;
  let localSession: SessionPayload | null = null;
  let tokenAuth = false;

  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    // Authentication is optional for public procedures.
    user = null;
  }

  // 本地会话：从 Cookie 中解析 JWT
  try {
    const sessionToken = parseCookie(opts.req.headers.cookie, LOCAL_COOKIE_NAME);
    if (sessionToken) {
      localSession = await verifySession(sessionToken);
    }
  } catch {
    localSession = null;
  }

  // API Token 认证：请求头 x-api-token 或 query ?token=（iframe 嵌入场景）
  if (!localSession) {
    try {
      const headerToken = opts.req.headers["x-api-token"];
      const queryToken = typeof opts.req.query?.token === "string" ? opts.req.query.token : undefined;
      const rawToken = (typeof headerToken === "string" ? headerToken : undefined) || queryToken;
      if (rawToken) {
        const found = await getActiveApiToken(rawToken);
        if (found) tokenAuth = true;
      }
    } catch {
      tokenAuth = false;
    }
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
    localSession,
    tokenAuth,
  };
}
