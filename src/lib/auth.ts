// Demo-grade admin auth (SPEC §2): one shared password from ADMIN_PASSWORD,
// no user accounts. The README says so plainly.
//
// Session cookie = "<expiresAtMs>.<hmac>", HMAC-SHA256 keyed by the admin
// password, so changing the password logs everyone out. If ADMIN_PASSWORD is
// unset, admin is disabled — there is no default password.
//
// requireAdmin() is the Data Access Layer check: every admin page, Server
// Action, and route handler calls it next to the data it protects, rather than
// relying on a layout or proxy (layouts don't re-run on client navigation).

import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const COOKIE = "bk_admin";
const SESSION_MS = 8 * 60 * 60 * 1000;

function secret(): string | null {
  const pw = process.env.ADMIN_PASSWORD;
  return pw && pw.length >= 8 ? pw : null;
}

export function adminEnabled(): boolean {
  return secret() !== null;
}

function sign(payload: string, key: string): string {
  return createHmac("sha256", key).update(payload).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  // Hash first so lengths always match and timing doesn't leak length.
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

export function checkPassword(candidate: string): boolean {
  const key = secret();
  return key !== null && safeEqual(candidate, key);
}

export function verifySessionToken(token: string | undefined, now = Date.now()): boolean {
  const key = secret();
  if (!key || !token) return false;
  const [expires, mac] = token.split(".");
  if (!expires || !mac || !/^\d+$/.test(expires)) return false;
  if (!safeEqual(mac, sign(expires, key))) return false;
  return Number(expires) > now;
}

export function makeSessionToken(now = Date.now()): string {
  const key = secret();
  if (!key) throw new Error("ADMIN_PASSWORD is not configured");
  const expires = String(now + SESSION_MS);
  return `${expires}.${sign(expires, key)}`;
}

export async function startSession() {
  (await cookies()).set(COOKIE, makeSessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MS / 1000,
  });
}

export async function endSession() {
  (await cookies()).delete(COOKIE);
}

export async function isAdmin(): Promise<boolean> {
  return verifySessionToken((await cookies()).get(COOKIE)?.value);
}

/** Call at the top of every admin page, action, and route handler. */
export async function requireAdmin(): Promise<void> {
  if (!(await isAdmin())) redirect("/admin/login");
}
