/**
 * The guarantees ticket 14 needs that Playwright cannot express.
 *
 *  1. Authorization is in the domain function, not the Receive tab (ADR-0004).
 *     A browser test always goes through a page whose render gate already hid
 *     the control, so it can only prove the gate. This calls `dispatchTransfer`
 *     and `receiveTransfer` directly, as automation or a REST caller would, and
 *     asserts the domain refuses a Role without `transfers` and writes nothing.
 *
 *  2. Consistent lock order — no deadlock (the riskiest decision in the ticket).
 *     Two transfers between the same pair of Warehouses, whose lines name the
 *     same two products in opposite order, are despatched concurrently. If the
 *     choke-point row locks were taken in line order they would deadlock (A
 *     locks P1 then P2 while B locks P2 then P1); `dispatchTransfer` sorts every
 *     draw by `stock_rows.seq` first, so both lock low-seq-first and both
 *     commit. A browser cannot issue two simultaneous operations.
 *
 *  3. Both ends of a despatch commit together or not at all (spec story 26). A
 *     two-line despatch whose second line cannot be covered is rejected whole —
 *     no `transfer-out`, no Event, no state change — so stock never leaves the
 *     source without being recorded in transit, and a half-despatched transfer
 *     cannot exist.
 *
 *  4. Raising a transfer (ticket 08) checks `transfers.create`, refuses a Role
 *     without it while writing no transfer, no lines and no Event, refuses a
 *     route the form would never offer (the same site at both ends, a product
 *     the source does not hold), and lands the transfer in `draft` with nothing
 *     in transit and no Movement — until that same transfer is approved and
 *     despatched through `dispatchTransfer`.
 *
 * Run with `npm run check:transfers` against a migrated, seeded database; CI
 * runs it after `check:fulfilment`. Its own Pool under plain Node, same as the
 * seed and the other check scripts. Every mutation it makes is reversed (or its
 * throwaway rows deleted) so the shared branch the Playwright suite then
 * asserts against is left exactly as seeded — bar the append-only Event stream,
 * which CI truncates on reseed.
 */

import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

import { Pool, neonConfig } from "@neondatabase/serverless";
import { and, eq, inArray, isNull, notInArray, sql } from "drizzle-orm";
import { drizzle, type NeonDatabase } from "drizzle-orm/neon-serverless";
import ws from "ws";

import { hydrateRoles, can } from "@/lib/auth/permissions";
import * as schema from "@/lib/db/schema";
import { applyStockChange, type Actor } from "@/lib/domain/stock";
import {
  createTransfer,
  dispatchTransfer,
  receiveTransfer,
  OPEN_TRANSFER_STATUSES,
  TransferError,
  type CreateTransferInput,
} from "@/lib/domain/transfers";

type Db = NeonDatabase<typeof schema>;

async function eventCount(db: Db): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.events);
  return row?.n ?? 0;
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

interface Holding {
  productId: string;
  warehouseId: string;
  locationId: string;
  onHand: number;
}

/**
 * A source warehouse with two products that each sit in exactly one un-lotted
 * holding there with room to spare — so a small despatch draws entirely from
 * that one row and can be reversed by a single equal-and-opposite change.
 */
async function pickPair(db: Db): Promise<{ from: string; to: string; a: Holding; b: Holding }> {
  const rows = await db
    .select({
      productId: schema.stockRows.productId,
      warehouseId: schema.stockRows.warehouseId,
      locationId: schema.stockRows.locationId,
      onHand: schema.stockRows.onHand,
    })
    .from(schema.stockRows)
    .where(and(isNull(schema.stockRows.lotNumber), sql`${schema.stockRows.onHand} >= 20`));

  const byWarehouse = new Map<string, Map<string, Holding[]>>();
  for (const r of rows) {
    const perProduct = byWarehouse.get(r.warehouseId) ?? new Map<string, Holding[]>();
    const list = perProduct.get(r.productId) ?? [];
    list.push(r);
    perProduct.set(r.productId, list);
    byWarehouse.set(r.warehouseId, perProduct);
  }

  const warehouses = await db.select({ id: schema.warehouses.id }).from(schema.warehouses);

  for (const [from, perProduct] of byWarehouse) {
    const singles = [...perProduct.values()].filter((l) => l.length === 1).map((l) => l[0]);
    if (singles.length < 2) continue;
    const to = warehouses.find((w) => w.id !== from)?.id;
    if (!to) continue;
    return { from, to, a: singles[0], b: singles[1] };
  }
  throw new Error("checks: no warehouse with two single-holding un-lotted products");
}

