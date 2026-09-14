import { NextResponse } from "next/server";
import { getProfile, saveProfile } from "@/lib/store";
import { rematchAll } from "@/lib/service";
import type { Profile } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await getProfile());
}

export async function PUT(req: Request) {
  const body = (await req.json()) as Profile;
  const saved = await saveProfile(body);
  // Profile changes affect every match — recompute in the background.
  await rematchAll();
  return NextResponse.json(saved);
}
