import { NextResponse } from "next/server";
import { listApplications } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const apps = await listApplications();
  // Newest first.
  apps.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return NextResponse.json(apps);
}
