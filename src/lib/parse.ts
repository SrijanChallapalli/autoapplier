import type { Job } from "./types";
import { newId } from "./store";
import { extractSkills } from "./skills";

// ---------------------------------------------------------------------------
// Turn raw pasted text (a job description, optionally with a URL) into a
// structured Job. Fully deterministic so it works with no API key. The optional
// LLM pass in ai.ts can refine company/title when this heuristic is unsure.
// ---------------------------------------------------------------------------

export interface ParseInput {
  text: string;
  url?: string;
  company?: string;
  title?: string;
  location?: string;
}

const SENIORITY_PATTERNS: {
  level: NonNullable<Job["seniority"]>;
  re: RegExp;
}[] = [
  { level: "internship", re: /\b(intern|internship|co-?op)\b/i },
  { level: "new-grad", re: /\b(new ?grad|university grad|early career|entry[- ]level)\b/i },
  { level: "senior", re: /\b(senior|sr\.?|staff|principal|lead)\b/i },
  { level: "mid", re: /\b(mid[- ]level|ii\b|iii\b)\b/i },
  { level: "junior", re: /\b(junior|jr\.?|associate)\b/i },
];

function detectSeniority(text: string): Job["seniority"] {
  for (const { level, re } of SENIORITY_PATTERNS) {
    if (re.test(text)) return level;
  }
  return "unknown";
}

function detectMinYears(text: string): number | undefined {
  // Only count a year figure that actually refers to a work-experience
  // requirement. Bare year counts ("graduate within 3 years", "a 4-year
  // degree", "over the last 2 years") must NOT produce a spurious blocker.
  const years: number[] = [];
  const push = (raw: string) => {
    const n = parseInt(raw, 10);
    if (!Number.isNaN(n) && n >= 1 && n <= 20) years.push(n);
  };
  // "3+ years" — the explicit plus is a strong minimum-requirement signal.
  for (const m of text.matchAll(/(\d+)\s*\+\s*years?/gi)) push(m[1]);
  // "5 years of professional experience", "2 years' industry experience".
  for (const m of text.matchAll(
    /(\d+)\s*years?(?:['’]s)?\s+(?:of\s+)?(?:[\w-]+\s+){0,3}?(?:experience|exp\b|industry|professional|working|hands-on)/gi,
  ))
    push(m[1]);
  // Reverse order: "experience: at least 3 years", "experience of 5+ years".
  for (const m of text.matchAll(/experience\b[^.\n]{0,30}?(\d+)\s*\+?\s*years?/gi))
    push(m[1]);
  if (years.length === 0) return undefined;
  return Math.min(...years);
}

function detectSalary(text: string): string | undefined {
  // A currency-prefixed amount: symbol ($ £ €) or ISO code (USD/GBP/EUR/CAD),
  // an optional range, an optional k suffix, and an optional per-period tail.
  // "up to $120k", "$90,000–$120,000/yr", "USD 100k - 130k per year".
  const amount = String.raw`\d{2,3}(?:,\d{3})?(?:\s?[kK])?`;
  const re = new RegExp(
    String.raw`(?:up to\s*)?(?:[$£€]|\b(?:USD|GBP|EUR|CAD|AUD)\b)\s?${amount}` +
      String.raw`(?:\s?[-–—]+\s?|\s+to\s+)?(?:[$£€]\s?)?(?:${amount})?` +
      String.raw`(?:\s?(?:\/|per)\s?(?:year|yr|hour|hr|month|mo))?`,
    "i",
  );
  const m = text.match(re);
  return m ? m[0].replace(/\s+/g, " ").trim() : undefined;
}

// Try to split a description into required vs nice-to-have sections.
function splitRequirements(text: string): { required: string; nice: string } {
  const lower = text.toLowerCase();
  const niceIdx = lower.search(
    /(nice to have|preferred qualifications|bonus|pluses|a plus|preferred:|nice-to-have)/,
  );
  if (niceIdx === -1) return { required: text, nice: "" };
  return { required: text.slice(0, niceIdx), nice: text.slice(niceIdx) };
}

function guessTitleAndCompany(text: string): {
  title?: string;
  company?: string;
} {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  let title: string | undefined;
  let company: string | undefined;

  // "<Title> at <Company>"
  for (const line of lines.slice(0, 8)) {
    const at = line.match(/^(.{3,80}?)\s+(?:at|@|·|\|)\s+(.{2,60})$/i);
    if (at) {
      title = title ?? at[1].trim();
      company = company ?? at[2].trim();
      break;
    }
  }

  // First short-ish line that looks like a role title
  if (!title) {
    const roleLine = lines.find((l) =>
      /(engineer|developer|scientist|intern|analyst|researcher|internship)/i.test(
        l,
      ) && l.length < 90,
    );
    if (roleLine) title = roleLine.replace(/\s+at\s+.*/i, "").trim();
  }

  return { title, company };
}

export function parseJob(input: ParseInput): Job {
  const text = input.text.trim();
  const { required, nice } = splitRequirements(text);

  const requiredSkills = extractSkills(required);
  const niceSet = new Set(extractSkills(nice));
  // Skills only mentioned in the nice-to-have block shouldn't count as required.
  const requiredOnly = requiredSkills.filter((s) => !niceSet.has(s));

  const guess = guessTitleAndCompany(text);

  return {
    id: newId("job"),
    company: input.company?.trim() || guess.company || "Unknown company",
    title: input.title?.trim() || guess.title || "Untitled role",
    location: input.location?.trim() || detectLocation(text),
    remote: /\bremote\b/i.test(text),
    url: input.url?.trim() || undefined,
    description: text,
    requiredSkills: requiredOnly.length ? requiredOnly : requiredSkills,
    niceToHaveSkills: Array.from(niceSet),
    minYearsExperience: detectMinYears(text),
    requiresClearance:
      /\b(security clearance|ts\/sci|secret clearance|active clearance)\b/i.test(
        text,
      ),
    requiresCitizenship:
      /\b(u\.?s\.? citizen(ship)?( required| is required)?|must be a citizen)\b/i.test(
        text,
      ),
    sponsorshipOffered: detectSponsorship(text),
    salaryText: detectSalary(text),
    seniority: detectSeniority(text),
    source: input.url ? "url" : "paste",
    createdAt: new Date().toISOString(),
  };
}

function detectLocation(text: string): string | undefined {
  if (/\bremote\b/i.test(text)) return "Remote";
  // "Location: San Francisco, CA"
  const m = text.match(/location[:\s]+([A-Za-z .,'-]{2,40})/i);
  if (m) return m[1].trim();
  // "San Francisco, CA" style near the top
  const cityState = text
    .split("\n")
    .slice(0, 6)
    .join(" ")
    .match(/([A-Z][a-zA-Z .'-]+,\s*[A-Z]{2})\b/);
  return cityState ? cityState[1] : undefined;
}

function detectSponsorship(text: string): boolean | null {
  if (
    /\b(no sponsorship|not able to sponsor|do not (offer|provide) sponsorship|unable to sponsor|without sponsorship)\b/i.test(
      text,
    )
  )
    return false;
  if (
    /\b(sponsorship (is )?available|will sponsor|visa sponsorship (is )?(offered|available))\b/i.test(
      text,
    )
  )
    return true;
  return null;
}
