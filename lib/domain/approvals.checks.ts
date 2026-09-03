/**
 * The guarantees ticket 11 needs that Playwright cannot express.
 *
 * The e2e suite drives the Approvals queue: a decider approves a Purchase Order
 * and receives it, and an Auditor sees the queue but has no controls. But
 * ADR-0004 puts the real permission check in the domain function, and the
 * "refused for each of the four types when reached directly" criterion, the
 * "not in its pending status is refused rather than re-decided" criterion, the
 * "rejection requires a reason" criterion and the "an Event but no Movement per
 * decision" criterion all live below the UI — a browser test always goes
 * through a queue whose controls were already hidden.
 *
 *  1. A Role without `approve` on a type's module is refused by every one of the
 *     four wrappers, with nothing written.
 *  2. A Document already decided (or otherwise not in its pending status) is
 *     refused with `wrong-state`, not silently re-approved.
 *  3. A rejection with no reason is refused with `invalid`.
 *  4. Approving a submitted Purchase Order writes `ordered` — a state the
 *     existing `receiveGoods` accepts — appends exactly one
 *     `purchase-order-approved` Event attributed to the Actor, and appends no
 *     Movement. The same one-Event / no-Movement shape is checked for approving
 *     a transfer.
 *  5. Rejecting records the reason, is terminal, does not write `approvedBy`,
 *     and appends one Event and no Movement.
 *
 * Run with `npm run check:approvals` against a migrated, seeded database. Its
 * own Pool under plain Node, same as the seed and the other check scripts —
 * `lib/db/client.ts` is `server-only`. Every mutation it makes is reversed and
 * every Event it appends is deleted, so the branch the Playwright suite then
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
import {
  ApprovalError,
  decideOnAdjustment,
  decideOnPurchaseOrder,
  decideOnStockCount,
  decideOnTransfer,
  type DecideInput,
} from "@/lib/domain/approvals";
import { isReceivable } from "@/lib/domain/receiving";
import type { Actor } from "@/lib/domain/stock";

type Db = NeonDatabase<typeof schema>;

async function eventCount(db: Db): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.events);
  return row?.n ?? 0;
}

async function maxEventSeq(db: Db): Promise<number> {
  const [row] = await db.select({ n: sql<number>`coalesce(max(seq), 0)::int` }).from(schema.events);
  return row?.n ?? 0;
}

/**
 * Delete the events appended since `seqBefore`, undoing what a check exercised.
 *
 * The append-only trigger (migration 0009) rejects a bare DELETE; migration 0015
 * lets it through for a transaction that has opted in with
 * `stockpile.allow_events_rewind`. `SET LOCAL` is transaction-scoped, so the
 * DELETE has to share the transaction — the Pool hands out connections that
 * outlive a statement.
 */
