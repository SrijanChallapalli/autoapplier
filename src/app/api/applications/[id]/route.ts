import { NextResponse } from "next/server";
import {
  deleteApplication,
  getApplication,
  upsertApplication,
} from "@/lib/store";
import { recordSignal } from "@/lib/service";
import type { Application } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const app = await getApplication(id);
  if (!app) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(app);
}

// PATCH accepts a partial Application. Marking as submitted stamps the date;
// moving to interviewing feeds the learning loop.
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const app = await getApplication(id);
  if (!app) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const patch = (await req.json()) as Partial<Application>;
  const next: Application = { ...app, ...patch, id: app.id, jobId: app.jobId };

  if (patch.status === "submitted" && !next.dateApplied) {
    next.dateApplied = new Date().toISOString();
  }
  if (patch.status === "interviewing") {
    await recordSignal("interview", { company: app.company, title: app.title });
  }

  const saved = await upsertApplication(next);
  return NextResponse.json(saved);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  await deleteApplication(id);
  return NextResponse.json({ ok: true });
}
