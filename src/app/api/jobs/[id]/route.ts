import { NextResponse } from "next/server";
import { deleteJob, getJob, upsertJob } from "@/lib/store";
import { recordSignal } from "@/lib/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const job = await getJob(id);
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(job);
}

// PATCH to dismiss/undismiss. Dismissing feeds the learning loop.
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const job = await getJob(id);
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  if (typeof body.dismissed === "boolean") {
    job.dismissed = body.dismissed;
    job.dismissReason = body.dismissReason ?? job.dismissReason;
    if (body.dismissed) {
      await recordSignal("rejected", {
        company: job.company,
        title: job.title,
        description: job.description,
      });
    }
  }
  await upsertJob(job);
  return NextResponse.json(job);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  await deleteJob(id);
  return NextResponse.json({ ok: true });
}
