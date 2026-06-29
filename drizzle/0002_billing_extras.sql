ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "venue_name" text;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "drive_file_id" text;
