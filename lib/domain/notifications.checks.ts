/**
 * The guarantees ticket 12's notification dismissal needs that Playwright cannot
 * express.
 *
 * The e2e suite (`e2e/notification-dismiss.write.spec.ts`) drives the page: a
 * row is dismissed and stays gone across a reload. But ADR-0004 puts the real
 * permission check in the domain function, and the "reached directly by a Role
 * without access it refuses and writes nothing" clause of the ADR-0009
 * amendment lives below the UI.
 *
 *  1. A principal whose Role has no `dashboard` access is refused with
 *     `forbidden`, and nothing is written. No seeded Role fails this today —
 *     every one has at least `dashboard: read` — so the check builds a
 *     no-access Actor directly, which is exactly the state ticket 13 makes
 *     reachable by editing a Role down.
 *  2. An unknown notification id is refused with `not-found`, nothing written.
 *  3. A permitted Role (story 24: "as any user") dismisses a seeded
 *     notification — the column flips, no Event is appended — and a second call
 *     is an idempotent no-op.
 *
 * Run with `npm run check:notifications` against a migrated, seeded database.
 * Its own Pool under plain Node (`lib/db/client.ts` is `server-only`). Every
 * mutation it makes is reversed, so the branch the Playwright suite then
 * asserts against is left exactly as seeded.
 */

import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

import { Pool, neonConfig } from "@neondatabase/serverless";
import { eq, sql } from "drizzle-orm";
import { drizzle, type NeonDatabase } from "drizzle-orm/neon-serverless";
import ws from "ws";

import { hydrateRoles, can } from "@/lib/auth/permissions";
import * as schema from "@/lib/db/schema";
import { dismissNotification, NotificationError } from "@/lib/domain/notifications";
import type { Actor } from "@/lib/domain/stock";
import type { Role } from "@/lib/types";

type Db = NeonDatabase<typeof schema>;

async function eventCount(db: Db): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.events);
  return row?.n ?? 0;
}

async function isDismissed(db: Db, id: string): Promise<boolean> {
  const [row] = await db
    .select({ dismissed: schema.notifications.dismissed })
    .from(schema.notifications)
    .where(eq(schema.notifications.id, id));
  if (!row) throw new Error(`checks: no seeded notification "${id}"`);
  return row.dismissed;
}

async function actorForRole(db: Db, role: string): Promise<Actor> {
  const [user] = await db
    .select({ id: schema.users.id, name: schema.users.name, role: schema.users.role })
    .from(schema.users)
    .where(eq(schema.users.role, role as Actor["role"]))
    .limit(1);
  if (!user) throw new Error(`checks: no seeded user with role "${role}"`);
  return user;
}

/** A seeded notification that has not been dismissed. */
async function aLiveNotification(db: Db): Promise<string> {
  const [row] = await db
    .select({ id: schema.notifications.id })
    .from(schema.notifications)
    .where(eq(schema.notifications.dismissed, false))
    .limit(1);
  if (!row) throw new Error("checks: seed has no un-dismissed notification");
  return row.id;
}

async function noAccessIsRefused(db: Db): Promise<void> {
  // No seeded Role lacks `dashboard`, so name one that is not in the matrix —
  // `levelFor` resolves an unknown Role to `none`, the same state ticket 13
  // produces by editing a Role down to no app access.
  const lockedOut: Actor = { id: "USR-checks", name: "Locked Out", role: "no-access" as Role };
  assert.equal(can(lockedOut.role, "dashboard"), false, "precondition: the Role has no dashboard access");

  const id = await aLiveNotification(db);
  const events = await eventCount(db);

  await assert.rejects(
    () => dismissNotification(lockedOut, { id }, db),
    (err: unknown) => err instanceof NotificationError && err.code === "forbidden",
    "a Role without dashboard access must be refused at the domain function",
  );

  assert.equal(await isDismissed(db, id), false, "a refused dismissal still wrote the column");
  assert.equal(await eventCount(db), events, "a refused dismissal appended an Event; expected none");
  console.log("  forbidden: a locked-out Role is refused, nothing written");
}

async function unknownIdIsRefused(db: Db): Promise<void> {
  const actor = await actorForRole(db, "warehouse-staff");
  const events = await eventCount(db);

  await assert.rejects(
    () => dismissNotification(actor, { id: "NTF-does-not-exist" }, db),
    (err: unknown) => err instanceof NotificationError && err.code === "not-found",
    "an unknown notification id must be refused",
  );

  assert.equal(await eventCount(db), events, "a not-found dismissal appended an Event; expected none");
  console.log("  not-found: an unknown id is refused");
}

async function anyUserCanDismissAndItSticks(db: Db): Promise<void> {
  // Story 24 is "as any user" — warehouse staff clearing a stock alert is the
  // case, and that Role has only `dashboard: read`.
  const actor = await actorForRole(db, "warehouse-staff");
  assert.equal(can(actor.role, "dashboard"), true, "precondition: the Role can view the app");

  const id = await aLiveNotification(db);
  const events = await eventCount(db);

  try {
    const first = await dismissNotification(actor, { id }, db);
    assert.equal(first.id, id, "the dismissed notification is returned");
    assert.equal(await isDismissed(db, id), true, "the column flipped to dismissed");

    // Idempotent — a second dismissal is a no-op that still resolves.
    await dismissNotification(actor, { id }, db);
    assert.equal(await isDismissed(db, id), true, "a repeat dismissal left it dismissed");

    assert.equal(await eventCount(db), events, "dismissing a notification appended an Event; expected none");
    console.log(`  dismiss: ${id} flipped and stays, no Event, repeat is a no-op`);
  } finally {
    await db
      .update(schema.notifications)
      .set({ dismissed: false })
      .where(eq(schema.notifications.id, id));
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

    console.log("notification dismissal checks:");
    await noAccessIsRefused(db);
    await unknownIdIsRefused(db);
    await anyUserCanDismissAndItSticks(db);
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
