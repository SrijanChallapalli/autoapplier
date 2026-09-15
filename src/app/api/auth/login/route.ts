import { NextResponse } from "next/server";
import {
  authEnabled,
  verifyPassword,
  createSessionToken,
  COOKIE_NAME,
  SESSION_TTL_MS,
} from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  // If the gate isn't configured, there's nothing to log in to.
  if (!authEnabled()) {
    return NextResponse.json({ ok: true, enabled: false });
  }

  let password = "";
  try {
    const body = await req.json();
    if (typeof body?.password === "string") password = body.password;
  } catch {
    // fall through with empty password -> rejected below
  }

  if (!verifyPassword(password)) {
    return NextResponse.json({ error: "Incorrect password." }, { status: 401 });
  }

  const token = await createSessionToken();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
  return res;
}
