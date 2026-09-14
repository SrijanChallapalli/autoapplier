import { NextResponse } from "next/server";
import { draftAnswerForApplication } from "@/lib/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 45;

// POST { question: string } -> { draft } | { error }
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const question = (body.question ?? "").toString().trim();
  if (!question) {
    return NextResponse.json({ error: "question is required" }, { status: 400 });
  }
  const result = await draftAnswerForApplication(id, question);
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json(result);
}
