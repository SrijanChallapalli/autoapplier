import { NextResponse } from "next/server";
import { prepareForJob, recordSignal } from "@/lib/service";
import { getJob } from "@/lib/store";
import { withAiCredentials } from "@/lib/aiContext";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Prepare an application for this job (guards against duplicates). Preparing an
// application is an implicit "approve" signal for the learning loop.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { application, error } = await withAiCredentials(req, () =>
    prepareForJob(id),
  );
  if (error) return NextResponse.json({ error }, { status: 409 });

  const job = await getJob(id);
  if (job) {
    await recordSignal("approved", {
      company: job.company,
      title: job.title,
      description: job.description,
    });
  }
  return NextResponse.json({ application });
}
