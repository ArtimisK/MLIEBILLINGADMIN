import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Lazy singleton: importing this module never connects or throws. The client is
// created on first actual query, so `next build` (which imports route modules
// without running them) doesn't require DATABASE_URL to be present.
let _db: PostgresJsDatabase<typeof schema> | null = null;

function init(): PostgresJsDatabase<typeof schema> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set. Copy .env.example to .env.");
  }
  // `prepare: false` keeps this friendly to transaction-pooled environments.
  const client = postgres(connectionString, { prepare: false });
  return drizzle(client, { schema });
}

// Proxy defers initialization until the first property access (e.g. db.select).
export const db = new Proxy({} as PostgresJsDatabase<typeof schema>, {
  get(_target, prop, receiver) {
    if (!_db) _db = init();
    return Reflect.get(_db, prop, receiver);
  },
});

export { schema };
export type DB = typeof db;
