/**
 * 标准 OIDC (OpenID Connect) 登录支持。
 *
 * 实现 Authorization Code Flow + PKCE：
 *   1. /api/oidc/login      - 生成 state/code_verifier，重定向到 IdP 授权端点
 *   2. IdP 回调 /api/oidc/callback - 校验 state，用 code 换 token，拉 userinfo
 *   3. find-or-create 对应 localUsers 记录，签发本地会话 Cookie（复用 LOCAL_COOKIE_NAME）
 *
 * 配置（环境变量）：
 *   OIDC_ISSUER        - IdP issuer，如 https://accounts.google.com
 *   OIDC_CLIENT_ID     - 客户端 ID
 *   OIDC_CLIENT_SECRET - 客户端密钥
 *   OIDC_SCOPES        - 可选，默认 "openid profile email"
 *   OIDC_DISPLAY_NAME  - 可选，登录按钮文案，默认 "SSO"
 *
 * 复用 localUsers 表：OIDC 用户 username = `oidc:<sub 短哈希>`，passwordHash 随机不可用。
 * 这样 AppShell / localAuth.me 等已有流程无需改动。
 */
import { createHash, createHmac, randomBytes } from "node:crypto";
import type { Express, Request, Response } from "express";
import * as db from "../db";
import { isSecureRequest } from "./cookies";
import {
  LOCAL_COOKIE_NAME,
  generateRandomPassword,
  getClientIp,
  hashPassword,
  signSession,
} from "../localAuth";

export interface OidcConfig {
  issuer: string;
  clientId: string;
  clientSecret: string;
  scopes: string;
  displayName: string;
  approveRequired: boolean;
}

export function getOidcConfig(): OidcConfig | null {
  const issuer = process.env.OIDC_ISSUER ?? "";
  const clientId = process.env.OIDC_CLIENT_ID ?? "";
  const clientSecret = process.env.OIDC_CLIENT_SECRET ?? "";
  if (!issuer || !clientId || !clientSecret) return null;
  return {
    issuer,
    clientId,
    clientSecret,
    scopes: process.env.OIDC_SCOPES ?? "openid profile email",
    displayName: process.env.OIDC_DISPLAY_NAME ?? "SSO",
    // 为 true 时，OIDC 新用户注册后默认 disabled，需管理员在用户管理页启用
    approveRequired: process.env.OIDC_APPROVE_REQUIRED === "true",
  };
}

export function isOidcEnabled(): boolean {
  return getOidcConfig() !== null;
}

interface DiscoveryDoc {
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint?: string;
  issuer: string;
}

let discoveryCache: { issuer: string; doc: DiscoveryDoc; fetchedAt: number } | null = null;
const DISCOVERY_TTL_MS = 10 * 60 * 1000;

async function getDiscoveryDoc(issuer: string): Promise<DiscoveryDoc> {
  if (
    discoveryCache &&
    discoveryCache.issuer === issuer &&
    Date.now() - discoveryCache.fetchedAt < DISCOVERY_TTL_MS
  ) {
    return discoveryCache.doc;
  }
  const url = `${issuer.replace(/\/$/, "")}/.well-known/openid-configuration`;
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`OIDC discovery 请求失败: ${resp.status} ${resp.statusText}`);
  }
  const doc = (await resp.json()) as DiscoveryDoc;
  if (!doc.authorization_endpoint || !doc.token_endpoint) {
    throw new Error("OIDC discovery 文档缺少 authorization_endpoint 或 token_endpoint");
  }
  discoveryCache = { issuer, doc, fetchedAt: Date.now() };
  return doc;
}

/** 强制重新拉取 discovery（配置变更或调试用） */
export function resetOidcDiscoveryCache(): void {
  discoveryCache = null;
}

