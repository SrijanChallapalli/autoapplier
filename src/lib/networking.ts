// ---------------------------------------------------------------------------
// "Find people who work there" — WITHOUT scraping LinkedIn (which needs a login
// and violates their ToS). Instead we generate targeted search deep-links the
// user opens in their own logged-in browser: recruiters, people in the role,
// and alumni from their school at that company. Plus a Google fallback.
// ---------------------------------------------------------------------------

export interface NetworkLink {
  label: string;
  url: string;
  desc: string;
}

// Strip internship/seniority/season noise to get the core role for a search.
export function coreRole(title: string): string {
  return (
    title
      .replace(
        /\b(intern(ship)?|co-?op|new ?grad|early career|university grad(uate)?|summer|winter|fall|spring|20\d{2}|senior|sr\.?|junior|jr\.?|staff|principal|lead|[-–—,|].*$)\b/gi,
        " ",
      )
      .replace(/\s{2,}/g, " ")
      .replace(/[-–—,|]\s*$/, "")
      .trim() || title.trim()
  );
}

export function buildNetworkingLinks(
  company: string,
  title: string,
  school?: string,
): NetworkLink[] {
  const enc = encodeURIComponent;
  const role = coreRole(title);
  const peopleSearch = (kw: string) =>
    `https://www.linkedin.com/search/results/people/?keywords=${enc(kw)}`;

  const links: NetworkLink[] = [
    {
      label: `Recruiters at ${company}`,
      url: peopleSearch(`${company} recruiter`),
      desc: "Recruiters and talent partners — the fastest people to reach.",
    },
    {
      label: `University recruiters at ${company}`,
      url: peopleSearch(`${company} university recruiter`),
      desc: "Campus/early-career recruiters who own internship pipelines.",
    },
    {
      label: `${role || "Engineers"} at ${company}`,
      url: peopleSearch(`${company} ${role}`),
      desc: "People doing this role — good for questions and referrals.",
    },
  ];

  if (school && school.trim()) {
    links.push({
      label: `${school} alumni at ${company}`,
      url: peopleSearch(`${company} ${school}`),
      desc: "Alumni from your school — the warmest intro and best referral odds.",
    });
  }

  links.push({
    label: `Google: ${company} recruiters on LinkedIn`,
    url: `https://www.google.com/search?q=${enc(
      `"${company}" (recruiter OR "university recruiter") site:linkedin.com/in`,
    )}`,
    desc: "A web search fallback that often surfaces named recruiters directly.",
  });

  return links;
}
