import { NextResponse } from "next/server";
import { aiStatus } from "@/lib/service";
import { withAiCredentials } from "@/lib/aiContext";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const ai = await withAiCredentials(req, async () => aiStatus());
  return NextResponse.json({ ai });
}
