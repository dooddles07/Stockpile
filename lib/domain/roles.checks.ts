/**
 * The guarantees ticket 13's permission write-path needs that Playwright cannot
 * express.
 *
 * The e2e suite (`e2e/roles-permission-matrix.write.spec.ts`) drives the editor:
 * an admin narrows a module on a Role and that Role is then refused the page it
 * used to reach. ADR-0004 puts the real check in the domain function, and its
 * "reached directly by a Role without access, refused, writes nothing" clause
 * lives below the UI:
 *
 *  1. A principal whose Role cannot `manage` `roles` is refused with
 *     `forbidden`, and nothing is written — not the matrix, not an audit row.
 *  2. The last Role holding `roles: manage` (the seeded Super Admin) is refused
 *     with `last-admin` when it tries to drop that, and nothing is written.
 *  3. A permitted Actor narrows a module on another Role: the column changes,
 *     one `permission-change` audit row lands attributed to the Actor, and the
 *     change is visible to a fresh `hydrateRoles`. Reverted afterwards.
 *
 * Run with `npm run check:roles` against a migrated, seeded database. Its own
 * Pool under plain Node (`lib/db/client.ts` is `server-only`). Every mutation
 * it makes is reversed, so the seed the Playwright suite then drives is left
 * exactly as it started.
 */

import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

import { Pool, neonConfig } from "@neondatabase/serverless";
import { eq, sql } from "drizzle-orm";
import { drizzle, type NeonDatabase } from "drizzle-orm/neon-serverless";
import ws from "ws";

import { can, hydrateRoles } from "@/lib/auth/permissions";
import * as schema from "@/lib/db/schema";
import { RolePermissionError, updateRolePermissions } from "@/lib/domain/roles";
import type { Actor } from "@/lib/domain/stock";
import type { AccessLevel, ModuleKey, Role } from "@/lib/types";

type Db = NeonDatabase<typeof schema>;

async function auditCount(db: Db): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.auditEntries);
  return row?.n ?? 0;
}

async function levelOf(db: Db, roleId: Role, module: ModuleKey): Promise<AccessLevel> {
  const [row] = await db
    .select({ permissions: schema.roles.permissions })
    .from(schema.roles)
    .where(eq(schema.roles.id, roleId));
  if (!row) throw new Error(`checks: no seeded role "${roleId}"`);
  return row.permissions[module] ?? "none";
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

async function noAdminAccessIsRefused(db: Db): Promise<void> {
  // Inventory Manager has `roles: none` in the seed — it can reach this page in
  // the UI only as a render gate, and must be refused below it.
  const actor = await actorForRole(db, "inventory-manager");
  assert.equal(can(actor.role, "roles", "manage"), false, "precondition: the Role cannot manage roles");

  const before = await levelOf(db, "auditor", "stock");
  const audits = await auditCount(db);

  await assert.rejects(
    () => updateRolePermissions(actor, "auditor", { stock: "none" }, db),
    (err: unknown) => err instanceof RolePermissionError && err.code === "forbidden",
    "a Role that cannot manage roles must be refused at the domain function",
  );

  assert.equal(await levelOf(db, "auditor", "stock"), before, "a refused edit still changed the matrix");
  assert.equal(await auditCount(db), audits, "a refused edit still wrote an audit row");
  console.log("  forbidden: a Role without roles:manage is refused, nothing written");
}

async function lastAdminCannotDropIt(db: Db): Promise<void> {
  // Super Admin is the only seeded Role with `roles: manage`. It cannot narrow
  // its own `roles` access — that is the one edit with no way back.
  const actor = await actorForRole(db, "super-admin");
  const audits = await auditCount(db);

  await assert.rejects(
    () => updateRolePermissions(actor, "super-admin", { roles: "read" }, db),
    (err: unknown) => err instanceof RolePermissionError && err.code === "last-admin",
    "the last holder of roles:manage must not be able to drop it",
  );

  assert.equal(await levelOf(db, "super-admin", "roles"), "manage", "Super Admin lost roles:manage");
  assert.equal(await auditCount(db), audits, "a refused last-admin edit still wrote an audit row");
  console.log("  last-admin: Super Admin cannot drop its own roles:manage, nothing written");
}

async function aPermittedEditPersistsAndIsAudited(db: Db): Promise<void> {
  const actor = await actorForRole(db, "super-admin");
  const original = await levelOf(db, "auditor", "adjustments");
  assert.notEqual(original, "none", "precondition: the Role has this access to begin with");
  const audits = await auditCount(db);

  try {
    const result = await updateRolePermissions(actor, "auditor", { adjustments: "none" }, db);
    assert.deepEqual(
      result.changed.map((c) => c.module),
      ["adjustments"],
      "the change list names the one module that moved",
    );
    assert.equal(await levelOf(db, "auditor", "adjustments"), "none", "the column did not change");
    assert.equal(await auditCount(db), audits + 1, "exactly one audit row should be added");

    const [entry] = await db
      .select()
      .from(schema.auditEntries)
      .orderBy(sql`${schema.auditEntries.seq} desc`)
      .limit(1);
    assert.equal(entry?.action, "permission-change", "the audit row is a permission-change");
    assert.equal(entry?.entityId, "auditor", "the audit row points at the edited Role");
    assert.equal(entry?.userId, actor.id, "the audit row names the Actor who made the change");

    // A fresh hydrate — the request path's `ensureRoles` — sees the new level.
    hydrateRoles(await db.select().from(schema.roles));
    assert.equal(can("auditor" as Role, "adjustments", "view"), false, "hydrateRoles did not pick up the write");

    console.log("  edit: a narrowed module persisted, audited, and live on the next hydrate");
  } finally {
    await db
      .update(schema.roles)
      .set({
        permissions: sql`${schema.roles.permissions} || ${JSON.stringify({ adjustments: original })}::jsonb`,
      })
      .where(eq(schema.roles.id, "auditor"));
    // Drop the audit rows this check appended so the seeded log is unchanged.
    await db
      .delete(schema.auditEntries)
      .where(eq(schema.auditEntries.device, "admin permission editor"));
  }
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  neonConfig.webSocketConstructor = ws;

  const pool = new Pool({ connectionString, max: 5 });
  try {
    const db = drizzle({ client: pool, schema });
    hydrateRoles(await db.select().from(schema.roles));

    console.log("role permission write-path checks:");
    await noAdminAccessIsRefused(db);
    await lastAdminCannotDropIt(db);
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
