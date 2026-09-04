/**
 * drizzle-kit config: `db:generate` authors migrations from lib/db/schema.ts,
 * `db:migrate` applies them. `migrate` needs DATABASE_URL; `generate` is
 * offline. CI applies the committed migrations to a fresh Neon branch.
 */

import { defineConfig } from "drizzle-kit";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL! },
});
