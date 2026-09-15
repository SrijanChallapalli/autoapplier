import { NextResponse } from "next/server";
import { resumeChatForApplication } from "@/lib/service";
import type { ChatMessage } from "@/lib/ai";
import { withAiCredentials } from "@/lib/aiContext";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST { messages: {role, content}[] } -> { reply }
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const raw = Array.isArray(body.messages) ? body.messages : [];
  const messages: ChatMessage[] = raw
    .filter(
      (m: unknown): m is ChatMessage =>
        !!m &&
        typeof (m as ChatMessage).content === "string" &&
        ["user", "assistant"].includes((m as ChatMessage).role),
    )
    .slice(-20); // cap history

  if (messages.length === 0) {
    return NextResponse.json({ error: "messages required" }, { status: 400 });
  }
  const currentResume =
    typeof body.currentResume === "string" ? body.currentResume : undefined;
  const result = await withAiCredentials(req, () =>
    resumeChatForApplication(id, messages, currentResume),
  );
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json(result);
}
