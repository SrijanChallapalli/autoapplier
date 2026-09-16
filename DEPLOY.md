# Deploying AutoApplier to Vercel + Neon Postgres

AutoApplier is a standard Next.js app. It runs on Vercel with **zero code
changes** — the only real decision is storage. This guide covers a durable
production deploy backed by Postgres.

## Why Postgres (not the file store)

Locally the app persists JSON files under `./data`. On Vercel the filesystem is
read-only except `/tmp`, and `/tmp` is **ephemeral and per-instance** — data
written by one serverless invocation can vanish on the next. That's fine for a
quick demo but loses your profile and applications in real use.

Setting `DATABASE_URL` switches the whole app to Postgres (one JSONB row per
document) with no other change. The backend selection lives in
[`src/lib/db/backend.ts`](src/lib/db/backend.ts); `pg` is already a runtime
dependency.

## Steps

### 1. Push to GitHub
Already done if you're reading this in the repo. Vercel deploys from the repo.

### 2. Import the project into Vercel
- vercel.com → **Add New… → Project** → import this GitHub repo.
- Framework preset: **Next.js** (auto-detected). Leave build/output defaults.
- Don't deploy yet — add storage and env vars first (or redeploy after).

### 3. Provision Neon Postgres from the Vercel Marketplace
- In the project: **Storage → Create Database → Neon (Serverless Postgres)**
  (or **Marketplace → Neon → Install**).
- Connect it to the project. Vercel injects the connection string into the
  project's environment automatically — Neon integrations expose it as
  `DATABASE_URL` and/or `POSTGRES_URL`. The app reads **either** (see
  `getBackend()`), so no manual wiring is needed.
- The `autoapplier_kv` table is created automatically on first use
  (`CREATE TABLE IF NOT EXISTS`), so there's no migration step.

CLI alternative: `vercel integration add neon` then `vercel env pull` to sync
locally.

### 4. Set environment variables (Project → Settings → Environment Variables)
All optional except as noted; see [`.env.example`](.env.example) for full docs.

| Variable | When to set it |
| --- | --- |
| `DATABASE_URL` | Set by the Neon integration. Required for durable storage. |
| `APP_PASSWORD` | Set to password-gate the whole app (recommended for any public URL). |
| `AUTH_SECRET` | A long random string to sign sessions (rotating it logs everyone out). |
| `CRON_SECRET` | Shared secret the daily cron uses to authenticate `/api/cron/fetch`. |
| `AI_GATEWAY_API_KEY` | Optional — enables LLM narratives/drafting. Falls back to the deterministic engine when unset. |
| `AI_MODEL` | Optional — model id (default `anthropic/claude-sonnet-5`). |

### 5. Deploy
Trigger a deploy (push to the default branch, or **Redeploy** in the
dashboard). The daily job-fetch cron is already declared in
[`vercel.json`](vercel.json) (`0 13 * * *`) and is registered automatically.

### 6. Verify
```bash
curl https://<your-deployment>/api/health
```
A healthy Postgres-backed deploy returns:
```json
{ "ok": true, "storage": "postgres", "jobs": 0, "applications": 0, ... }
```
- `storage: "postgres"` confirms `DATABASE_URL` was picked up.
- `ok: true` means the app read from the database successfully (a bad
  connection string returns `ok: false` with the error and HTTP 500).

If `storage` is `"file"`, `DATABASE_URL`/`POSTGRES_URL` isn't set in that
environment — recheck the integration and redeploy.

## Notes
- **Cron auth:** with `CRON_SECRET` set, `/api/cron/fetch` requires it; Vercel's
  cron sends it automatically. Leave it unset only for local testing.
- **First run:** the store starts empty. Open **Profile** to add your background
  (or upload a resume), then **Jobs → Fetch live jobs**.
- **Local Postgres testing:** set `DATABASE_URL` in `.env.local` to any Postgres
  instance to exercise the same path locally. The unit tests already cover the
  Postgres backend against in-process PGlite (`tests/store.test.ts`).
