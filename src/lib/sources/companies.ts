// Curated list of company job boards to pull live openings from, via each
// company's *official public* ATS API (no scraping, no keys). Tokens here were
// verified to return data on 2026-09-14; if a company moves ATS the fetcher
// simply skips it. Add your own targets — the token is the company slug in the
// board URL (e.g. boards.greenhouse.io/<token>, jobs.ashbyhq.com/<token>,
// jobs.lever.co/<token>).

import type { CompanyBoard } from "../types";
export type { Ats, CompanyBoard } from "../types";

export const DEFAULT_COMPANIES: CompanyBoard[] = [
  // Greenhouse
  { name: "Anthropic", ats: "greenhouse", token: "anthropic" },
  { name: "Stripe", ats: "greenhouse", token: "stripe" },
  { name: "Databricks", ats: "greenhouse", token: "databricks" },
  { name: "Airbnb", ats: "greenhouse", token: "airbnb" },
  { name: "Dropbox", ats: "greenhouse", token: "dropbox" },
  { name: "Coinbase", ats: "greenhouse", token: "coinbase" },
  { name: "Robinhood", ats: "greenhouse", token: "robinhood" },
  { name: "Figma", ats: "greenhouse", token: "figma" },
  { name: "Discord", ats: "greenhouse", token: "discord" },
  { name: "Instacart", ats: "greenhouse", token: "instacart" },
  { name: "Brex", ats: "greenhouse", token: "brex" },
  { name: "Scale AI", ats: "greenhouse", token: "scaleai" },
  { name: "Pinterest", ats: "greenhouse", token: "pinterest" },
  { name: "Lyft", ats: "greenhouse", token: "lyft" },
  { name: "Reddit", ats: "greenhouse", token: "reddit" },
  { name: "Cloudflare", ats: "greenhouse", token: "cloudflare" },
  { name: "Samsara", ats: "greenhouse", token: "samsara" },
  { name: "Affirm", ats: "greenhouse", token: "affirm" },
  { name: "Asana", ats: "greenhouse", token: "asana" },
  { name: "GitLab", ats: "greenhouse", token: "gitlab" },

  // Ashby
  { name: "OpenAI", ats: "ashby", token: "openai" },
  { name: "Ramp", ats: "ashby", token: "ramp" },
  { name: "Linear", ats: "ashby", token: "linear" },
  { name: "Notion", ats: "ashby", token: "notion" },
  { name: "Cohere", ats: "ashby", token: "cohere" },
  { name: "Replit", ats: "ashby", token: "replit" },
  { name: "Mercury", ats: "ashby", token: "mercury" },
  { name: "Hex", ats: "ashby", token: "hex" },
  { name: "Modal", ats: "ashby", token: "modal" },
  { name: "Deel", ats: "ashby", token: "deel" },

  // Lever
  { name: "Palantir", ats: "lever", token: "palantir" },
  { name: "Kraken", ats: "lever", token: "kraken" },
  { name: "Voleon", ats: "lever", token: "voleon" },
];
