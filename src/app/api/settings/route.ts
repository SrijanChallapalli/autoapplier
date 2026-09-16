import { NextResponse } from "next/server";
import { getSettings, saveSettings } from "@/lib/store";
import type { CompanyBoard, Settings } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_ATS = new Set(["greenhouse", "ashby", "lever"]);

export async function GET() {
  return NextResponse.json(await getSettings());
}

export async function PUT(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Partial<Settings>;

  // Validate the company list so a bad entry can't break fetching.
  const companies: CompanyBoard[] = Array.isArray(body.companies)
    ? body.companies
        .filter(
          (c): c is CompanyBoard =>
            !!c &&
            typeof c.name === "string" &&
            typeof c.token === "string" &&
            VALID_ATS.has(c.ats),
        )
        .map((c) => ({
          name: c.name.trim(),
          ats: c.ats,
          token: c.token.trim().toLowerCase(),
        }))
        .filter((c) => c.name && c.token)
    : [];

  const current = await getSettings();
  const saved = await saveSettings({
    companies: companies.length ? companies : current.companies,
    internOnly:
      typeof body.internOnly === "boolean"
        ? body.internOnly
        : current.internOnly,
    fetchKeywords: Array.isArray(body.fetchKeywords)
      ? body.fetchKeywords.map((k) => String(k).trim()).filter(Boolean)
      : current.fetchKeywords,
    updatedAt: current.updatedAt,
  });
  return NextResponse.json(saved);
}