async function sumOnHand(db: Db, productId: string, warehouseId: string): Promise<number> {
  const [row] = await db
    .select({ qty: sql<number>`coalesce(sum(${schema.stockRows.onHand}), 0)::int` })
    .from(schema.stockRows)
    .where(
      and(
        eq(schema.stockRows.productId, productId),
        eq(schema.stockRows.warehouseId, warehouseId),
      ),
    );
  return row?.qty ?? 0;
}

let seq = 0;
async function makeApprovedTransfer(
  db: Db,
  opts: { from: string; to: string; requestedBy: string; lines: { holding: Holding; qty: number }[] },
): Promise<string> {
  const id = `TT-CHK-${Date.now()}-${seq++}`;
  const now = new Date().toISOString();
  await db.insert(schema.transfers).values({
    id,
    number: id,
    fromWarehouseId: opts.from,
    toWarehouseId: opts.to,
    status: "approved",
    createdAt: now,
    approvedAt: now,
    shippedAt: null,
    expectedAt: now,
    receivedAt: null,
    requestedBy: opts.requestedBy,
    approvedBy: opts.requestedBy,
    approvals: [],
    carrier: null,
    trackingNumber: null,
    reason: "checks: consistent lock order",
    notes: "",
  });
  await db.insert(schema.transferLines).values(
    opts.lines.map((l, n) => ({
      transferId: id,
      id: `TL-${n + 1}`,
      productId: l.holding.productId,
      sku: `chk-${l.holding.productId}`,
      name: "checks",
      quantity: l.qty,
      shipped: 0,
      received: 0,
      fromLocationId: l.holding.locationId,
      toLocationId: null,
    })),
  );
  return id;
}

async function deleteTransfer(db: Db, id: string): Promise<void> {
  await db.delete(schema.transferLines).where(eq(schema.transferLines.transferId, id));
  await db.delete(schema.transfers).where(eq(schema.transfers.id, id));
}

/** Undo every `transfer-out` a throwaway transfer wrote, exactly where it landed. */
async function reverseDispatch(db: Db, actor: Actor, transferId: string): Promise<void> {
  const outs = await db
    .select()
    .from(schema.movements)
    .where(eq(schema.movements.refId, transferId));
  for (const m of outs) {
    await applyStockChange(
      actor,
      {
        productId: m.productId,
        warehouseId: m.warehouseId,
        locationId: m.locationId,
        lotNumber: null,
        movementType: "count-correction",
        onHandDelta: -m.qtyChange,
        reason: "checks: restore lock-order despatch",
        permission: { module: "counts", action: "create" },
      },
      db,
    );
  }
}

async function forbiddenIsRefusedAndWritesNothing(db: Db): Promise<void> {
  const forbidden = await actorForRole(db, "auditor");
  assert.equal(
    can(forbidden.role, "transfers", "edit"),
    false,
    "precondition: the chosen role must not be able to edit transfers",
  );

  const { from, to, a, b } = await pickPair(db);
  const requestedBy = (await actorForRole(db, "inventory-manager")).id;
  const transferId = await makeApprovedTransfer(db, {
    from,
    to,
    requestedBy,
    lines: [{ holding: a, qty: 3 }],
  });

  try {
    const before = await eventCount(db);

    await assert.rejects(
      () => dispatchTransfer(forbidden, { transferId }, db),
      (err: unknown) => err instanceof TransferError && err.code === "forbidden",
      "dispatchTransfer must throw TransferError('forbidden') for a role without transfers",
    );
    await assert.rejects(
      () =>
        receiveTransfer(
          forbidden,
          { transferId, locationId: b.locationId, lines: [{ lineId: "TL-1", receivedQty: 1 }] },
          db,
        ),
      (err: unknown) => err instanceof TransferError && err.code === "forbidden",
      "receiveTransfer must throw TransferError('forbidden') for a role without transfers",
    );

    const after = await eventCount(db);
    assert.equal(after, before, `a refused transfer action appended ${after - before} event(s); expected 0`);
    console.log(`  forbidden: ${forbidden.role} refused both ends directly, event stream unchanged (${after})`);
  } finally {
    await deleteTransfer(db, transferId);
  }
}

