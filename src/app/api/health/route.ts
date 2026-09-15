import { NextResponse } from "next/server";
import { listApplications, listJobs } from "@/lib/store";
import { aiStatus } from "@/lib/service";
import pkg from "../../../../package.json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  // Storage is Postgres when a connection string is present, else file-based —
  // mirrors the selection logic in lib/db/backend.ts without importing internals.
  const storage =
    process.env.DATABASE_URL || process.env.POSTGRES_URL ? "postgres" : "file";

  try {
    const [jobs, apps] = await Promise.all([listJobs(), listApplications()]);
    return NextResponse.json({
      ok: true,
      version: pkg.version,
      env: process.env.NODE_ENV ?? "unknown",
      storage,
      jobs: jobs.length,
      applications: apps.length,
      ai: aiStatus().enabled,
      uptimeSeconds: Math.round(process.uptime()),
      time: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        version: pkg.version,
        storage,
        error: err instanceof Error ? err.message : "unknown error",
      },
      { status: 500 },
    );
  }
}
