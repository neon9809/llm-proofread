import { describe, expect, it } from "vitest";
import {
  hashPassword,
  verifyPassword,
  signSession,
  verifySession,
  generateApiToken,
  generateRandomPassword,
  getClientIp,
} from "./localAuth";

describe("password hashing", () => {
  it("hashes and verifies password", async () => {
    const hash = await hashPassword("secret123");
    expect(hash).not.toBe("secret123");
    expect(await verifyPassword("secret123", hash)).toBe(true);
    expect(await verifyPassword("wrong", hash)).toBe(false);
  });
});

describe("local session JWT", () => {
  it("signs and verifies a session", async () => {
    const jwt = await signSession({ uid: 1, username: "admin", role: "admin" });
    const payload = await verifySession(jwt);
    expect(payload?.uid).toBe(1);
    expect(payload?.role).toBe("admin");
  });

  it("rejects tampered tokens", async () => {
    const jwt = await signSession({ uid: 1, username: "admin", role: "admin" });
    const bad = await verifySession(jwt + "x");
    expect(bad).toBeNull();
  });
});

describe("token & password generators", () => {
  it("generates pk_ prefixed tokens", () => {
    const t = generateApiToken();
    expect(t.startsWith("pk_")).toBe(true);
    expect(t.length).toBeGreaterThan(20);
  });

  it("generates random passwords of requested length", () => {
    const p = generateRandomPassword(16);
    expect(p).toHaveLength(16);
    expect(generateRandomPassword(16)).not.toBe(p);
  });
});

describe("getClientIp", () => {
  it("prefers x-forwarded-for first hop", () => {
    const req = {
      headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" },
      socket: { remoteAddress: "9.9.9.9" },
    } as never;
    expect(getClientIp(req)).toBe("1.2.3.4");
  });

  it("falls back to socket remote address", () => {
    const req = { headers: {}, socket: { remoteAddress: "9.9.9.9" } } as never;
    expect(getClientIp(req)).toBe("9.9.9.9");
  });
});