async function rewindEvents(db: Db, seqBefore: number): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL stockpile.allow_events_rewind = 'on'`);
    await tx.delete(schema.events).where(sql`${schema.events.seq} > ${seqBefore}`);
  });
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

/** One seeded Document of each type, in the pending status a decision needs. */
async function pendingDocs(db: Db) {
  const [po] = await db
    .select({ id: schema.purchaseOrders.id, number: schema.purchaseOrders.number })
    .from(schema.purchaseOrders)
    .where(eq(schema.purchaseOrders.status, "submitted"))
    .limit(1);
  const [transfer] = await db
    .select({ id: schema.transfers.id, number: schema.transfers.number })
    .from(schema.transfers)
    .where(eq(schema.transfers.status, "pending-approval"))
    .limit(1);
  const [adjustment] = await db
    .select({ id: schema.adjustments.id, number: schema.adjustments.number })
    .from(schema.adjustments)
    .where(eq(schema.adjustments.status, "pending-approval"))
    .limit(1);
  const [count] = await db
    .select({ id: schema.stockCounts.id, number: schema.stockCounts.number })
    .from(schema.stockCounts)
    .where(eq(schema.stockCounts.status, "review"))
    .limit(1);
  if (!po || !transfer || !adjustment || !count) {
    throw new Error("checks: seed is missing a pending document of every type");
  }
  return { po, transfer, adjustment, count };
}

async function forbiddenIsRefusedForEveryType(db: Db): Promise<void> {
  // Auditor is read-only across the recorded history — never `approve`.
  const auditor = await actorForRole(db, "auditor");
  for (const m of ["purchase-orders", "transfers", "adjustments", "counts"] as const) {
    assert.equal(
      can(auditor.role, m, "approve"),
      false,
      `precondition: auditor must not be able to approve ${m}`,
    );
  }

  const docs = await pendingDocs(db);
  const before = await eventCount(db);

  // The four thin wrappers, called directly — one per Document type, so the
  // refusal is proven against each `DocKind` and not only the dispatcher.
  const wrappers: [string, string, (a: Actor, i: DecideInput, db: Db) => Promise<unknown>][] = [
    ["purchase order", docs.po.id, decideOnPurchaseOrder],
    ["transfer", docs.transfer.id, decideOnTransfer],
    ["adjustment", docs.adjustment.id, decideOnAdjustment],
    ["stock count", docs.count.id, decideOnStockCount],
  ];
  for (const [label, id, wrapper] of wrappers) {
    await assert.rejects(
      () => wrapper(auditor, { id, decision: "approve" }, db),
      (err: unknown) => err instanceof ApprovalError && err.code === "forbidden",
      `${label}: an auditor reaching the domain function directly must be refused`,
    );
  }

  assert.equal(await eventCount(db), before, "a refused decision appended an Event; expected none");
  console.log("  forbidden: auditor refused directly for all four types, nothing written");
}

async function wrongStatusIsRefused(db: Db): Promise<void> {
  // A transfer that is already approved cannot be approved again.
  const [approved] = await db
    .select({ id: schema.transfers.id, number: schema.transfers.number })
    .from(schema.transfers)
    .where(eq(schema.transfers.status, "approved"))
    .limit(1);
  if (!approved) throw new Error("checks: seed has no already-approved transfer");

  const decider = await actorForRole(db, "inventory-manager");
  assert.equal(can(decider.role, "transfers", "approve"), true, "precondition: role can approve transfers");

  const before = await eventCount(db);
  await assert.rejects(
    () => decideOnTransfer(decider, { id: approved.id, decision: "approve" }, db),
    (err: unknown) => err instanceof ApprovalError && err.code === "wrong-state",
    "a transfer not in pending-approval must be refused, not re-approved",
  );
  assert.equal(await eventCount(db), before, "re-approving an approved transfer appended an Event");
  console.log(`  wrong-state: ${approved.number} (approved) refused rather than re-decided`);
}

async function rejectionNeedsAReason(db: Db): Promise<void> {
  const docs = await pendingDocs(db);
  const decider = await actorForRole(db, "inventory-manager");
  assert.equal(can(decider.role, "adjustments", "approve"), true, "precondition: role can approve adjustments");

  const before = await eventCount(db);
  await assert.rejects(
    () => decideOnAdjustment(decider, { id: docs.adjustment.id, decision: "reject", reason: "   " }, db),
    (err: unknown) => err instanceof ApprovalError && err.code === "invalid",
    "a rejection with a blank reason must be refused",
  );
  assert.equal(await eventCount(db), before, "a reasonless rejection appended an Event");
  console.log("  reason: a rejection with no reason is refused");
}

async function approvingCarriesPurchaseOrderToReceivable(db: Db): Promise<void> {
  const docs = await pendingDocs(db);
  const decider = await actorForRole(db, "purchasing-manager");
  assert.equal(
    can(decider.role, "purchase-orders", "approve"),
    true,
    "precondition: purchasing-manager can approve purchase orders",
  );

  const [snapshot] = await db
    .select()
    .from(schema.purchaseOrders)
    .where(eq(schema.purchaseOrders.id, docs.po.id));
  const seqBefore = await maxEventSeq(db);
  const movementsBefore = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.movements)
    .where(eq(schema.movements.refId, docs.po.id));

  try {
    const result = await decideOnPurchaseOrder(decider, { id: docs.po.id, decision: "approve" }, db);
    assert.equal(result.status, "ordered", "approving a submitted PO must write 'ordered'");
    assert.equal(isReceivable(result.status), true, "the approved PO must be receivable");

    const [after] = await db
      .select()
      .from(schema.purchaseOrders)
      .where(eq(schema.purchaseOrders.id, docs.po.id));
    assert.equal(after.status, "ordered", "the PO row must be 'ordered'");
    assert.equal(after.approvedBy, decider.id, "the deciding Actor must be on the PO");
    assert.ok(after.orderedAt && after.orderedAt !== snapshot.orderedAt, "an approve-time stamp must be written");

    const appended = await db
      .select({ type: schema.events.type, actorId: schema.events.actorId })
      .from(schema.events)
      .where(sql`${schema.events.seq} > ${seqBefore}`);
    assert.equal(appended.length, 1, "exactly one Event must be appended");
    assert.equal(appended[0].type, "purchase-order-approved", "the Event names the decision");
    assert.equal(appended[0].actorId, decider.id, "the Event is attributed to the Actor");

    const [movementsAfter] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.movements)
      .where(eq(schema.movements.refId, docs.po.id));
    assert.equal(movementsAfter.n, movementsBefore[0].n, "approving a PO must append no Movement");

    console.log(`  approve: ${docs.po.number} submitted -> ordered, one Event, no Movement`);
  } finally {
    await db
      .update(schema.purchaseOrders)
      .set({ status: snapshot.status, approvedBy: snapshot.approvedBy, orderedAt: snapshot.orderedAt, approvals: snapshot.approvals })
      .where(eq(schema.purchaseOrders.id, docs.po.id));
    await rewindEvents(db, seqBefore);
  }
}

async function rejectionRecordsReasonAndIsTerminal(db: Db): Promise<void> {
  const docs = await pendingDocs(db);
  const decider = await actorForRole(db, "inventory-manager");

  const [snapshot] = await db
    .select()
    .from(schema.adjustments)
    .where(eq(schema.adjustments.id, docs.adjustment.id));
  const seqBefore = await maxEventSeq(db);

  try {
    const result = await decideOnAdjustment(
      decider,
      { id: docs.adjustment.id, decision: "reject", reason: "Counted against the wrong location." },
      db,
    );
    assert.equal(result.status, "rejected", "rejecting an adjustment writes 'rejected'");

    const [after] = await db
      .select()
      .from(schema.adjustments)
      .where(eq(schema.adjustments.id, docs.adjustment.id));
    assert.equal(after.status, "rejected", "the adjustment row is terminal");
    assert.equal(
      after.approvedBy,
      snapshot.approvedBy,
      "a rejection must not write approvedBy — the rejecter is not an approver",
    );
    assert.equal(
      after.approvals.at(-1)?.note,
      "Counted against the wrong location.",
      "the reason is in the approval log",
    );
    assert.equal(
      after.approvals.at(-1)?.userId,
      decider.id,
      "the deciding Actor is on the approval log entry",
    );

    const appended = await db
      .select({ type: schema.events.type, payload: schema.events.payload })
      .from(schema.events)
      .where(sql`${schema.events.seq} > ${seqBefore}`);
    assert.equal(appended.length, 1, "a rejection appends exactly one Event");
    assert.equal(appended[0].type, "adjustment-rejected", "the Event names the decision");
    assert.equal(
      (appended[0].payload as { reason?: string }).reason,
      "Counted against the wrong location.",
      "the reason is on the Event",
    );

    const [movements] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.movements)
      .where(eq(schema.movements.refId, docs.adjustment.id));
    assert.equal(movements.n, 0, "a rejection appends no Movement");
    console.log(`  reject: ${docs.adjustment.number} -> rejected, reason recorded, terminal, no Movement`);
  } finally {
    await db
      .update(schema.adjustments)
      .set({ status: snapshot.status, approvedBy: snapshot.approvedBy, approvals: snapshot.approvals })
      .where(eq(schema.adjustments.id, docs.adjustment.id));
    await rewindEvents(db, seqBefore);
  }
}

async function approvingATransferRecordsItAndMovesNothing(db: Db): Promise<void> {
  const docs = await pendingDocs(db);
  const decider = await actorForRole(db, "inventory-manager");
  assert.equal(can(decider.role, "transfers", "approve"), true, "precondition: role can approve transfers");

  const [snapshot] = await db
    .select()
    .from(schema.transfers)
    .where(eq(schema.transfers.id, docs.transfer.id));
  const seqBefore = await maxEventSeq(db);

  try {
    const result = await decideOnTransfer(decider, { id: docs.transfer.id, decision: "approve" }, db);
    assert.equal(result.status, "approved", "approving a transfer writes 'approved'");

    const [after] = await db
      .select()
      .from(schema.transfers)
      .where(eq(schema.transfers.id, docs.transfer.id));
    assert.equal(after.status, "approved", "the transfer row is 'approved'");
    assert.equal(after.approvedBy, decider.id, "the deciding Actor is on the transfer");
    assert.ok(
      after.approvedAt && after.approvedAt !== snapshot.approvedAt,
      "an approve-time stamp is written",
    );

    const appended = await db
      .select({ type: schema.events.type })
      .from(schema.events)
      .where(sql`${schema.events.seq} > ${seqBefore}`);
    assert.equal(appended.length, 1, "approving a transfer appends exactly one Event");
    assert.equal(appended[0].type, "transfer-approved", "the Event names the decision");

    const [movements] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.movements)
      .where(eq(schema.movements.refId, docs.transfer.id));
    assert.equal(movements.n, 0, "approving a transfer appends no Movement — stock moves on dispatch");
    console.log(`  approve: ${docs.transfer.number} pending-approval -> approved, one Event, no Movement`);
  } finally {
    await db
      .update(schema.transfers)
      .set({
        status: snapshot.status,
        approvedBy: snapshot.approvedBy,
        approvedAt: snapshot.approvedAt,
        approvals: snapshot.approvals,
      })
      .where(eq(schema.transfers.id, docs.transfer.id));
    await rewindEvents(db, seqBefore);
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

    console.log("approve / reject checks:");
    await forbiddenIsRefusedForEveryType(db);
    await wrongStatusIsRefused(db);
    await rejectionNeedsAReason(db);
    await approvingCarriesPurchaseOrderToReceivable(db);
    await approvingATransferRecordsItAndMovesNothing(db);
    await rejectionRecordsReasonAndIsTerminal(db);
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
