// ---------------------------------------------------------------------------
// Optional single-password gate for the whole app.
//
// AutoApplier is a personal, single-user tool. When you run it locally you
// don't want a login in the way, so authentication is OFF by default. When you
// deploy it somewhere reachable (e.g. for testing on Vercel), set APP_PASSWORD
// and the gate turns ON: every page and API route then requires you to sign in
// with that password. A successful login gets a signed, httpOnly session
// cookie — the password itself is never stored in the browser.
//
// This module is intentionally dependency-free and uses only Web Crypto
// (globalThis.crypto.subtle) + btoa/atob, so the exact same code runs in the
// Edge middleware and in Node route handlers.
// ---------------------------------------------------------------------------

export const COOKIE_NAME = "autoapplier_session";

// How long a login lasts before you have to sign in again.
export const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

/** True when a password gate is configured (i.e. APP_PASSWORD is set). */
export function authEnabled(): boolean {
  return !!appPassword();
}

function appPassword(): string {
  return (process.env.APP_PASSWORD ?? "").trim();
}

// Key used to sign session cookies. Prefer a dedicated AUTH_SECRET so rotating
// it invalidates sessions independently of the password; fall back to the
// password so the gate works with a single env var set.
function secret(): string {
  return process.env.AUTH_SECRET || appPassword() || "insecure-dev-secret";
}

// --- base64url helpers (binary-safe, no Buffer dependency) -----------------

function bytesToB64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// --- HMAC + constant-time comparison ---------------------------------------

async function hmac(data: string): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return new Uint8Array(sig);
}

/** Length-independent, timing-safe string comparison. */
function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ba = enc.encode(a);
  const bb = enc.encode(b);
  // Compare against the longer length so a length mismatch doesn't short-circuit.
  const len = Math.max(ba.length, bb.length);
  let diff = ba.length ^ bb.length;
  for (let i = 0; i < len; i++) {
    diff |= (ba[i] ?? 0) ^ (bb[i] ?? 0);
  }
  return diff === 0;
}

/** Timing-safe check of a submitted password against APP_PASSWORD. */
export function verifyPassword(password: string): boolean {
  const expected = appPassword();
  if (!expected) return false;
  return timingSafeEqual(password, expected);
}

// --- Session tokens ---------------------------------------------------------
// Token format: `<payloadB64url>.<sigB64url>` where payload is JSON { exp }.

export async function createSessionToken(): Promise<string> {
  const payload = bytesToB64url(
    new TextEncoder().encode(
      JSON.stringify({ exp: Date.now() + SESSION_TTL_MS }),
    ),
  );
  const sig = bytesToB64url(await hmac(payload));
  return `${payload}.${sig}`;
}

export async function verifySessionToken(
  token: string | null | undefined,
): Promise<boolean> {
  if (!token) return false;
  const dot = token.indexOf(".");
  if (dot <= 0) return false;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);

  const expected = bytesToB64url(await hmac(payload));
  if (!timingSafeEqual(sig, expected)) return false;

  try {
    const parsed = JSON.parse(new TextDecoder().decode(b64urlToBytes(payload)));
    return typeof parsed?.exp === "number" && Date.now() < parsed.exp;
  } catch {
    return false;
  }
}
