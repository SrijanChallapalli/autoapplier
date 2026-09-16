import { NextResponse } from "next/server";
import {
  rewriteResumeLine,
  type RewriteAction,
  type RewriteTone,
} from "@/lib/service";
import { withAiCredentials } from "@/lib/aiContext";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 45;

const ACTIONS: RewriteAction[] = ["strengthen", "quantify", "shorten", "match"];
const TONES: RewriteTone[] = ["concise", "impact", "technical", "leadership"];

// POST { text, action, tone } -> { text } — rewrite one resume line, grounded.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const text = typeof body.text === "string" ? body.text : "";
  const action: RewriteAction = ACTIONS.includes(body.action)
    ? body.action
    : "strengthen";
  const tone: RewriteTone = TONES.includes(body.tone) ? body.tone : "concise";

  if (!text.trim()) {
    return NextResponse.json({ error: "text required" }, { status: 400 });
  }

  const result = await withAiCredentials(req, () =>
    rewriteResumeLine(id, text, action, tone),
  );
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json(result);
}