async function concurrentDespatchesDoNotDeadlock(db: Db): Promise<void> {
  const operator = await actorForRole(db, "warehouse-staff");
  assert.equal(can(operator.role, "transfers", "edit"), true, "precondition: operator can edit transfers");

  const { from, to, a, b } = await pickPair(db);
  const requestedBy = (await actorForRole(db, "inventory-manager")).id;

  const QTY = 2;
  // TA names product A then product B; TB names them in the opposite order.
  const ta = await makeApprovedTransfer(db, {
    from,
    to,
    requestedBy,
    lines: [{ holding: a, qty: QTY }, { holding: b, qty: QTY }],
  });
  const tb = await makeApprovedTransfer(db, {
    from,
    to,
    requestedBy,
    lines: [{ holding: b, qty: QTY }, { holding: a, qty: QTY }],
  });

  try {
    const aBefore = await sumOnHand(db, a.productId, from);
    const bBefore = await sumOnHand(db, b.productId, from);

    // Fire both at once. A deadlock would surface as one branch rejecting with
    // Postgres error 40P01, not as a hang.
    const settled = await Promise.allSettled([
      dispatchTransfer(operator, { transferId: ta }, db),
      dispatchTransfer(operator, { transferId: tb }, db),
    ]);
    for (const [i, s] of settled.entries()) {
      assert.equal(
        s.status,
        "fulfilled",
        `despatch ${i === 0 ? "A" : "B"} ${s.status === "rejected" ? `rejected: ${s.reason}` : ""} — a deadlock or lost lock`,
      );
    }

    const aAfter = await sumOnHand(db, a.productId, from);
    const bAfter = await sumOnHand(db, b.productId, from);
    assert.equal(aAfter, aBefore - 2 * QTY, `product A on-hand ${aBefore} -> ${aAfter}, expected -${2 * QTY} (both transfers serialised)`);
    assert.equal(bAfter, bBefore - 2 * QTY, `product B on-hand ${bBefore} -> ${bAfter}, expected -${2 * QTY}`);

    console.log(
      `  lock order: ${ta} and ${tb} despatched concurrently between ${from} -> ${to}, no deadlock, on-hand -${2 * QTY} each product`,
    );
  } finally {
    await reverseDispatch(db, operator, ta);
    await reverseDispatch(db, operator, tb);
    await deleteTransfer(db, ta);
    await deleteTransfer(db, tb);
  }
}

async function partialFailureLeavesNoTrace(db: Db): Promise<void> {
  const operator = await actorForRole(db, "warehouse-staff");
  const { from, to, a, b } = await pickPair(db);
  const requestedBy = (await actorForRole(db, "inventory-manager")).id;

  // Line 1 is coverable; line 2 asks for far more of product B than exists.
  const bOnHand = await sumOnHand(db, b.productId, from);
  const transferId = await makeApprovedTransfer(db, {
    from,
    to,
    requestedBy,
    lines: [
      { holding: a, qty: 3 },
      { holding: b, qty: bOnHand + 1_000_000 },
    ],
  });

  try {
    const before = await eventCount(db);
    const aBefore = await sumOnHand(db, a.productId, from);

    await assert.rejects(
      () => dispatchTransfer(operator, { transferId }, db),
      (err: unknown) => err instanceof TransferError && err.code === "insufficient-stock",
      "dispatchTransfer must reject a despatch whose second line cannot be covered",
    );

    const aAfter = await sumOnHand(db, a.productId, from);
    assert.equal(aAfter, aBefore, "the first line's transfer-out rolled back");
    assert.equal(await eventCount(db), before, "no Event survived the failed despatch");

    const [t] = await db
      .select({ status: schema.transfers.status })
      .from(schema.transfers)
      .where(eq(schema.transfers.id, transferId));
    assert.equal(t.status, "approved", "the transfer did not advance");

    console.log(`  atomic: a despatch failing on line 2 left on-hand, the Event stream and ${transferId} untouched`);
  } finally {
    await deleteTransfer(db, transferId);
  }
}

