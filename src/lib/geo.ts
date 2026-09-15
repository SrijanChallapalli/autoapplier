// ---------------------------------------------------------------------------
// Country detection from free-text job locations, plus a "is this location in
// my allowed countries?" check used to restrict findings by country.
// ---------------------------------------------------------------------------

const US_STATES = new Set([
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY","DC",
]);

// Canonical country names we recognize (checked as substrings, longest first).
const COUNTRIES = [
  "United States","United Kingdom","United Arab Emirates","South Korea",
  "Canada","Ireland","Germany","France","Netherlands","Switzerland","Sweden",
  "Norway","Denmark","Finland","Poland","Spain","Portugal","Italy","Belgium",
  "Austria","India","Singapore","Australia","New Zealand","Japan","China",
  "Hong Kong","Taiwan","Israel","Brazil","Mexico","Argentina","Chile",
  "Colombia","South Africa","Nigeria","Kenya","Egypt","Turkey","Ukraine",
  "Romania","Czechia","Greece","Philippines","Indonesia","Vietnam","Thailand",
  "Malaysia",
].sort((a, b) => b.length - a.length);

// Aliases mapped to canonical names.
const ALIASES: Record<string, string> = {
  us: "United States", usa: "United States", "u.s.": "United States",
  "u.s.a.": "United States", "united states": "United States",
  "united states of america": "United States", america: "United States",
  uk: "United Kingdom", "u.k.": "United Kingdom", england: "United Kingdom",
  scotland: "United Kingdom", wales: "United Kingdom", britain: "United Kingdom",
  "great britain": "United Kingdom", uae: "United Arab Emirates",
  korea: "South Korea", roi: "Ireland",
};

export function detectCountry(location?: string): string | undefined {
  if (!location) return undefined;
  const s = location.toLowerCase();

  for (const c of COUNTRIES) {
    if (s.includes(c.toLowerCase())) return c;
  }
  for (const [alias, canon] of Object.entries(ALIASES)) {
    const re = new RegExp(`(^|[^a-z])${alias.replace(/\./g, "\\.")}([^a-z]|$)`, "i");
    if (re.test(s)) return canon;
  }
  // US "City, ST" pattern.
  const st = location.match(/,\s*([A-Za-z]{2})\b/);
  if (st && US_STATES.has(st[1].toUpperCase())) return "United States";
  return undefined;
}

export function canonicalCountry(name: string): string {
  const key = name.toLowerCase().trim();
  if (ALIASES[key]) return ALIASES[key];
  const hit = COUNTRIES.find((c) => c.toLowerCase() === key);
  return hit ?? name.trim();
}

// Is a location allowed given the user's target countries? Empty allow-list =>
// anywhere. A location whose country can't be determined (e.g. bare "Remote")
// is NOT excluded — we only filter out places we can positively place elsewhere.
export function countryAllowed(
  location: string | undefined,
  allowed: string[],
): boolean {
  if (!allowed || allowed.length === 0) return true;
  const country = detectCountry(location);
  if (!country) return true;
  const set = new Set(allowed.map(canonicalCountry));
  return set.has(country);
}
