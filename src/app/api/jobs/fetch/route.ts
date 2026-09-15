import { NextResponse } from "next/server";
import { ingestLiveJobs } from "@/lib/service";
import { withAiCredentials } from "@/lib/aiContext";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Pulling ~30 boards can take a while; allow headroom.
export const maxDuration = 60;

// POST { internOnly?: boolean, keywords?: string[] }
// Pulls live postings from official ATS APIs, matches them, and saves new ones.
export async function POST(req: Request) {
  let body: { internOnly?: boolean; keywords?: string[] } = {};
  try {
    body = await req.json();
  } catch {
    // empty body is fine
  }
  const summary = await withAiCredentials(req, () =>
    ingestLiveJobs({
      internOnly: body.internOnly,
      keywords: body.keywords,
    }),
  );
  return NextResponse.json(summary);
}