/** Row counts of everything a creation writes, as one snapshot to compare. */
async function creationCounts(
  db: Db,
): Promise<{ events: number; transfers: number; lines: number }> {
  const [[events], [transfers], [lines]] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(schema.events),
    db.select({ n: sql<number>`count(*)::int` }).from(schema.transfers),
    db.select({ n: sql<number>`count(*)::int` }).from(schema.transferLines),
  ]);
  return { events: events.n, transfers: transfers.n, lines: lines.n };
}

/**
 * The in-transit balance for a product, projected the way `documents.ts`
 * projects it: `sum(shipped - received)` over the lines of open Transfers. Not
 * a stored balance — creation must leave this untouched.
 */
async function projectedInTransit(db: Db, productId: string): Promise<number> {
  const [row] = await db
    .select({
      qty: sql<number>`coalesce(sum(${schema.transferLines.shipped} - ${schema.transferLines.received}), 0)::int`,
    })
    .from(schema.transferLines)
    .innerJoin(schema.transfers, eq(schema.transfers.id, schema.transferLines.transferId))
    .where(
      and(
        eq(schema.transferLines.productId, productId),
        inArray(schema.transfers.status, [...OPEN_TRANSFER_STATUSES]),
      ),
    );
  return row?.qty ?? 0;
}

/** A well-formed one-line transfer of `holding`'s product, `from` -> `to`. */
function raisable(
  from: string,
  to: string,
  holding: Holding,
  quantity: number,
): CreateTransferInput {
  return {
    fromWarehouseId: from,
    toWarehouseId: to,
    reason: "checks: raising a transfer",
    notes: "",
    carrier: null,
    expectedInDays: 5,
    lines: [{ productId: holding.productId, quantity }],
  };
}

async function creationIsRefusedForAForbiddenRole(db: Db): Promise<void> {
  const forbidden = await actorForRole(db, "auditor");
  assert.equal(
    can(forbidden.role, "transfers", "create"),
    false,
    "precondition: the chosen role must not be able to create transfers",
  );

  const { from, to, a } = await pickPair(db);
  const before = await creationCounts(db);

  await assert.rejects(
    () => createTransfer(forbidden, raisable(from, to, a, 1), db),
    (err: unknown) => err instanceof TransferError && err.code === "forbidden",
    "createTransfer must throw TransferError('forbidden') for a role without transfers.create",
  );

  assert.deepEqual(
    await creationCounts(db),
    before,
    "a refused creation wrote a transfer, a line or an event; expected none",
  );
  console.log(`  create/forbidden: ${forbidden.role} refused directly, nothing written`);
}

async function impossibleRoutesAreRefused(db: Db): Promise<void> {
  const actor = await actorForRole(db, "inventory-manager");
  assert.equal(
    can(actor.role, "transfers", "create"),
    true,
    "precondition: the chosen role must be able to create transfers",
  );

  const { from, to, a } = await pickPair(db);
  const before = await creationCounts(db);

  // Both ends the same site: there is no despatch and no receipt to make. The
  // form disables its button on this, but the form is only a rendering gate.
  await assert.rejects(
    () => createTransfer(actor, raisable(from, from, a, 1), db),
    (err: unknown) => err instanceof TransferError && err.code === "invalid",
    "createTransfer must refuse a transfer whose source and destination are the same warehouse",
  );

  // A product the source does not hold: it could never be despatched, and the
  // line has no `from_location_id` to record.
  const held = await db
    .select({ productId: schema.stockRows.productId })
    .from(schema.stockRows)
    .where(eq(schema.stockRows.warehouseId, from));
  const [unheld] = await db
    .select({ id: schema.products.id })
    .from(schema.products)
    .where(
      notInArray(
        schema.products.id,
        held.map((h) => h.productId),
      ),
    )
    .limit(1);
  if (!unheld) throw new Error("checks: every product is held at the source warehouse");

  await assert.rejects(
    () =>
      createTransfer(
        actor,
        { ...raisable(from, to, a, 1), lines: [{ productId: unheld.id, quantity: 1 }] },
        db,
      ),
    (err: unknown) => err instanceof TransferError && err.code === "invalid",
    "createTransfer must refuse a line whose product is not held at the source",
  );

  assert.deepEqual(
    await creationCounts(db),
    before,
    "a refused creation wrote a transfer, a line or an event; expected none",
  );
  console.log(
    "  create/route: same site at both ends, and a product the source does not hold, both refused",
  );
}

