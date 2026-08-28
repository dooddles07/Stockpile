/**
 * The Neon Postgres client.
 *
 * `neon-serverless` with a WebSocket `Pool`, not `neon-http`: ADR-0006 locks a
 * row and writes in one interactive transaction, which the single-shot HTTP
 * driver cannot do (it degrades silently rather than erroring).
 *
 * Constructed on first call, never at import time: top-level module code runs
 * during `next build`, where `DATABASE_URL` is absent. No proxy wrapper —
 * libraries that inspect the client object hang rather than error.
 */

import "server-only";
import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle, type NeonDatabase } from "drizzle-orm/neon-serverless";
import ws from "ws";
import * as schema from "./schema";

let db: NeonDatabase<typeof schema> | undefined;

export function getDb(): NeonDatabase<typeof schema> {
  if (!db) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL is not set");
    }
    neonConfig.webSocketConstructor = ws;
    db = drizzle({ client: new Pool({ connectionString }), schema });
  }
  return db;
}
