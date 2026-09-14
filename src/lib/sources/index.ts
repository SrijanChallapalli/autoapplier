import { htmlToText } from "../html";
import { DEFAULT_COMPANIES, type CompanyBoard } from "./companies";

// ---------------------------------------------------------------------------
// Live job ingestion from official public ATS APIs (Greenhouse, Ashby, Lever).
// Each fetcher returns normalized RawPosting objects; the service layer then
// parses + matches them like any pasted posting.
// ---------------------------------------------------------------------------

export interface RawPosting {
  company: string;
  title: string;
  location?: string;
  remote?: boolean;
  url?: string;
  text: string;
}

export interface IngestOptions {
  companies?: CompanyBoard[];
  // Only keep roles whose title looks like an internship / early-career tech
  // role. On by default so we don't pull senior/unrelated postings.
  internOnly?: boolean;
  // Extra keywords the title (or description) must contain (any match).
  keywords?: string[];
  perCompanyLimit?: number;
}

const TIMEOUT = 15_000;

async function getJson(url: string): Promise<unknown | null> {
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// --- Per-ATS fetchers -------------------------------------------------------

async function fetchGreenhouse(c: CompanyBoard): Promise<RawPosting[]> {
  const data = (await getJson(
    `https://boards-api.greenhouse.io/v1/boards/${c.token}/jobs?content=true`,
  )) as { jobs?: GhJob[] } | null;
  if (!data?.jobs) return [];
  return data.jobs.map((j) => ({
    company: c.name,
    title: j.title ?? "",
    location: j.location?.name,
    url: j.absolute_url,
    text: htmlToText(j.content ?? ""),
  }));
}

async function fetchAshby(c: CompanyBoard): Promise<RawPosting[]> {
  const data = (await getJson(
    `https://api.ashbyhq.com/posting-api/job-board/${c.token}`,
  )) as { jobs?: AshbyJob[] } | null;
  if (!data?.jobs) return [];
  return data.jobs.map((j) => ({
    company: c.name,
    title: j.title ?? "",
    location: j.location,
    remote: j.isRemote,
    url: j.jobUrl ?? j.applyUrl,
    text: j.descriptionPlain || htmlToText(j.descriptionHtml ?? ""),
  }));
}

async function fetchLever(c: CompanyBoard): Promise<RawPosting[]> {
  const data = (await getJson(
    `https://api.lever.co/v0/postings/${c.token}?mode=json`,
  )) as LeverJob[] | null;
  if (!Array.isArray(data)) return [];
  return data.map((j) => ({
    company: c.name,
    title: j.text ?? "",
    location: j.categories?.location,
    remote: j.workplaceType === "remote",
    url: j.hostedUrl ?? j.applyUrl,
    text: j.descriptionPlain || htmlToText(j.description ?? ""),
  }));
}

function fetchBoard(c: CompanyBoard): Promise<RawPosting[]> {
  if (c.ats === "greenhouse") return fetchGreenhouse(c);
  if (c.ats === "ashby") return fetchAshby(c);
  return fetchLever(c);
}

// --- Relevance filter -------------------------------------------------------

const INTERN_RE = /\b(intern|internship|co-?op|new ?grad|early career|university grad|graduate (program|engineer|role)|apprentice)\b/i;
// A tech role is identified by its TITLE (description mentions of "software
// engineers" shouldn't pull in the recruiter hiring them).
const TECH_RE =
  /\b(software|engineer|engineering|developer|machine learning|\bml\b|\bai\b|artificial intelligence|data scien|data engineer|research (scientist|engineer)|backend|back[- ]?end|frontend|front[- ]?end|full[- ]?stack|infrastructure|platform|\bswe\b|programmer|robotics|security engineer)\b/i;
// Non-engineering functions to exclude even when they say "early career".
const EXCLUDE_RE =
  /\b(recruit|recruiting|recruiter|talent|sourcer|sales|account (executive|manager)|customer (success|experience)|marketing|people|hr\b|program manager|business|operations|finance|accounting|legal|communications|community|partnerships?|design(er)?|content|brand|support associate)\b/i;

function isRelevant(p: RawPosting, opts: IngestOptions): boolean {
  const hay = `${p.title} ${p.text.slice(0, 400)}`;
  // Intern/early-career must be in the TITLE, so full-time roles whose
  // descriptions merely mention an internship program don't leak in.
  if (opts.internOnly !== false && !INTERN_RE.test(p.title)) return false;
  if (EXCLUDE_RE.test(p.title)) return false;
  if (opts.keywords && opts.keywords.length) {
    const kw = opts.keywords.map((k) => k.toLowerCase());
    const low = hay.toLowerCase();
    if (!kw.some((k) => low.includes(k))) return false;
  }
  // The title itself must read as a tech role.
  return TECH_RE.test(p.title);
}

// --- Public entrypoint ------------------------------------------------------

export interface IngestResult {
  postings: RawPosting[];
  companiesTried: number;
  companiesReturned: number;
}

export async function fetchLivePostings(
  opts: IngestOptions = {},
): Promise<IngestResult> {
  const companies = opts.companies ?? DEFAULT_COMPANIES;
  const limit = opts.perCompanyLimit ?? 25;

  const results = await Promise.allSettled(
    companies.map((c) => fetchBoard(c)),
  );

  const postings: RawPosting[] = [];
  let companiesReturned = 0;
  results.forEach((r) => {
    if (r.status !== "fulfilled" || r.value.length === 0) return;
    companiesReturned++;
    const relevant = r.value
      .filter((p) => p.title && p.text && isRelevant(p, opts))
      .slice(0, limit);
    postings.push(...relevant);
  });

  return {
    postings,
    companiesTried: companies.length,
    companiesReturned,
  };
}

// --- Upstream response shapes (partial) ------------------------------------

interface GhJob {
  title?: string;
  location?: { name?: string };
  absolute_url?: string;
  content?: string;
}
interface AshbyJob {
  title?: string;
  location?: string;
  isRemote?: boolean;
  jobUrl?: string;
  applyUrl?: string;
  descriptionPlain?: string;
  descriptionHtml?: string;
}
interface LeverJob {
  text?: string;
  categories?: { location?: string };
  workplaceType?: string;
  hostedUrl?: string;
  applyUrl?: string;
  descriptionPlain?: string;
  description?: string;
}