async function creationMovesNothingButDespatchDoes(db: Db): Promise<void> {
  const actor = await actorForRole(db, "inventory-manager");
  const operator = await actorForRole(db, "warehouse-staff");
  const { from, to, a } = await pickPair(db);

  const QTY = 3;
  const inTransitBefore = await projectedInTransit(db, a.productId);
  const onHandBefore = await sumOnHand(db, a.productId, from);

  const transfer = await createTransfer(actor, raisable(from, to, a, QTY), db);
  try {
    const [row] = await db
      .select({ status: schema.transfers.status, requestedBy: schema.transfers.requestedBy })
      .from(schema.transfers)
      .where(eq(schema.transfers.id, transfer.id));
    assert.equal(row.status, "draft", "a raised transfer must land in draft");
    assert.equal(row.requestedBy, actor.id, "the transfer must be attributed to the Actor");

    // By payload, not "the newest row": the Event stream is append-only and
    // shared, so anything else committing alongside this would win a seq race.
    const [event] = await db
      .select({ type: schema.events.type, actorId: schema.events.actorId })
      .from(schema.events)
      .where(sql`${schema.events.payload}->>'transferId' = ${transfer.id}`);
    assert.equal(event.type, "transfer-created", "creation must append a transfer-created Event");
    assert.equal(event.actorId, actor.id, "the Event must be attributed to the Actor");

    assert.equal(
      await projectedInTransit(db, a.productId),
      inTransitBefore,
      "a draft transfer put stock in transit; creation must create no in-transit quantity",
    );
    assert.equal(
      await sumOnHand(db, a.productId, from),
      onHandBefore,
      "creation moved stock at the source; a draft is a plan and moves nothing",
    );
    const [movements] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.movements)
      .where(eq(schema.movements.refId, transfer.id));
    assert.equal(movements.n, 0, "creation appended a Movement; a draft moves no stock");

    // The document the write path operates on is real: approve it (ticket 11's
    // transition, so set here directly) and the existing `dispatchTransfer`
    // takes it from there — stock leaves the source and goes in transit.
    await db
      .update(schema.transfers)
      .set({ status: "approved", approvedAt: new Date().toISOString(), approvedBy: actor.id })
      .where(eq(schema.transfers.id, transfer.id));

    const dispatched = await dispatchTransfer(operator, { transferId: transfer.id }, db);
    assert.equal(dispatched.totalShipped, QTY, "the approved transfer did not despatch in full");
    assert.equal(
      await sumOnHand(db, a.productId, from),
      onHandBefore - QTY,
      "despatching the raised transfer did not lower on-hand at the source",
    );
    assert.equal(
      await projectedInTransit(db, a.productId),
      inTransitBefore + QTY,
      "despatching the raised transfer did not put its quantity in transit",
    );

    console.log(
      `  create: ${transfer.number} raised in draft — nothing in transit, no Movement; approving and despatching it moved ${QTY} (reversed)`,
    );
  } finally {
    await reverseDispatch(db, operator, transfer.id);
    await deleteTransfer(db, transfer.id);
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

    console.log("transfer checks:");
    await forbiddenIsRefusedAndWritesNothing(db);
    await creationIsRefusedForAForbiddenRole(db);
    await impossibleRoutesAreRefused(db);
    await creationMovesNothingButDespatchDoes(db);
    await concurrentDespatchesDoNotDeadlock(db);
    await partialFailureLeavesNoTrace(db);
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
