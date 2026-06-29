import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Lazy singleton stored on globalThis so Next.js HMR doesn't create a new
// connection pool on every hot-reload (which exhausts the 100-connection limit).
declare global {
  // eslint-disable-next-line no-var
  var __mlie_db: PostgresJsDatabase<typeof schema> | undefined;
}

function init(): PostgresJsDatabase<typeof schema> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set. Copy .env.example to .env.");
  }
  // max:5 keeps dev well under the 100-connection limit even with HMR.
  const client = postgres(connectionString, { prepare: false, max: 5 });
  return drizzle(client, { schema });
}

let _db: PostgresJsDatabase<typeof schema> | null = null;

// Proxy defers initialization until the first property access (e.g. db.select).
// Uses globalThis in dev so HMR module re-evaluations reuse the same pool.
export const db = new Proxy({} as PostgresJsDatabase<typeof schema>, {
  get(_target, prop, receiver) {
    if (!_db) {
      if (process.env.NODE_ENV !== "production" && global.__mlie_db) {
        _db = global.__mlie_db;
      } else {
        _db = init();
        if (process.env.NODE_ENV !== "production") {
          global.__mlie_db = _db;
        }
      }
    }
    return Reflect.get(_db, prop, receiver);
  },
});

export { schema };
export type DB = typeof db;
