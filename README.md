# AutoApplier

A personal job-search assistant that **finds, reads, ranks, and prepares** software / AI-ML / data-science internship & new-grad applications — while keeping **you** in control of every submission.

It reduces the repetitive parts of applying (re-typing the same info, re-reading every JD, choosing a resume, filling standard questions) without ever inventing experience or auto-submitting behind your back.

---

## What it does

1. **Import postings** — paste a job URL + description (or several at once, separated by a line of `---`). A scraper source can be added later behind the same import API.
2. **Parse** each posting into structured signal: required vs. nice-to-have skills, min years, clearance/citizenship, sponsorship, salary, seniority.
3. **Match & rank** against your profile, with an explainable 0-100 score and **High / Medium / Low confidence**.
4. **Filter out** roles you're not eligible for (clearance, too senior, too much experience, excluded keywords) — they sink with a clear reason.
5. **Prepare applications** for good matches: auto-fills every standard question from your profile, auto-selects the best resume variant, and builds a pre-submission summary.
6. **Stop and ask** on anything unusual — salary, essay/cover-letter, or legal questions are flagged for you instead of guessed.
7. **Track everything** — company, title, link, location, date applied, status, resume used, Q&A, recruiter, follow-up date, and interview stages.
8. **Avoid duplicates** — won't prepare a second application to the same posting, and keeps the best of several similar roles at one company.
9. **Learn** — approving, dismissing, or interviewing for jobs nudges future scores toward what you actually like.

The dashboard headline reads exactly like the goal:
> "8 jobs found today. 5 matched your profile. 2 applications are ready to submit, 3 require your approval, and 0 need you to answer a question."

---

## Confidence levels

- **High** — eligible, strong score, no open questions → *Ready to submit*.
- **Medium** — mostly complete, a couple of things to review → *Needs review*.
- **Low** — ineligible, weak fit, or an open question the agent needs you to answer → *Needs your input*.

The agent prepares; **you do the final submit.** It never enters credentials or clicks submit for you.

---

## Getting started

```bash
npm install
npm run seed   # optional: loads a demo profile + 8 sample postings
npm run dev    # http://localhost:3000
```

Then open **Profile** and replace the demo data with your real background, experience, projects, and resume variants. Saving recomputes every match.

### Optional: LLM assistance

Copy `.env.example` to `.env.local` and add a **Vercel AI Gateway** key:

```
AI_GATEWAY_API_KEY=your_key
AI_MODEL=anthropic/claude-sonnet-5
```

With a key, the agent uses an LLM to refine messy postings and write grounded match narratives. **Without** a key, everything still works via the deterministic engine — the LLM only ever *rephrases what you entered*, never invents skills or experience.

---

## Architecture

```
src/
  lib/
    types.ts          # domain model (Profile, Job, Application, MatchResult, ...)
    store.ts          # file-backed JSON repository (swap for Postgres later)
    defaultProfile.ts # starter profile
    skills.ts         # skill dictionary + extractor
    parse.ts          # job-description parser (deterministic)
    matching.ts       # explainable scoring / ranking / eligibility
    prepare.ts        # application prep, unusual-question detection, dedup
    ai.ts             # optional LLM refinement via AI Gateway
    service.ts        # orchestration + dashboard stats + learning loop
  app/
    page.tsx                    # Dashboard
    jobs/ , jobs/[id]/          # Job list, import, detail
    applications/ , [id]/       # Tracker + review/decision page
    profile/                    # Knowledge-base editor
    api/                        # Route handlers for all of the above
```

**Data** lives in `./data/*.json` (git-ignored — it holds your personal info). The `store.ts` functions are the only place that touches storage, so moving to a real database (e.g. Neon Postgres) is a localized change.

### Roadmap (deferred by design)
- **Scraper source** — add a fetcher that feeds postings into `importAndMatch()`.
- **Submission** — assisted browser autofill vs. review-only was intentionally left open; the review packet is the seam it plugs into.
- **Auth + hosted DB** — for multi-device use on Vercel.
