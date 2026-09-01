/** Temporary: drizzle-kit migrate swallows the SQL error. Delete once 0011 lands. */
import { readFileSync, readdirSync } from "node:fs";

import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

const file = readdirSync("drizzle")
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .at(-1)!;
console.log("explaining", file);

neonConfig.webSocketConstructor = ws;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();
for (const statement of readFileSync(`drizzle/${file}`, "utf8").split("--> statement-breakpoint")) {
  const sql = statement.trim();
  if (!sql) continue;
  try {
    await client.query("begin");
    await client.query(sql);
    await client.query("rollback");
    console.log("ok  ", sql.slice(0, 90));
  } catch (err) {
    await client.query("rollback");
    console.log("FAIL", sql.slice(0, 90), "\n    ", err instanceof Error ? err.message : err);
  }
}
client.release();
await pool.end();
