CREATE TYPE "public"."user_role" AS ENUM('admin');
CREATE TABLE "users" (
  "id" serial PRIMARY KEY NOT NULL,
  "email" text NOT NULL,
  "password_hash" text NOT NULL,
  "role" "user_role" DEFAULT 'admin' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "users" ADD CONSTRAINT "users_email_unique" UNIQUE("email");
