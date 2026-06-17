# Handoff — Calendar → QuickBooks → Drive Invoicing

Status as of 2026-06-17. Read this top-to-bottom before touching code.

## What this is

A per-client app that reads Google Calendar, decides what's billable, builds invoices,
pushes them to QuickBooks Online **idempotently**, and (planned) drops invoice PDFs into a
Google Drive folder. Two business lines: **MLIG** (lessons, aggregated monthly per student)
and **MLIE** (entertainment gigs, one invoice per gig).

Canonical design docs in the repo:
- `#BUILDBLUEPRINT` — original blueprint (v1).
- Blueprint **v2** (newer, authoritative on direction) — pasted in project history; key deltas
  from v1 are tracked in this handoff under "Open work".
- `docs/superpowers/specs/2026-06-16-calendar-qbo-invoicing-design.md` — build spec.

**Deadline:** working by **June 24** (test week), real run **July 1**.

## Stack

Next.js 15 + TypeScript · PostgreSQL + Drizzle ORM · `googleapis` (Calendar) ·
`intuit-oauth` (QBO). Node 22, pnpm 9. The engine (`src/lib/engine`) is plain TS, importable
by both API routes and tests.

> **DB decision:** we are on **Postgres** (not SQLite). Blueprint v2 suggested SQLite for
> self-contained per-client instances; the owner chose to stay on Postgres. Don't switch
> without re-confirming.

## How to run

```bash
pnpm install
pnpm db:up                 # local Postgres via docker compose (host port 5433)
cp .env.example .env       # fill what you have; preview/review work with just DATABASE_URL
pnpm db:generate           # generate SQL migration from the Drizzle schema (if schema changed)
pnpm db:migrate            # apply migrations
pnpm db:seed               # PLACEHOLDER roster — must be replaced from the Master Sheet
pnpm dev                   # http://localhost:3000
```

`pnpm test` (vitest), `pnpm typecheck` (tsc --noEmit), `pnpm build` (Next production build).
`pnpm db:down` stops Postgres.

> **Windows note:** `output: "standalone"` is opt-in via `BUILD_STANDALONE=1` because the
> trace step needs symlink privileges Windows dev machines lack. Enable it on the Linux VPS/CI.

## Current state — verified working

- ✅ `pnpm typecheck` clean, `pnpm build` clean, **27/27 unit tests pass**
- ✅ DB migrates (12 tables) and seeds against Docker Postgres
- ✅ Server boots; `/`, `/preview`, `/review` return 200; preview runs the full
  classify→parse→price→aggregate path against the seeded DB
- ✅ Gated integrations behave correctly when unconfigured (cron route reports
  "Google not configured" rather than crashing)

### What works without any external credentials
Preview (`/preview`) and Review queue (`/review`) run against the seeded DB alone.
**Ingest** needs `GOOGLE_*` in `.env`; **Push** needs `QBO_*`. Both are wired and gated;
the dashboard shows which are configured.

## Architecture / where things live

```
src/db/
  schema.ts        # all tables (funding_orgs, students, student_aliases, teachers,
                   #   price_rules, calendars, events, invoices, invoice_lines,
                   #   review_queue, audit_log, app_state) + idempotency constraints
  index.ts         # lazy Drizzle client (never throws at import; errors only on use)
  migrate.ts seed.ts load-env.ts
src/lib/engine/
  parse.ts         # rules-based title parser (PLACEHOLDER rules — see Open work #1)
  classify.ts      # attendance/billable classifier (PLACEHOLDER convention — #1)
  pricing.ts       # price_rules lookup → BillableEvent
  ingest.ts        # Calendar fetch → upsert events (content_hash edit detection)
  push.ts          # idempotent QBO write (pre-flight + double guard) + draft persistence
  record.ts        # audit log + (stub) sheet mirror
  roster.ts hash.ts types.ts
  strategies/      # base.ts (BillingStrategy + docNumber/period helpers), mlig.ts, mlie.ts
src/lib/google/calendar.ts   # OAuth2 + fetchEvents (gated on GOOGLE_*)
src/lib/qbo/                 # auth.ts, client.ts, invoice.ts, token-store.ts
src/lib/pipeline.ts          # orchestrator: buildPreview / runIngestAndPreview / confirmAndPush
app/                         # dashboard, /preview, /review, api/cron/run-cycle,
                             #   api/push, api/google|qbo/callback (one-time OAuth helpers)
tests/                       # parse, classify, pricing, aggregate, docnumber
```

