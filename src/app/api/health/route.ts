import { NextResponse } from "next/server";
import { listApplications, listJobs } from "@/lib/store";
import { aiStatus } from "@/lib/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [jobs, apps] = await Promise.all([listJobs(), listApplications()]);
    return NextResponse.json({
      ok: true,
      jobs: jobs.length,
      applications: apps.length,
      ai: aiStatus().enabled,
      time: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
