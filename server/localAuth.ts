/**
 * 自建密码认证：本地用户名/密码登录，JWT 会话，登录 IP 记录。
 */
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import type { Request } from "express";

export const LOCAL_COOKIE_NAME = "proofread_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 天

export const DEFAULT_ADMIN_USERNAME = "admin";

/** 生成随机初始密码（用于容器首次启动时的管理员账号） */
export function generateRandomPassword(length = 16): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let pwd = "";
  for (let i = 0; i < bytes.length; i++) pwd += chars[bytes[i] % chars.length];
  return pwd;
}

function getSecret(): Uint8Array {
  return new TextEncoder().encode(process.env.JWT_SECRET || "dev-secret-change-me");
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export interface SessionPayload {
  uid: number;
  username: string;
  role: "user" | "admin";
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(getSecret());
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (typeof payload.uid === "number" && typeof payload.username === "string") {
      return {
        uid: payload.uid,
        username: payload.username,
        role: payload.role === "admin" ? "admin" : "user",
      };
    }
  } catch {
    /* invalid token */
  }
  return null;
}

/** 提取客户端真实 IP（兼容反向代理） */
export function getClientIp(req: Request): string {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.length > 0) {
    return xff.split(",")[0].trim();
  }
  const xri = req.headers["x-real-ip"];
  if (typeof xri === "string" && xri.length > 0) return xri.trim();
  return req.socket?.remoteAddress || req.ip || "unknown";
}

/** 生成 API Token（管理员用） */
export function generateApiToken(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let token = "pk_";
  const bytes = new Uint8Array(40);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < bytes.length; i++) token += chars[bytes[i] % chars.length];
  return token;
}