## Idempotency (the central correctness goal)

1. `events.google_event_id` UNIQUE — an event is ingested once.
2. `invoices (business_line, funding_org_id, student_id, billing_period)` UNIQUE.
3. Skip QBO create when `invoices.qbo_invoice_id` is set.
4. Before create, query QBO `SELECT * FROM Invoice WHERE DocNumber = '{doc}'` and adopt if found.
5. Pre-flight: refuse to push if QBO "Custom transaction numbers" preference is OFF.

## Decisions already made

- **Postgres**, not SQLite (see above).
- **No LLM fallback parser** in v1 — the review/skipped queue + alias loop covers messy titles
  deterministically; the seam is left for the productize stage. (Rationale in the spec.)
- Attendance/parse rules are **placeholders** pending the real source (see Open work #1).

## v2 safety fixes already shipped (2026-06-17)

- **Unconfirmed events surface** in the skipped report (were silently dropped).
- **QBO "Custom transaction numbers" pre-flight** — refuses to push if off.
- **QBO refresh-token rotation persisted** — `app_state` table + `src/lib/qbo/token-store.ts`;
  reads the live token and saves the rotated one each refresh (was a lockout risk).

## Open work (prioritized)

### BLOCKER / critical path
1. **Port the real attendance + title-parse rules.** `parse.ts` and `classify.ts` are
   placeholders. The real "checkbox marked" / show-no-show convention lives in the existing
   Calendar→Sheet Apps Script (and/or is observable in the Sync Log). This is the #1 risk per
   blueprint v2 §0. **Need:** the Apps Script source, or the **Sync Log xls** (with the
   "attended" column identified), to reverse-engineer and write tests against real titles.
2. **Roster import** from the **Master Sheet xls** → `funding_orgs / students /
   student_aliases / price_rules` (with exact `qbo_item_name`). Replaces `src/db/seed.ts`.

### Important (mostly needs a design decision)
3. **Google Drive PDF output** (v2 §7) — after a successful create, fetch the QBO invoice PDF
   and upload to a Drive folder; store `drive_file_id` (add column). *Need:* folder id +
   filename convention.
4. **MLIE customer = venue/location** (v2 §5), not funding org. Currently `push.ts` always
   bills the funding org. *Need:* where the venue comes from in the data. Add `customerName()`
   to `BillingStrategy`.
5. **Invoice fields:** explicit **tax** (funder invoices likely exempt), forced **USD**
   `CurrencyRef`, **DueDate/Terms** for net-30/60 funders. *Need:* tax/terms confirmation.
6. **Timezone-aware billing period** — `toBillingPeriod` currently uses UTC; should derive in
   the business's local zone (events near month boundaries land in the wrong invoice otherwise).

### Later (P3+)
7. `run_log` summary table (per-run counts) + optional **Slack** end-of-run post.
8. Single **admin login** per instance (currently no auth).
9. **Reconciliation pull** from QBO.
10. Per-instance **config file** for invoice-number format / schedule / billing-cycle / timezone
    (v2 wants "nothing client-specific in code").

## What we already match from v2 (don't redo)
Idempotency (all three keys + DocNumber adopt), `ensureItems` is validate-only (never
auto-creates), two-strategy engine, dry-run preview, multi-student split, content-hash edit
detection, skipped/review queue, and `Amount`+`Qty=1` lines (no conflicting `UnitPrice`).

## Phasing
P0 foundations ✅ · P1 read+classify+preview ⏳ (blocked on #1/#2) · P2 QBO write + Drive
(sandbox) — partially built (QBO write done & idempotent; Drive not started) · P3 production.
For June 24: P0–P2 in QBO **sandbox**, then flip to production for July 1 with test week as margin.
```
