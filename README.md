# MLIE Invoicing

Calendar → QuickBooks invoicing app. Replaces the Google Sheets + Zapier pipeline
(MLIG lessons + MLIE entertainment) with one codebase that reads Google Calendar,
turns events into invoices, and pushes them to QuickBooks Online — **idempotently**
(a stored QBO invoice id is never created twice).

See [`#BUILDBLUEPRINT`](./#BUILDBLUEPRINT) for the full design rationale and
[`docs/superpowers/specs/`](./docs/superpowers/specs/) for the build spec.

## Stack

Next.js + TypeScript · PostgreSQL + Drizzle · `googleapis` · `intuit-oauth` (QBO).
The engine (`src/lib/engine`) is plain TS so it's importable by both API routes and tests.

## Quick start

```bash
pnpm install
pnpm db:up            # local Postgres via docker compose (host port 5433)
cp .env.example .env  # fill in what you have; preview/review work with just DATABASE_URL
pnpm db:generate      # generate the SQL migration from the Drizzle schema
pnpm db:migrate       # apply it
pnpm db:seed          # placeholder roster — REPLACE FROM THE MASTER SHEET
pnpm dev              # http://localhost:3000
```

`pnpm test` runs the unit suite (parser, classifier, pricing, aggregation, doc-number).
`pnpm typecheck` type-checks the whole tree. `pnpm build` produces a standalone build.

## What works without credentials

- **Preview** (`/preview`) and **Review queue** (`/review`) run against the seeded DB alone.
- **Ingest** needs `GOOGLE_*` in `.env`. **Push** needs `QBO_*`. Both are wired and gated —
  the dashboard shows which are configured.

## One-time OAuth

- Google: open `/api/google/callback`, follow `authUrl`, paste the returned
  `refresh_token` into `GOOGLE_REFRESH_TOKEN`.
- QuickBooks (sandbox first): open `/api/qbo/callback`, follow `authUrl`, paste the
  returned `QBO_REFRESH_TOKEN` and `QBO_REALM_ID`.

## Pipeline

`ingest → classify → parse → aggregate → preview → push → record`

- **One event per record** (long format); grouped into invoices in code at invoice time.
- **MLIG**: group billable lessons by student × billing-month → one invoice, N lines,
  doc number `{two_digit_code}{billing_code}{MMYY}` (e.g. `03ISS0626`).
- **MLIE**: one gig → one invoice, one line.
- **Idempotency** (the central goal): `events.google_event_id` unique; the invoice
  natural key unique; skip QBO create when `qbo_invoice_id` is set; secondary QBO
  `DocNumber` query adopts an existing invoice.
- **Review queue**: anything not confidently billable lands here — never billed wrong,
  never silently dropped. Resolving an item + adding an alias means the next run
  auto-resolves it. (No LLM fallback in v1 — see the spec for why.)

## Scheduler

`GET /api/cron/run-cycle?period=YYYY-MM` runs a cycle. Protect it with `CRON_SECRET`
(`Authorization: Bearer <secret>`). Works on a VPS (node-cron hitting the URL) or
Vercel Cron — hosting is intentionally left open.

## Phasing note

Per the blueprint (§10): do **not** rush a production cutover under a deadline.
This is the parallel build — prove the preview matches a known month, push to the QBO
**sandbox** first, then flip to production at a clean month boundary and decommission
the Zaps.
