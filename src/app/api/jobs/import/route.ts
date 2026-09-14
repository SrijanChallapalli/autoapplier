import { NextResponse } from "next/server";
import { importAndMatch } from "@/lib/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Body: { text: string, url?, company?, title?, location? }
// Accepts one posting or, if `text` contains multiple separated by a line of
// three or more dashes, splits them into several jobs.
export async function POST(req: Request) {
  const body = await req.json();
  const text: string = (body.text ?? "").toString();
  if (!text.trim()) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }

  const chunks = text.split(/\n-{3,}\n/).map((c) => c.trim()).filter(Boolean);
  const jobs = [];
  for (const chunk of chunks.length ? chunks : [text]) {
    const job = await importAndMatch({
      text: chunk,
      url: body.url,
      company: chunks.length > 1 ? undefined : body.company,
      title: chunks.length > 1 ? undefined : body.title,
      location: body.location,
    });
    jobs.push(job);
  }

  return NextResponse.json({ jobs });
}
