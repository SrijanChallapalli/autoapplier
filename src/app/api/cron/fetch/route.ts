import { NextResponse } from "next/server";
import { ingestLiveJobs } from "@/lib/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Hit by the Vercel cron (see vercel.json) to pull fresh jobs on a schedule.
// Protected by CRON_SECRET: Vercel sends `Authorization: Bearer <CRON_SECRET>`.
// If CRON_SECRET is unset (local dev), the endpoint is open for manual testing.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }
  const summary = await ingestLiveJobs();
  return NextResponse.json({ ranAt: new Date().toISOString(), ...summary });
}
