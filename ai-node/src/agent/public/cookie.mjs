import { randomBytes } from "node:crypto";

export const DEFAULT_COOKIE_NAME = "snn_agent_owner";

/** Generate high-entropy ownership token (64 hex chars = 32 bytes). */
export function generateOwnerToken() {
  return randomBytes(32).toString("hex");
}

/** Parse Cookie header into map. */
export function parseCookies(cookieHeader) {
  const out = new Map();
  if (typeof cookieHeader !== "string" || cookieHeader.length === 0) return out;
  for (const part of cookieHeader.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const name = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    // cookie value may be quoted; strip
    const unquoted = value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1) : value;
    try { out.set(name, decodeURIComponent(unquoted)); } catch { out.set(name, unquoted); }
  }
  return out;
}

export function getOwnerTokenFromRequest(request, cookieName = DEFAULT_COOKIE_NAME) {
  const cookies = parseCookies(request.headers.cookie);
  // also check __Host- prefix variant for secure production
  const raw = cookies.get(cookieName) ?? cookies.get(`__Host-${cookieName}`);
  if (typeof raw !== "string" || raw.length === 0) return undefined;
  // basic format check: 64 hex chars
  if (!/^[a-f0-9]{64}$/i.test(raw)) return undefined;
  return raw.toLowerCase();
}

/**
 * Build Set-Cookie header value.
 * Production must be Secure, SameSite=Strict, HttpOnly, Path=/api/agent, host-only (no Domain).
 * Dev over plain http cannot use Secure, so caller decides via `secure` flag.
 */
export function buildOwnerCookie(token, { cookieName = DEFAULT_COOKIE_NAME, secure = false, sameSite = "Strict", path = "/api/agent", maxAgeSeconds } = {}) {
  if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token)) throw new TypeError("owner token must be 64 hex");
  const name = secure ? `__Host-${cookieName}` : cookieName;
  // __Host- requires Secure, Path=/, no Domain - we use Path=/api/agent which violates __Host spec (must be Path=/). So for __Host we must use Path=/.
  // To keep host-only + Strict, we will use Path=/ if secure, else /api/agent.
  const effectivePath = secure ? "/" : path;
  const parts = [`${name}=${encodeURIComponent(token)}`, `Path=${effectivePath}`, "HttpOnly", `SameSite=${sameSite}`];
  if (secure) parts.push("Secure");
  if (Number.isInteger(maxAgeSeconds) && maxAgeSeconds > 0) parts.push(`Max-Age=${maxAgeSeconds}`);
  // no Domain, host-only
  return parts.join("; ");
}

export function clearOwnerCookie({ cookieName = DEFAULT_COOKIE_NAME, secure = false } = {}) {
  const name = secure ? `__Host-${cookieName}` : cookieName;
  const effectivePath = secure ? "/" : "/api/agent";
  const parts = [`${name}=`, `Path=${effectivePath}`, "HttpOnly", "SameSite=Strict", "Max-Age=0"];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}
