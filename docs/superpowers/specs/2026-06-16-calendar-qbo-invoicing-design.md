# Calendar → QuickBooks Invoicing App — Design Spec

**Date:** 2026-06-16
**Source:** `#BUILDBLUEPRINT` in repo root (the canonical blueprint; this spec is the build-time companion).
**Scope of this pass:** scaffold *all code* for Phases 0–3. Compiling, unit-tested core; external integrations wired but gated behind `.env`.

## Honest scope boundary

"All phases" means **complete, compiling, unit-tested code** for the whole pipeline. It does **not** mean a live production billing run, because that requires inputs not available at scaffold time:

- Google OAuth client id/secret + calendar IDs
- QBO sandbox client id/secret + realmId + refresh token
- The Master Sheet roster (students, funding orgs, aliases, price rules)

Everything credential- or data-dependent is wired and reads from `.env`; the deterministic core is fully implemented and tested.

**Decision: no LLM fallback parser in v1.** The blueprint marks it optional. The review queue already catches every title the rules parser can't confidently resolve — nothing is billed or silently dropped — and resolving a queue item adds an alias so the next run auto-resolves by rule. That converges fast for a known, finite roster, keeps billing deterministic, and avoids an external dependency, API cost, and failure mode. The pipeline keeps a clean seam (low-confidence → review) where an LLM fallback would slot in at the productize/multi-tenant stage (Phase 4).

## Architecture

Single Next.js + TypeScript app, feature-foldered (matches PWCMS). The engine lives in plain TS under `src/lib/engine` so it's importable by both API routes and tests. Pipeline per the blueprint §5:

```
Ingest → Classify → Parse → Aggregate → Preview → Push → Record
```

One scheduler entry (`app/api/cron/run-cycle`) works on both a VPS node-cron and Vercel Cron, satisfying "keep hosting open."

## Structure

```
docker-compose.yml            # local Postgres
.env.example                  # every secret, documented
drizzle.config.ts
src/db/schema.ts              # 11 tables + unique constraints (blueprint §4)
src/db/index.ts               # drizzle client from DATABASE_URL
src/db/seed.ts                # roster/price placeholders (replace from Master Sheet)
src/lib/google/calendar.ts    # OAuth2 + fetchEvents
src/lib/qbo/{auth,client,invoice}.ts
src/lib/engine/{ingest,classify,parse,aggregate,push,record}.ts
src/lib/engine/strategies/{base,mlig,mlie}.ts   # BillingStrategy
src/lib/pipeline.ts           # orchestrator
app/page.tsx                  # dashboard
app/preview/page.tsx          # Phase-1 preview, no writes
app/review/page.tsx           # review queue
app/api/cron/run-cycle/route.ts
app/api/push/route.ts         # Confirm & Push
tests/                        # vitest
```

## Data model

All 11 tables from blueprint §4: `funding_orgs`, `students`, `student_aliases`, `teachers`, `price_rules`, `calendars`, `events`, `invoices`, `invoice_lines`, `review_queue`, `audit_log`.

## Idempotency (the central correctness goal)

1. `events.google_event_id` UNIQUE — ingest once.
2. `invoices (business_line, funding_org_id, student_id, billing_period)` UNIQUE — one monthly invoice per student.
3. Skip QBO create when `invoices.qbo_invoice_id` is set.
4. Secondary guard: query QBO `SELECT * FROM Invoice WHERE DocNumber = '{doc}'` and adopt if found.

## Billing strategies

`BillingStrategy` interface (`classify`, `parse`, `aggregate`, `docNumber`). `MligLessonsStrategy` groups billable events by student × billing-month into one multi-line invoice; doc number `{two_digit_code}{billing_code}{MMYY}`. `MlieGigsStrategy` is 1 gig → 1 invoice, single line.

## Title parsing (blueprint §7)

Rules layer only (v1): strip status prefixes, detect instrument by emoji, split on `&` (last token = teacher), emit one event per student, resolve via `student_aliases`, route unresolved to `review_queue`. No LLM fallback — see the scope decision above.

## Testing

Real vitest unit tests for the deterministic core: rules parser (using representative messy titles), aggregation grouping, doc-number generation, and the idempotency guard. Google/QBO integration tests are written but `.skip`-gated until credentials exist.

## Decisions

- **DB:** Docker Compose Postgres; Drizzle reads `DATABASE_URL`; `db:migrate` + `db:seed` run out of the box.
- **Hosting:** kept open; single cron route works on VPS or Vercel.
- **Seed:** placeholder roster with a clear "replace from Master Sheet" marker.
- **Phasing note (from blueprint §10):** do not rush a production cutover under the June 24 deadline; this scaffold is the parallel build.
