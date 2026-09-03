/**
 * The guarantees ticket 16's company-settings write path needs that Playwright
 * cannot express.
 *
 * The e2e suite (`e2e/company-settings.write.spec.ts`) drives the form: an admin
 * changes the company name and it renders in the app shell. ADR-0004 puts the
 * real check in the domain function, and its "reached directly by a Role without
 * access, refused, writes nothing" clause lives below the UI:
 *
 *  1. A principal whose Role cannot edit `settings` (the seeded Auditor — it has
 *     `settings: read`) is refused with `forbidden`, and nothing is written —
 *     not the row, not an audit entry.
 *  2. Blank input is refused with `invalid`, and nothing is written.
 *  3. A permitted Actor changes the name and address: the row updates, one
 *     `update` audit row lands attributed to the Actor, `companySettings` reads
 *     the new values back, and a no-op re-save writes no further audit row.
 *     Reverted afterwards.
 *
 * Run with `npm run check:settings` against a migrated, seeded database. Its own
 * Pool under plain Node (`lib/db/client.ts` is `server-only`). Every mutation it
 * makes is reversed, so the seed the Playwright suite then drives is left
 * exactly as it started.
 */

import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

import { Pool, neonConfig } from "@neondatabase/serverless";
import { eq, sql } from "drizzle-orm";
import { drizzle, type NeonDatabase } from "drizzle-orm/neon-serverless";
import ws from "ws";

import { hydrateRoles } from "@/lib/auth/permissions";
import * as schema from "@/lib/db/schema";
import {
  CompanySettingsError,
  COMPANY_SETTINGS_SEED,
  SETTINGS_ROW_ID,
  companySettings,
  updateCompanySettings,
} from "@/lib/domain/settings";
import type { Actor } from "@/lib/domain/stock";
import type { Role } from "@/lib/types";

type Db = NeonDatabase<typeof schema>;

async function auditCount(db: Db): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.auditEntries);
  return row?.n ?? 0;
}

async function actorForRole(db: Db, role: Role): Promise<Actor> {
  const [user] = await db
    .select({ id: schema.users.id, name: schema.users.name, role: schema.users.role })
    .from(schema.users)
    .where(eq(schema.users.role, role))
    .limit(1);
  if (!user) throw new Error(`checks: no seeded user with role "${role}"`);
  return user;
}

async function forbiddenRoleIsRefused(db: Db): Promise<void> {
  const actor = await actorForRole(db, "auditor");
  const before = await companySettings(db);
  const audits = await auditCount(db);

  await assert.rejects(
    () =>
      updateCompanySettings(actor, { companyName: "Hijacked Ltd", companyAddress: "Nowhere" }, db),
    (err: unknown) => err instanceof CompanySettingsError && err.code === "forbidden",
    "a Role that cannot edit settings must be refused at the domain function",
  );

  assert.deepEqual(await companySettings(db), before, "a refused edit still changed the row");
  assert.equal(await auditCount(db), audits, "a refused edit still wrote an audit row");
  console.log("  forbidden: Auditor is refused, nothing written");
}

async function blankInputIsRefused(db: Db): Promise<void> {
  const actor = await actorForRole(db, "super-admin");
  const before = await companySettings(db);
  const audits = await auditCount(db);

  await assert.rejects(
    () => updateCompanySettings(actor, { companyName: "  ", companyAddress: "somewhere" }, db),
    (err: unknown) => err instanceof CompanySettingsError && err.code === "invalid",
    "a blank company name must be refused",
  );

  assert.deepEqual(await companySettings(db), before, "a refused edit still changed the row");
  assert.equal(await auditCount(db), audits, "a refused edit still wrote an audit row");
  console.log("  invalid: a blank field is refused, nothing written");
}

async function aPermittedEditPersistsAndIsAudited(db: Db): Promise<void> {
  const actor = await actorForRole(db, "super-admin");
  const original = await companySettings(db);
  const audits = await auditCount(db);
  const next = { companyName: "Northwind Traders", companyAddress: "1 Test Row, Columbus, Ohio" };

  try {
    const result = await updateCompanySettings(actor, next, db);
    assert.deepEqual(result, next, "the function returns the trimmed values it wrote");
    assert.deepEqual(await companySettings(db), next, "the row did not update");
    assert.equal(await auditCount(db), audits + 1, "exactly one audit row should be added");

    const [entry] = await db
      .select()
      .from(schema.auditEntries)
      .orderBy(sql`${schema.auditEntries.seq} desc`)
      .limit(1);
    assert.equal(entry?.action, "update", "the audit row is an update");
    assert.equal(entry?.entityId, SETTINGS_ROW_ID, "the audit row points at the settings row");
    assert.equal(entry?.userId, actor.id, "the audit row names the Actor who made the change");

    // A second save with the same values is a no-op — no further audit row.
    await updateCompanySettings(actor, next, db);
    assert.equal(await auditCount(db), audits + 1, "a no-op re-save wrote another audit row");
    console.log("  edit: name and address persisted, one audit row, idempotent re-save");
  } finally {
    await db
      .update(schema.settings)
      .set({ companyName: original.companyName, companyAddress: original.companyAddress })
      .where(eq(schema.settings.id, SETTINGS_ROW_ID));
    await db
      .delete(schema.auditEntries)
      .where(eq(schema.auditEntries.device, "company settings page"));
  }

  // The seed value is what the daily reset and the Playwright suite expect.
  assert.equal(
    (await companySettings(db)).companyName,
    COMPANY_SETTINGS_SEED.companyName,
    "the revert did not restore the seeded company name",
  );
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  neonConfig.webSocketConstructor = ws;

  const pool = new Pool({ connectionString, max: 5 });
  try {
    const db = drizzle({ client: pool, schema });
    hydrateRoles(await db.select().from(schema.roles));

    console.log("company settings write-path checks:");
    await forbiddenRoleIsRefused(db);
    await blankInputIsRefused(db);
    await aPermittedEditPersistsAndIsAudited(db);
    console.log("ok");
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
