import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  authEnabled,
  verifyPassword,
  createSessionToken,
  verifySessionToken,
  SESSION_TTL_MS,
} from "../src/lib/auth";

const ORIG = { ...process.env };

beforeEach(() => {
  delete process.env.APP_PASSWORD;
  delete process.env.AUTH_SECRET;
});

afterEach(() => {
  process.env = { ...ORIG };
});

describe("authEnabled", () => {
  it("is off when APP_PASSWORD is unset or blank", () => {
    expect(authEnabled()).toBe(false);
    process.env.APP_PASSWORD = "   ";
    expect(authEnabled()).toBe(false);
  });

  it("is on when APP_PASSWORD is set", () => {
    process.env.APP_PASSWORD = "hunter2";
    expect(authEnabled()).toBe(true);
  });
});

describe("verifyPassword", () => {
  it("accepts the exact password and rejects everything else", () => {
    process.env.APP_PASSWORD = "s3cret-pass";
    expect(verifyPassword("s3cret-pass")).toBe(true);
    expect(verifyPassword("wrong")).toBe(false);
    expect(verifyPassword("s3cret-pas")).toBe(false); // prefix
    expect(verifyPassword("")).toBe(false);
  });

  it("rejects when no password is configured", () => {
    expect(verifyPassword("")).toBe(false);
    expect(verifyPassword("anything")).toBe(false);
  });
});

describe("session tokens", () => {
  it("round-trips a freshly created token", async () => {
    process.env.APP_PASSWORD = "pw";
    const token = await createSessionToken();
    expect(await verifySessionToken(token)).toBe(true);
  });

  it("rejects a tampered signature", async () => {
    process.env.APP_PASSWORD = "pw";
    const token = await createSessionToken();
    const tampered = token.slice(0, -2) + (token.endsWith("a") ? "bb" : "aa");
    expect(await verifySessionToken(tampered)).toBe(false);
  });

  it("rejects a token signed with a different secret", async () => {
    process.env.AUTH_SECRET = "secret-one";
    const token = await createSessionToken();
    process.env.AUTH_SECRET = "secret-two";
    expect(await verifySessionToken(token)).toBe(false);
  });

  it("rejects empty / malformed tokens", async () => {
    process.env.APP_PASSWORD = "pw";
    expect(await verifySessionToken(null)).toBe(false);
    expect(await verifySessionToken(undefined)).toBe(false);
    expect(await verifySessionToken("")).toBe(false);
    expect(await verifySessionToken("no-dot")).toBe(false);
    expect(await verifySessionToken(".onlysig")).toBe(false);
  });

  it("rejects an expired token", async () => {
    process.env.APP_PASSWORD = "pw";
    const token = await createSessionToken();
    // Fast-forward past the TTL.
    const realNow = Date.now;
    try {
      Date.now = () => realNow() + SESSION_TTL_MS + 1000;
      expect(await verifySessionToken(token)).toBe(false);
    } finally {
      Date.now = realNow;
    }
  });
});
