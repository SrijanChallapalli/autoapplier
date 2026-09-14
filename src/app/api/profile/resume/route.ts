import { NextResponse } from "next/server";
import { extractResumeText, parseResume } from "@/lib/resume";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 45;

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB

// Accepts multipart/form-data with a "file" field (PDF, .txt, or .md).
// Returns extracted text + suggested skills/links for the user to review.
export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "Upload a file in the 'file' field" },
      { status: 400 },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "File too large (max 8 MB)" },
      { status: 413 },
    );
  }

  try {
    const buf = await file.arrayBuffer();
    const text = await extractResumeText(buf, file.name, file.type);
    const parsed = parseResume(text);
    if (parsed.chars < 30) {
      return NextResponse.json(
        {
          error:
            "Couldn't read text from this file (it may be a scanned image). Try a text-based PDF.",
        },
        { status: 422 },
      );
    }
    return NextResponse.json({
      fileName: file.name,
      skills: parsed.skills,
      emails: parsed.emails,
      links: parsed.links,
      chars: parsed.chars,
      preview: parsed.text.slice(0, 1500),
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to parse the file" },
      { status: 500 },
    );
  }
}
