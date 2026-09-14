import { NextResponse } from "next/server";
import { prepareTopMatches } from "@/lib/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST { limit?: number } -> prepares applications for the top matches.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const limit = Number.isFinite(body.limit) ? Math.min(50, body.limit) : 12;
  const result = await prepareTopMatches(limit);
  return NextResponse.json(result);
}
