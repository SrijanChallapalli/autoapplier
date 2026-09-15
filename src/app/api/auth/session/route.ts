import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { authEnabled, verifySessionToken, COOKIE_NAME } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Lets the client know whether the gate is on and whether it's signed in,
// so the UI can show a "Sign out" control only when it makes sense.
export async function GET() {
  if (!authEnabled()) {
    return NextResponse.json({ enabled: false, authenticated: false });
  }
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  const authenticated = await verifySessionToken(token);
  return NextResponse.json({ enabled: true, authenticated });
}
