import { NextResponse } from "next/server";
import { importAndMatch } from "@/lib/service";
import { withAiCredentials } from "@/lib/aiContext";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Body: { text: string, url?, company?, title?, location? }
// Accepts one posting or, if `text` contains multiple separated by a line of
// three or more dashes, splits them into several jobs.
export async function POST(req: Request) {
  return withAiCredentials(req, () => handleImport(req));
}

async function handleImport(req: Request) {
  const body = await req.json().catch(() => ({}));
  const text: string = (body.text ?? "").toString();
  const url: string | undefined = body.url?.toString().trim() || undefined;

  // Allow URL-only imports (the server fetches and parses the posting).
  if (!text.trim() && !url) {
    return NextResponse.json(
      { error: "Provide a job description or a URL" },
      { status: 400 },
    );
  }

  if (!text.trim() && url) {
    const job = await importAndMatch({ text: "", url });
    if (job.description.length < 40) {
      return NextResponse.json(
        {
          error:
            "Couldn't extract this posting automatically — paste the description text instead.",
        },
        { status: 422 },
      );
    }
    return NextResponse.json({ jobs: [job] });
  }

  const chunks = text.split(/\n-{3,}\n/).map((c) => c.trim()).filter(Boolean);
  const jobs = [];
  for (const chunk of chunks.length ? chunks : [text]) {
    const job = await importAndMatch({
      text: chunk,
      url,
      company: chunks.length > 1 ? undefined : body.company,
      title: chunks.length > 1 ? undefined : body.title,
      location: body.location,
    });
    jobs.push(job);
  }

  return NextResponse.json({ jobs });
}
