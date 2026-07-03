import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  numeric,
  jsonb,
  pgEnum,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

// ── Enums ───────────────────────────────────────────────────────
export const businessLineEnum = pgEnum("business_line", ["MLIG", "MLIE"]);
export const eventStatusEnum = pgEnum("event_status", [
  "billable",
  "canceled",
  "unconfirmed",
  "unknown",
  "billed",
]);
export const invoiceStatusEnum = pgEnum("invoice_status", [
  "draft",
  "created",
  "sent",
  "error",
]);

// ── funding_orgs — the "Bill to" (ISS, RAYIM, Hamaspik …) ────────
export const fundingOrgs = pgTable("funding_orgs", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  billingCode: text("billing_code").notNull(),
  qboCustomerId: text("qbo_customer_id"), // null until first synced
});

// ── students ─────────────────────────────────────────────────────
export const students = pgTable("students", {
  id: serial("id").primaryKey(),
  fullName: text("full_name").notNull(),
  fundingOrgId: integer("funding_org_id").references(() => fundingOrgs.id),
  twoDigitCode: text("two_digit_code").notNull(),
  active: boolean("active").notNull().default(true),
});

// ── student_aliases — "Ethan" vs "Ethan H.", nicknames ───────────
export const studentAliases = pgTable(
  "student_aliases",
  {
    id: serial("id").primaryKey(),
    studentId: integer("student_id")
      .notNull()
      .references(() => students.id),
    alias: text("alias").notNull(), // stored lowercased
  },
  (t) => ({
    aliasUnique: uniqueIndex("student_aliases_alias_unique").on(t.alias),
  }),
);

// ── teachers — used to strip teacher token from a title ──────────
export const teachers = pgTable("teachers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  aliases: text("aliases").array().notNull().default([]),
});

// ── price_rules — duration + instrument → price ──────────────────
export const priceRules = pgTable("price_rules", {
  id: serial("id").primaryKey(),
  businessLine: businessLineEnum("business_line").notNull(),
  instrument: text("instrument"), // null = any
  durationMinutes: integer("duration_minutes").notNull(),
  unitPrice: numeric("unit_price", { precision: 10, scale: 2 }).notNull(),
  qboItemName: text("qbo_item_name").notNull(),
  qboItemRef: text("qbo_item_ref"), // cached ItemRef id from QBO
});

// ── calendars ────────────────────────────────────────────────────
export const calendars = pgTable("calendars", {
  id: serial("id").primaryKey(),
  businessLine: businessLineEnum("business_line").notNull(),
  googleCalendarId: text("google_calendar_id").notNull(),
});

// ── events — one row per calendar event (the long-format core) ───
export const events = pgTable(
  "events",
  {
    id: serial("id").primaryKey(),
    googleEventId: text("google_event_id").notNull(),
    calendarId: integer("calendar_id")
      .notNull()
      .references(() => calendars.id),
    startAt: timestamp("start_at", { withTimezone: true }).notNull(),
    endAt: timestamp("end_at", { withTimezone: true }).notNull(),
    rawTitle: text("raw_title").notNull(),
    parsedStudentId: integer("parsed_student_id").references(() => students.id),
    parsedTeacher: text("parsed_teacher"),
    parsedInstrument: text("parsed_instrument"),
    durationMinutes: integer("duration_minutes"),
    unitPrice: numeric("unit_price", { precision: 10, scale: 2 }),
    status: eventStatusEnum("status").notNull().default("unknown"),
    billingPeriod: text("billing_period"), // e.g. '2026-05'
    confirmed: boolean("confirmed").notNull().default(false),
    invoiceId: integer("invoice_id"),
    contentHash: text("content_hash").notNull(),
  },
  (t) => ({
    // Idempotency key #1: an event is ingested exactly once.
    googleEventUnique: uniqueIndex("events_google_event_id_unique").on(
      t.googleEventId,
    ),
    periodIdx: index("events_billing_period_idx").on(t.billingPeriod),
  }),
);

// ── invoices ─────────────────────────────────────────────────────
export const invoices = pgTable(
  "invoices",
  {
    id: serial("id").primaryKey(),
    businessLine: businessLineEnum("business_line").notNull(),
    fundingOrgId: integer("funding_org_id").references(() => fundingOrgs.id),
    studentId: integer("student_id").references(() => students.id), // null for MLIE
    billingPeriod: text("billing_period").notNull(),
    docNumber: text("doc_number").notNull(), // e.g. '03ISS0626'
    qboInvoiceId: text("qbo_invoice_id"), // null until pushed
    status: invoiceStatusEnum("status").notNull().default("draft"),
    subtotal: numeric("subtotal", { precision: 10, scale: 2 }).notNull().default("0"),
    venueName: text("venue_name"), // MLIE only: overrides funding org as QBO customer
    driveFileId: text("drive_file_id"), // Google Drive PDF, set after upload
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    errorMessage: text("error_message"),
  },
  (t) => ({
    // Idempotency key #2: at most one monthly invoice per student/org/line/period.
    // studentId is null for MLIE; Postgres treats nulls as distinct, which is the
    // intended behaviour (MLIE uniqueness is enforced at the strategy level by docNumber).
    naturalKey: uniqueIndex("invoices_natural_key_unique").on(
      t.businessLine,
      t.fundingOrgId,
      t.studentId,
      t.billingPeriod,
    ),
    docNumberIdx: index("invoices_doc_number_idx").on(t.docNumber),
  }),
);

// ── invoice_lines ────────────────────────────────────────────────
export const invoiceLines = pgTable("invoice_lines", {
  id: serial("id").primaryKey(),
  invoiceId: integer("invoice_id")
    .notNull()
    .references(() => invoices.id),
  eventId: integer("event_id").references(() => events.id),
  serviceDate: timestamp("service_date", { withTimezone: true }).notNull(),
  itemName: text("item_name").notNull(),
  description: text("description"),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
});

// ── review_queue ─────────────────────────────────────────────────
export const reviewQueue = pgTable("review_queue", {
  id: serial("id").primaryKey(),
  eventId: integer("event_id")
    .notNull()
    .references(() => events.id),
  reason: text("reason").notNull(),
  rawTitle: text("raw_title").notNull(),
  suggestedStudentId: integer("suggested_student_id").references(() => students.id),
  resolved: boolean("resolved").notNull().default(false),
  resolvedBy: text("resolved_by"),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
});

// ── audit_log ────────────────────────────────────────────────────
export const auditLog = pgTable("audit_log", {
  id: serial("id").primaryKey(),
  ts: timestamp("ts", { withTimezone: true }).notNull().defaultNow(),
  actor: text("actor").notNull(),
  action: text("action").notNull(),
  entity: text("entity"),
  entityId: text("entity_id"),
  detail: jsonb("detail"),
});

// ── app_state — small key/value store for rotating secrets & flags ──
// QBO rotates the refresh token on every refresh; we persist it here so the
// instance never gets locked out (blueprint v2 §6). Seeded from env on first run.
export const appState = pgTable("app_state", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Convenience type exports for the engine.
export type EventRow = typeof events.$inferSelect;
export type NewEventRow = typeof events.$inferInsert;
export type InvoiceRow = typeof invoices.$inferSelect;
export type InvoiceLineRow = typeof invoiceLines.$inferSelect;
export type StudentRow = typeof students.$inferSelect;
export type PriceRuleRow = typeof priceRules.$inferSelect;