function base64UrlEncode(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function genPkce(): { verifier: string; challenge: string } {
  const verifier = base64UrlEncode(randomBytes(32));
  const challenge = base64UrlEncode(createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

/**
 * 无状态 state：把 verifier + redirect 编码进 state 参数本身，HMAC 签名防篡改。
 * 回调时直接从 state 解析，完全不依赖 cookie，避免跨站/代理导致 cookie 丢失。
 *
 * state 格式：base64url(payload).base64url(hmac(payload))
 */
interface StatePayload {
  v: string; // PKCE code_verifier
  r: string; // 登录后跳转路径
  n: string; // 随机 nonce（防重放）
}

function getOidcStateSecret(): string {
  // 复用 JWT_SECRET 作为 HMAC 密钥；未配置时降级（仅开发环境）
  return process.env.JWT_SECRET || "oidc-state-dev-secret";
}

function base64UrlEncodeStr(str: string): string {
  return Buffer.from(str, "utf-8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecodeStr(str: string): string {
  const pad = str.length % 4 === 0 ? "" : "=".repeat(4 - (str.length % 4));
  return Buffer.from(str.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64").toString("utf-8");
}

/** 生成签名后的 state 参数 */
function encodeState(payload: StatePayload): string {
  const body = base64UrlEncodeStr(JSON.stringify(payload));
  const sig = createHmac("sha256", getOidcStateSecret()).update(body).digest();
  const sigStr = sig.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${body}.${sigStr}`;
}

/** 校验并解析 state 参数；签名不符或格式错误返回 null */
function decodeState(state: string): StatePayload | null {
  const dot = state.indexOf(".");
  if (dot === -1) {
    console.warn("[OIDC] decodeState: no dot in state, len=", state.length);
    return null;
  }
  const body = state.slice(0, dot);
  const sig = state.slice(dot + 1);
  const expectedSig = createHmac("sha256", getOidcStateSecret())
    .update(body)
    .digest()
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  if (sig !== expectedSig) {
    console.warn("[OIDC] decodeState: sig mismatch", "got=", sig.slice(0, 20), "expected=", expectedSig.slice(0, 20));
    return null;
  }
  try {
    const parsed = JSON.parse(base64UrlDecodeStr(body)) as StatePayload;
    if (typeof parsed.v === "string" && typeof parsed.r === "string" && typeof parsed.n === "string") {
      return parsed;
    }
  } catch {
    /* malformed */
  }
  return null;
}

interface OidcUserInfo {
  sub: string;
  name?: string;
  email?: string;
  preferredUsername?: string;
}

interface TokenResponse {
  access_token: string;
  id_token?: string;
  token_type?: string;
  expires_in?: number;
}

/** 用 sub 生成稳定的、不超过 64 字符的本地 username */
function oidcUsername(sub: string): string {
  const hash = createHash("sha256").update(sub).digest("hex").slice(0, 40);
  return `oidc:${hash}`;
}

/**
 * 根据 userinfo 查找或创建本地用户。
 * - 首次登录：创建，role=user，随机不可用密码，mustChangePassword=0
 *   - approveRequired=false：status=active（直接可用）
 *   - approveRequired=true：status=disabled（需管理员启用）
 * - 再次登录：仅刷新 displayName 与 lastLogin，保留 role/status（管理员可手动提权）
 *
 * 返回 status 让调用方决定是否签发会话：disabled 用户不允许登录。
 */
async function findOrCreateOidcUser(
  info: OidcUserInfo,
  ip: string,
  approveRequired: boolean
): Promise<{ id: number; username: string; role: "user" | "admin"; status: "active" | "disabled" } | null> {
  const username = oidcUsername(info.sub);
  const displayName = info.name || info.email || info.preferredUsername || username;

  let user = await db.getLocalUserByUsername(username);
  if (user) {
    // 已存在：刷新登录信息，保留管理员设定的 role/status
    await db.updateLocalUser(user.id, {
      displayName,
      lastLoginAt: new Date(),
      lastLoginIp: ip,
    });
    return { id: user.id, username: user.username, role: user.role, status: user.status };
  }

  // 新建：随机密码哈希，OIDC 用户不通过密码登录
  const passwordHash = await hashPassword(generateRandomPassword(32));
  await db.createLocalUser({
    username,
    passwordHash,
    displayName,
    role: "user",
    status: approveRequired ? "disabled" : "active",
    mustChangePassword: 0,
    lastLoginAt: new Date(),
    lastLoginIp: ip,
  });

  user = await db.getLocalUserByUsername(username);
  if (!user) return null;
  return { id: user.id, username: user.username, role: user.role, status: user.status };
}

function localCookieOptions(req: Request) {
  const secure = isSecureRequest(req);
  return {
    httpOnly: true,
    secure,
    sameSite: (secure ? "none" : "lax") as "none" | "lax",
    path: "/",
  };
}

function redirectToLogin(res: Response, reason: string): void {
  res.redirect(302, `/login?oidc_error=${encodeURIComponent(reason)}`);
}

export function registerOidcRoutes(app: Express): void {
  /** 发起 OIDC 登录：重定向到 IdP 授权端点 */
  app.get("/api/oidc/login", async (req: Request, res: Response) => {
    const config = getOidcConfig();
    if (!config) {
      redirectToLogin(res, "oidc_not_configured");
      return;
    }
    try {
      const doc = await getDiscoveryDoc(config.issuer);
      const { verifier, challenge } = genPkce();
      const redirect = typeof req.query.redirect === "string" ? req.query.redirect : "/workspace";
      // 无状态 state：verifier + redirect 编码进 state，HMAC 签名，回调时直接解析
      const state = encodeState({
        v: verifier,
        r: redirect,
        n: base64UrlEncode(randomBytes(16)),
      });

      const params = new URLSearchParams({
        response_type: "code",
        client_id: config.clientId,
        redirect_uri: `${originFromReq(req)}/api/oidc/callback`,
        scope: config.scopes,
        state,
        code_challenge: challenge,
        code_challenge_method: "S256",
      });
      res.redirect(302, `${doc.authorization_endpoint}?${params.toString()}`);
    } catch (error) {
      console.error("[OIDC] login failed:", error);
      redirectToLogin(res, "oidc_discovery_failed");
    }
  });

  /** OIDC 回调：换 token、拉 userinfo、建本地会话 */
  app.get("/api/oidc/callback", async (req: Request, res: Response) => {
    const config = getOidcConfig();
    if (!config) {
      redirectToLogin(res, "oidc_not_configured");
      return;
    }

    const code = typeof req.query.code === "string" ? req.query.code : "";
    const stateParam = typeof req.query.state === "string" ? req.query.state : "";
    // 无状态 state：从 state 参数本身解析（HMAC 签名校验），不依赖 cookie
    const stored = stateParam ? decodeState(stateParam) : null;

    // IdP 授权失败时会带 error/error_description 而非 code，记录便于排查
    const error = typeof req.query.error === "string" ? req.query.error : "";
    const errorDesc = typeof req.query.error_description === "string" ? req.query.error_description : "";
    if (error) {
      console.warn("[OIDC] IdP returned error:", error, "| desc:", errorDesc);
    }
    if (!code || !stored) {
      console.warn("[OIDC] invalid_state: code=", Boolean(code), "stateLen=", stateParam.length, "stateHead=", stateParam.slice(0, 40), "allQuery=", JSON.stringify(req.query));
      redirectToLogin(res, "invalid_state");
      return;
    }

    try {
      const doc = await getDiscoveryDoc(config.issuer);
      const redirectUri = `${originFromReq(req)}/api/oidc/callback`;

      // 用 code 换 token
      const tokenResp = await fetch(doc.token_endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: redirectUri,
          client_id: config.clientId,
          client_secret: config.clientSecret,
          code_verifier: stored.v,
        }),
      });
      if (!tokenResp.ok) {
        const text = await tokenResp.text();
        console.error("[OIDC] token exchange failed:", tokenResp.status, text);
        redirectToLogin(res, "token_exchange_failed");
        return;
      }
      const tokens = (await tokenResp.json()) as TokenResponse;
      if (!tokens.access_token) {
        redirectToLogin(res, "no_access_token");
        return;
      }

      // 拉 userinfo
      let info: OidcUserInfo;
      if (doc.userinfo_endpoint) {
        const uiResp = await fetch(doc.userinfo_endpoint, {
          headers: { Authorization: `Bearer ${tokens.access_token}` },
        });
        if (!uiResp.ok) {
          console.error("[OIDC] userinfo failed:", uiResp.status);
          redirectToLogin(res, "userinfo_failed");
          return;
        }
        info = (await uiResp.json()) as OidcUserInfo;
      } else {
        // 无 userinfo 端点时从 id_token 解析 sub（不解签名，仅信任 token 端点返回的已认证 token）
        info = parseIdTokenSub(tokens.id_token);
      }

      if (!info.sub) {
        redirectToLogin(res, "no_sub");
        return;
      }

      const ip = getClientIp(req);
      const localUser = await findOrCreateOidcUser(info, ip, config.approveRequired);
      if (!localUser) {
        redirectToLogin(res, "user_create_failed");
        return;
      }

      // 已被管理员禁用的账号不允许登录（含 approve_required 新注册的）
      if (localUser.status !== "active") {
        await db.recordLogin({
          userId: localUser.id,
          username: localUser.username,
          ip,
          userAgent: typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : undefined,
          success: false,
        });
        redirectToLogin(res, "account_pending_approval");
        return;
      }

      // 记录登录日志
      await db.recordLogin({
        userId: localUser.id,
        username: localUser.username,
        ip,
        userAgent: typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : undefined,
        success: true,
      });

      // 签发本地会话 Cookie，复用 LOCAL_COOKIE_NAME
      const sessionToken = await signSession({
        uid: localUser.id,
        username: localUser.username,
        role: localUser.role,
      });
      res.cookie(LOCAL_COOKIE_NAME, sessionToken, {
        ...localCookieOptions(req),
        maxAge: 7 * 24 * 3600 * 1000,
      });

      const safeRedirect = isSafeRedirect(stored.r) ? stored.r : "/workspace";
      res.redirect(302, safeRedirect);
    } catch (error) {
      console.error("[OIDC] callback failed:", error);
      redirectToLogin(res, "callback_error");
    }
  });
}

/** 从请求构造 origin（协议+host），用于 redirect_uri */
function originFromReq(req: Request): string {
  const proto = isSecureRequest(req) ? "https" : "http";
  const host = req.headers["x-forwarded-host"] || req.headers.host || "localhost";
  return `${proto}://${host}`;
}

/** 防止开放重向：只允许相对路径 */
function isSafeRedirect(target: string): boolean {
  return target.startsWith("/") && !target.startsWith("//");
}

/** 仅解析 id_token 的 payload 部分（不验签，token 来自受信的 token 端点） */
function parseIdTokenSub(idToken?: string): OidcUserInfo {
  if (!idToken) return { sub: "" };
  try {
    const parts = idToken.split(".");
    if (parts.length < 2) return { sub: "" };
    const payload = JSON.parse(
      Buffer.from(parts[1], "base64url").toString("utf-8")
    ) as Partial<OidcUserInfo>;
    return {
      sub: payload.sub ?? "",
      name: payload.name,
      email: payload.email,
      preferredUsername: payload.preferredUsername,
    };
  } catch {
    return { sub: "" };
  }
}
