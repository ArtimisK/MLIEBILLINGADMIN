import { defineConfig } from "drizzle-kit";

const url = process.env.DATABASE_URL ?? "postgres://mlie:mlie@localhost:5433/mlie";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url },
  verbose: true,
  strict: true,
});
