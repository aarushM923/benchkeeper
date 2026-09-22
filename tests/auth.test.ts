import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// next/headers and next/navigation only matter for the cookie helpers, which
// these tests don't call.
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

const { adminEnabled, checkPassword, makeSessionToken, verifySessionToken } = await import("@/lib/auth");

describe("admin session tokens", () => {
  const original = process.env.ADMIN_PASSWORD;
  beforeEach(() => {
    process.env.ADMIN_PASSWORD = "correct horse battery";
  });
  afterEach(() => {
    process.env.ADMIN_PASSWORD = original;
  });

  it("checks the password", () => {
    expect(checkPassword("correct horse battery")).toBe(true);
    expect(checkPassword("correct horse batter")).toBe(false);
    expect(checkPassword("")).toBe(false);
  });

  it("accepts a fresh token", () => {
    expect(verifySessionToken(makeSessionToken())).toBe(true);
  });

  it("rejects tampered, garbage, and missing tokens", () => {
    const [expires, mac] = makeSessionToken().split(".");
    expect(verifySessionToken(`${Number(expires) + 1_000_000}.${mac}`)).toBe(false); // extended expiry
    expect(verifySessionToken(`${expires}.${mac.slice(0, -2)}xx`)).toBe(false);
    expect(verifySessionToken("not-a-token")).toBe(false);
    expect(verifySessionToken(undefined)).toBe(false);
  });

  it("rejects an expired token", () => {
    const token = makeSessionToken(Date.now() - 9 * 60 * 60 * 1000); // issued 9h ago, 8h lifetime
    expect(verifySessionToken(token)).toBe(false);
  });

  it("changing the password invalidates existing sessions", () => {
    const token = makeSessionToken();
    process.env.ADMIN_PASSWORD = "a different password";
    expect(verifySessionToken(token)).toBe(false);
  });

  it("is disabled — never defaulted — when the password is unset or too short", () => {
    for (const pw of [undefined, "", "short"]) {
      if (pw === undefined) delete process.env.ADMIN_PASSWORD;
      else process.env.ADMIN_PASSWORD = pw;
      expect(adminEnabled()).toBe(false);
      expect(checkPassword(pw ?? "")).toBe(false);
      expect(() => makeSessionToken()).toThrow();
    }
  });
});
