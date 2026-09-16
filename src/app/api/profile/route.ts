import { NextResponse } from "next/server";
import { getProfile, saveProfile } from "@/lib/store";
import { rematchAll } from "@/lib/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await getProfile());
}

export async function PUT(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }
  // saveProfile normalizes the shape, so a partial/malformed object is coerced
  // to a valid profile rather than corrupting the store.
  const saved = await saveProfile(body as never);
  // Profile changes affect every match — recompute.
  await rematchAll();
  return NextResponse.json(saved);
}
