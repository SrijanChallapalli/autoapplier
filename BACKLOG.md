# AutoApplier — build backlog

Self-directed tickets toward a production-ready app. Checked = shipped & verified.

## Correctness & foundation
- [ ] T1  Concurrency-safe data store (serialize read-modify-write; no lost writes)
- [ ] T2  Input validation + consistent error handling on all API routes
- [ ] T3  Storage abstraction ready for Postgres (env-gated) without changing callers

## Intelligence (LLM, opt-in via AI Gateway key)
- [ ] T4  Wire LLM into match narrative + richer reasons (graceful fallback)
- [ ] T5  Grounded answer/cover-letter drafting for essay questions ("never invent")
- [ ] T6  AI status surfaced in UI (on/off, which model)

## Real inputs
- [ ] T7  Resume upload (PDF/text) → extract text → auto-fill skills/experience
- [ ] T8  Import by URL (server fetches the posting and parses it)
- [ ] T9  Manage company boards + fetch keywords from a Settings page (persisted)

## Outputs & workflow
- [ ] T10 Export a filled application packet (copy-paste ready) per application
- [ ] T11 Duplicate/similar-role guard surfaced in UI; bulk "prepare top matches"
- [ ] T12 Daily auto-fetch (Vercel cron) + manual trigger

## Quality
- [ ] T13 Unit tests for parse / matching / prepare (vitest)
- [ ] T14 UI polish: loading states, empty states, error toasts, confirms
- [ ] T15 Deploy readiness: health route, vercel config, env docs, LICENSE

## Deferred (needs your input)
- Hosted Postgres provisioning + Vercel deploy (needs your Vercel login)
- Real form submission (needs approach decision; safety limits apply)
