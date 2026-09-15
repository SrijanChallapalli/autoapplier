# AutoApplier — build backlog

Self-directed tickets toward a production-ready app. Checked = shipped & verified.

## Correctness & foundation
- [x] T1  Concurrency-safe data store (serialize read-modify-write; no lost writes)
- [~] T2  Input validation + error handling on API routes (settings/import/resume/draft done)
- [x] T3  Storage seam isolated in store.ts; tmp fallback on read-only FS (Postgres swap = deferred)

## Intelligence (LLM, opt-in via AI Gateway key)
- [x] T4  Wire LLM into match narrative + richer reasons (graceful fallback)
- [x] T5  Grounded answer/cover-letter drafting for essay questions ("never invent")
- [x] T6  AI status surfaced in UI (on/off, which model)

## Real inputs
- [x] T7  Resume upload (PDF/text) → extract text → auto-fill skills
- [x] T8  Import by URL (server fetches the posting and parses it)
- [x] T9  Manage company boards + fetch keywords from a Settings page (persisted)

## Outputs & workflow
- [x] T10 Export a filled application packet (copy-paste ready) per application
- [x] T11 Bulk "prepare top matches" from the dashboard
- [x] T12 Daily auto-fetch (Vercel cron) + manual trigger

## Quality
- [x] T13 Unit tests for parse / matching / prepare (vitest)
- [x] T14 UI polish: loading states, empty states, error toasts
- [x] T15 Deploy readiness: health route, vercel config, env docs, LICENSE

## Round 2
- [x] T16 Pluggable storage backend + Postgres/Neon adapter (DATABASE_URL), PGlite-tested
- [x] T17 Cover-letter generation (grounded, opt-in) per application
- [x] T18 Expand tests: sources relevance filter, html strip, resume, packet
- [x] T19 Jobs search/filter UX

## Round 3
- [x] T20 Resume → full structured profile autofill (LLM + deterministic fallback)
- [x] T21 Per-internship resume tailoring (grounded, never invents), editable + export
- [x] T22 Networking: LinkedIn/Google search links (recruiters, team, alumni) + outreach draft
- [x] T23 Full-resume parse (no AI needed) → review-and-confirm panel before saving
- [x] T24 Robust experience/project parsing (multi-line headers, comma/pipe formats)
- [x] T25 Target-countries restriction — filters live fetch + blocks out-of-country in matching

## Deferred (needs your input)
- Neon provisioning + Vercel deploy (needs your Vercel login) — code is ready;
  just set DATABASE_URL + deploy
- Real form submission (needs approach decision; safety limits apply)
