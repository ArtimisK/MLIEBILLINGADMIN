CREATE TYPE "public"."business_line" AS ENUM('MLIG', 'MLIE');--> statement-breakpoint
CREATE TYPE "public"."event_status" AS ENUM('billable', 'canceled', 'unconfirmed', 'unknown', 'billed');--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('draft', 'created', 'sent', 'error');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"ts" timestamp with time zone DEFAULT now() NOT NULL,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"entity" text,
	"entity_id" text,
	"detail" jsonb
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "calendars" (
	"id" serial PRIMARY KEY NOT NULL,
	"business_line" "business_line" NOT NULL,
	"google_calendar_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "events" (
	"id" serial PRIMARY KEY NOT NULL,
	"google_event_id" text NOT NULL,
	"calendar_id" integer NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"raw_title" text NOT NULL,
	"parsed_student_id" integer,
	"parsed_teacher" text,
	"parsed_instrument" text,
	"duration_minutes" integer,
	"unit_price" numeric(10, 2),
	"status" "event_status" DEFAULT 'unknown' NOT NULL,
	"billing_period" text,
	"confirmed" boolean DEFAULT false NOT NULL,
	"invoice_id" integer,
	"content_hash" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "funding_orgs" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"billing_code" text NOT NULL,
	"qbo_customer_id" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "invoice_lines" (
	"id" serial PRIMARY KEY NOT NULL,
	"invoice_id" integer NOT NULL,
	"event_id" integer,
	"service_date" timestamp with time zone NOT NULL,
	"item_name" text NOT NULL,
	"description" text,
	"amount" numeric(10, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "invoices" (
	"id" serial PRIMARY KEY NOT NULL,
	"business_line" "business_line" NOT NULL,
	"funding_org_id" integer,
	"student_id" integer,
	"billing_period" text NOT NULL,
	"doc_number" text NOT NULL,
	"qbo_invoice_id" text,
	"status" "invoice_status" DEFAULT 'draft' NOT NULL,
	"subtotal" numeric(10, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"error_message" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "price_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"business_line" "business_line" NOT NULL,
	"instrument" text,
	"duration_minutes" integer NOT NULL,
	"unit_price" numeric(10, 2) NOT NULL,
	"qbo_item_name" text NOT NULL,
	"qbo_item_ref" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "review_queue" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_id" integer NOT NULL,
	"reason" text NOT NULL,
	"raw_title" text NOT NULL,
	"suggested_student_id" integer,
	"resolved" boolean DEFAULT false NOT NULL,
	"resolved_by" text,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "student_aliases" (
	"id" serial PRIMARY KEY NOT NULL,
	"student_id" integer NOT NULL,
	"alias" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "students" (
	"id" serial PRIMARY KEY NOT NULL,
	"full_name" text NOT NULL,
	"funding_org_id" integer,
	"two_digit_code" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "teachers" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"aliases" text[] DEFAULT '{}' NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "events" ADD CONSTRAINT "events_calendar_id_calendars_id_fk" FOREIGN KEY ("calendar_id") REFERENCES "public"."calendars"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "events" ADD CONSTRAINT "events_parsed_student_id_students_id_fk" FOREIGN KEY ("parsed_student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "invoices" ADD CONSTRAINT "invoices_funding_org_id_funding_orgs_id_fk" FOREIGN KEY ("funding_org_id") REFERENCES "public"."funding_orgs"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "invoices" ADD CONSTRAINT "invoices_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "review_queue" ADD CONSTRAINT "review_queue_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "review_queue" ADD CONSTRAINT "review_queue_suggested_student_id_students_id_fk" FOREIGN KEY ("suggested_student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "student_aliases" ADD CONSTRAINT "student_aliases_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "students" ADD CONSTRAINT "students_funding_org_id_funding_orgs_id_fk" FOREIGN KEY ("funding_org_id") REFERENCES "public"."funding_orgs"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "events_google_event_id_unique" ON "events" USING btree ("google_event_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "events_billing_period_idx" ON "events" USING btree ("billing_period");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "invoices_natural_key_unique" ON "invoices" USING btree ("business_line","funding_org_id","student_id","billing_period");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invoices_doc_number_idx" ON "invoices" USING btree ("doc_number");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "student_aliases_alias_unique" ON "student_aliases" USING btree ("alias");