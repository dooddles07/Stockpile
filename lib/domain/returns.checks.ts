/**
 * The guarantees tickets 10 (raising) and 16 (processing) need that Playwright
 * cannot express.
 *
 *  0. Raising is gated in `raiseReturn`, keyed by the Return's kind (ADR-0004):
 *     a Role without `sales-returns` create is refused when it reaches the
 *     function directly, and nothing is written. And a line asking back more
 *     than the source Document moved is refused at creation with `over-return`,
 *     not left for `processReturn` to reject later.
 *
 *  1. Authorization is in the domain function, keyed by the Return's kind
 *     (ADR-0004). A browser test only ever reaches the return screen, whose
 *     render gate already hid the control. This calls `processReturn` directly,
 *     as automation or a REST caller would, and asserts a Role without
 *     `sales-returns` edit is refused and nothing is written.
 *
 *  2. Returning more than the source Document moved is refused. A Return line
 *     whose quantity exceeds what its Sales Order shipped rejects with
 *     `over-return`, changes no balance and appends no Event.
 *
 *  3. The two directions do what the ticket says. A customer Return raises
 *     on-hand for a sellable line and the damaged balance for a line graded
 *     otherwise, both as `return-in` Movements attributed to the Actor; a
 *     supplier Return lowers on-hand as a `return-out` Movement, also attributed
 *     to the Actor. Every stock mutation is restored afterwards.
 *
 * Run with `npm run check:returns` against a migrated, seeded database; CI runs
 * it after `check:counts`. Its own Pool under plain Node, same as the seed and
 * the other check scripts. Every stock mutation it makes is restored and its
 * throwaway Return rows deleted, so the shared branch the Playwright suite then
 * asserts against is left as seeded — bar the append-only Event stream and its
 * Movement rows, which CI truncates on reseed and which no read test counts.
 */

import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

import { Pool, neonConfig } from "@neondatabase/serverless";
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { drizzle, type NeonDatabase } from "drizzle-orm/neon-serverless";
import ws from "ws";

import { hydrateRoles, can } from "@/lib/auth/permissions";
import * as schema from "@/lib/db/schema";
import { type Actor } from "@/lib/domain/stock";
import {
  processReturn,
  raiseReturn,
  ReturnError,
  PROCESSABLE_RETURN_STATUSES,
} from "@/lib/domain/returns";
import type { ItemCondition, ReturnKind } from "@/lib/types";

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

interface SourceProduct {
  /** A product the source moved, sitting in exactly one roomy un-lotted holding there. */
  productId: string;
  sku: string;
  name: string;
  unitPrice: number;
  moved: number;
  onHand: number;
  rowSeq: number;
}

interface SourcePick {
  sourceOrderId: string;
  sourceOrderNumber: string;
  partnerId: string;
  warehouseId: string;
  products: SourceProduct[];
}

/**
 * One shipped Sales Order (or received Purchase Order) that moved at least
 * `opts.lines` distinct products, each moving `minMoved` or more and sitting in
 * exactly one un-lotted holding in that warehouse with at least `minOnHand` on
 * hand — so a small Return moves those rows and a single write of the captured
 * balances puts each one back. Every line of a Return must belong to the same
 * source Document, so all the products come off one order.
 */
async function pickSource(
  db: Db,
  kind: ReturnKind,
  opts: { minMoved: number; minOnHand: number; lines: number },
): Promise<SourcePick> {
  const lineRows =
    kind === "sales"
      ? await db
          .select({
            sourceOrderId: schema.salesOrders.id,
            sourceOrderNumber: schema.salesOrders.number,
            partnerId: schema.salesOrders.customerId,
            warehouseId: schema.salesOrders.warehouseId,
            productId: schema.salesOrderLines.productId,
            sku: schema.salesOrderLines.sku,
            name: schema.salesOrderLines.name,
            unitPrice: schema.salesOrderLines.unitPrice,
            moved: schema.salesOrderLines.fulfilled,
          })
          .from(schema.salesOrderLines)
          .innerJoin(
            schema.salesOrders,
            eq(schema.salesOrders.id, schema.salesOrderLines.salesOrderId),
          )
          .where(
            and(
              isNotNull(schema.salesOrders.shippedAt),
              sql`${schema.salesOrderLines.fulfilled} >= ${opts.minMoved}`,
              // A clean ceiling: no sibling Return already eating into what this
              // order shipped.
              sql`${schema.salesOrders.id} not in (select source_order_id from returns)`,
            ),
          )
      : await db
          .select({
            sourceOrderId: schema.purchaseOrders.id,
            sourceOrderNumber: schema.purchaseOrders.number,
            partnerId: schema.purchaseOrders.supplierId,
            warehouseId: schema.purchaseOrders.warehouseId,
            productId: schema.purchaseOrderLines.productId,
            sku: schema.purchaseOrderLines.sku,
            name: schema.purchaseOrderLines.name,
            unitPrice: schema.purchaseOrderLines.unitPrice,
            moved: schema.purchaseOrderLines.fulfilled,
          })
          .from(schema.purchaseOrderLines)
          .innerJoin(
            schema.purchaseOrders,
            eq(schema.purchaseOrders.id, schema.purchaseOrderLines.purchaseOrderId),
          )
          .where(
            and(
              inArray(schema.purchaseOrders.status, ["partially-received", "received", "closed"]),
              sql`${schema.purchaseOrderLines.fulfilled} >= ${opts.minMoved}`,
              sql`${schema.purchaseOrders.id} not in (select source_order_id from returns)`,
            ),
          );

  // Group the candidate lines by their order, then keep the first order that
  // yields `opts.lines` distinct roomy single-holding products.
  const byOrder = new Map<string, typeof lineRows>();
  for (const l of lineRows) {
    const list = byOrder.get(l.sourceOrderId) ?? [];
    list.push(l);
    byOrder.set(l.sourceOrderId, list);
  }

  for (const list of byOrder.values()) {
    const products: SourceProduct[] = [];
    const seenProducts = new Set<string>();
    for (const l of list) {
      if (seenProducts.has(l.productId)) continue;
      const holdings = await db
        .select({
          onHand: schema.stockRows.onHand,
          seq: schema.stockRows.seq,
          lotNumber: schema.stockRows.lotNumber,
        })
        .from(schema.stockRows)
        .where(
          and(
            eq(schema.stockRows.productId, l.productId),
            eq(schema.stockRows.warehouseId, l.warehouseId),
          ),
        );
      // Exactly one holding for this product here, un-lotted, with room — so the
      // domain's draw and the assertion both land on that single row.
      if (holdings.length !== 1 || holdings[0].lotNumber !== null || holdings[0].onHand < opts.minOnHand) {
        continue;
      }
      seenProducts.add(l.productId);
      products.push({
        productId: l.productId,
        sku: l.sku,
        name: l.name,
        unitPrice: Number(l.unitPrice),
        moved: l.moved,
        onHand: holdings[0].onHand,
        rowSeq: holdings[0].seq,
      });
      if (products.length >= opts.lines) break;
    }
    if (products.length >= opts.lines) {
      const first = list[0];
      return {
        sourceOrderId: first.sourceOrderId,
        sourceOrderNumber: first.sourceOrderNumber,
        partnerId: first.partnerId,
        warehouseId: first.warehouseId,
        products,
      };
    }
  }
  throw new Error(
    `checks: no ${kind} source order with ${opts.lines} roomy single-holding un-lotted product line(s)`,
  );
}

let seq = 0;
async function makeReturn(
  db: Db,
  opts: {
    kind: ReturnKind;
    createdBy: string;
    source: Pick<SourcePick, "sourceOrderId" | "sourceOrderNumber" | "partnerId" | "warehouseId">;
    lines: {
      productId: string;
      sku: string;
      name: string;
      quantity: number;
      condition: ItemCondition;
      unitPrice: number;
    }[];
  },
): Promise<string> {
  const id = `RET-CHK-${Date.now()}-${seq++}`;
  const now = new Date().toISOString();
  await db.insert(schema.returns).values({
    id,
    number: id,
    kind: opts.kind,
    partnerId: opts.source.partnerId,
    sourceOrderId: opts.source.sourceOrderId,
    sourceOrderNumber: opts.source.sourceOrderNumber,
    warehouseId: opts.source.warehouseId,
    status: "requested",
    reason: "checks",
    createdAt: now,
    resolvedAt: null,
    refundTotal: 0,
    restockValue: 0,
    createdBy: opts.createdBy,
    note: "checks",
  });
  await db.insert(schema.returnLines).values(
    opts.lines.map((l, n) => ({
      returnId: id,
      id: `RL-${n + 1}`,
      productId: l.productId,
      sku: l.sku,
      name: l.name,
      quantity: l.quantity,
      condition: l.condition,
      restock: l.condition === "sellable",
      unitPrice: l.unitPrice,
      refundAmount: 0,
    })),
  );
  return id;
}

async function deleteReturn(db: Db, id: string): Promise<void> {
  await db.delete(schema.returnLines).where(eq(schema.returnLines.returnId, id));
  await db.delete(schema.returns).where(eq(schema.returns.id, id));
}

async function balancesOf(db: Db, rowSeq: number): Promise<{ onHand: number; damaged: number }> {
  const [row] = await db
    .select({ onHand: schema.stockRows.onHand, damaged: schema.stockRows.damaged })
    .from(schema.stockRows)
    .where(eq(schema.stockRows.seq, rowSeq));
  return { onHand: row.onHand, damaged: row.damaged };
}

async function restoreBalances(
  db: Db,
  rowSeq: number,
  to: { onHand: number; damaged: number },
): Promise<void> {
  await db.update(schema.stockRows).set(to).where(eq(schema.stockRows.seq, rowSeq));
}

async function returnStatusOf(db: Db, id: string): Promise<string> {
  const [row] = await db
    .select({ status: schema.returns.status })
    .from(schema.returns)
    .where(eq(schema.returns.id, id));
  return row.status;
}

/** A Role without `sales-returns` edit is refused directly and writes nothing. */
async function forbiddenIsRefusedAndWritesNothing(db: Db): Promise<void> {
  const forbidden = await actorForRole(db, "auditor");
  assert.equal(
    can(forbidden.role, "sales-returns", "edit"),
    false,
    "precondition: the auditor role must not be able to edit sales returns",
  );

  const source = await pickSource(db, "sales", { minMoved: 3, minOnHand: 10, lines: 1 });
  const p = source.products[0];
  const createdBy = (await actorForRole(db, "sales-manager")).id;
  const returnId = await makeReturn(db, {
    kind: "sales",
    createdBy,
    source,
    lines: [
      {
        productId: p.productId,
        sku: p.sku,
        name: p.name,
        quantity: 2,
        condition: "sellable",
        unitPrice: p.unitPrice,
      },
    ],
  });

  try {
    const before = await eventCount(db);
    const balBefore = await balancesOf(db, p.rowSeq);

    await assert.rejects(
      () => processReturn(forbidden, { returnId }, db),
      (err: unknown) => err instanceof ReturnError && err.code === "forbidden",
      "processReturn must throw ReturnError('forbidden') for a role without sales-returns edit",
    );

    assert.equal(await eventCount(db), before, "a refused return appended an Event");
    assert.deepEqual(await balancesOf(db, p.rowSeq), balBefore, "stock balances unchanged");
    assert.ok(
      (PROCESSABLE_RETURN_STATUSES as readonly string[]).includes(await returnStatusOf(db, returnId)),
      "the return did not advance",
    );
    console.log(`  forbidden: ${forbidden.role} refused directly, event stream unchanged (${before})`);
  } finally {
    await deleteReturn(db, returnId);
  }
}

/** A line taking back more than the Sales Order shipped rejects with `over-return`. */
async function overReturnIsRefused(db: Db): Promise<void> {
  const operator = await actorForRole(db, "sales-manager");
  const source = await pickSource(db, "sales", { minMoved: 3, minOnHand: 10, lines: 1 });
  const p = source.products[0];
  const returnId = await makeReturn(db, {
    kind: "sales",
    createdBy: operator.id,
    source,
    lines: [
      {
        productId: p.productId,
        sku: p.sku,
        name: p.name,
        quantity: p.moved + 1, // one more than the order ever shipped
        condition: "sellable",
        unitPrice: p.unitPrice,
      },
    ],
  });

  try {
    const before = await eventCount(db);
    const balBefore = await balancesOf(db, p.rowSeq);

    await assert.rejects(
      () => processReturn(operator, { returnId }, db),
      (err: unknown) => err instanceof ReturnError && err.code === "over-return",
      "processReturn must reject a line that exceeds what the source order shipped",
    );

    assert.equal(await eventCount(db), before, "a refused over-return appended an Event");
    assert.deepEqual(await balancesOf(db, p.rowSeq), balBefore, "stock balances unchanged");
    console.log(
      `  over-return: ${p.sku} ${p.moved + 1} > ${p.moved} shipped on ${source.sourceOrderNumber}, refused`,
    );
  } finally {
    await deleteReturn(db, returnId);
  }
}

/**
 * A customer Return: a sellable line raises on-hand, a damaged line raises the
 * damaged balance, both as `return-in` Movements attributed to the Actor.
 */
async function customerReturnRoutesByCondition(db: Db): Promise<void> {
  const operator = await actorForRole(db, "sales-manager");
  assert.equal(
    can(operator.role, "sales-returns", "edit"),
    true,
    "precondition: operator can edit sales returns",
  );

  const source = await pickSource(db, "sales", { minMoved: 3, minOnHand: 10, lines: 2 });
  const [good, bad] = source.products;
  const returnId = await makeReturn(db, {
    kind: "sales",
    createdBy: operator.id,
    source,
    lines: [
      {
        productId: good.productId,
        sku: good.sku,
        name: good.name,
        quantity: 2,
        condition: "sellable",
        unitPrice: good.unitPrice,
      },
      {
        productId: bad.productId,
        sku: bad.sku,
        name: bad.name,
        quantity: 3,
        condition: "damaged",
        unitPrice: bad.unitPrice,
      },
    ],
  });

  const goodBefore = await balancesOf(db, good.rowSeq);
  const badBefore = await balancesOf(db, bad.rowSeq);

  try {
    const result = await processReturn(operator, { returnId }, db);

    const goodAfter = await balancesOf(db, good.rowSeq);
    const badAfter = await balancesOf(db, bad.rowSeq);

    assert.equal(
      goodAfter.onHand,
      goodBefore.onHand + 2,
      "sellable line raised on-hand by the returned quantity",
    );
    assert.equal(goodAfter.damaged, goodBefore.damaged, "sellable line left the damaged balance alone");
    assert.equal(badAfter.damaged, badBefore.damaged + 3, "damaged line raised the damaged balance");
    assert.equal(badAfter.onHand, badBefore.onHand, "damaged line left on-hand alone");
    assert.equal(result.status, "received", "the return advanced to received");

    for (const lineResult of result.lines) {
      for (const movementId of lineResult.movementIds) {
        const [m] = await db.select().from(schema.movements).where(eq(schema.movements.id, movementId));
        assert.equal(m.type, "return-in", "movement type is return-in");
        assert.equal(m.userId, operator.id, "movement is attributed to the operator");
        assert.equal(m.refType, "return", "movement references the return");
      }
    }
    console.log(
      `  customer return: ${good.sku} +2 on-hand, ${bad.sku} +3 damaged, two return-in movements by ${operator.name}`,
    );
  } finally {
    await restoreBalances(db, good.rowSeq, goodBefore);
    await restoreBalances(db, bad.rowSeq, badBefore);
    await deleteReturn(db, returnId);
  }
}

/** A supplier Return lowers on-hand as a `return-out` Movement by the Actor. */
async function supplierReturnLowersOnHand(db: Db): Promise<void> {
  const operator = await actorForRole(db, "purchasing-manager");
  assert.equal(
    can(operator.role, "purchase-returns", "edit"),
    true,
    "precondition: operator can edit purchase returns",
  );

  const source = await pickSource(db, "purchase", { minMoved: 3, minOnHand: 10, lines: 1 });
  const p = source.products[0];
  const returnId = await makeReturn(db, {
    kind: "purchase",
    createdBy: operator.id,
    source,
    lines: [
      {
        productId: p.productId,
        sku: p.sku,
        name: p.name,
        quantity: 2,
        condition: "sellable",
        unitPrice: p.unitPrice,
      },
    ],
  });

  const before = await balancesOf(db, p.rowSeq);

  try {
    const result = await processReturn(operator, { returnId }, db);
    const after = await balancesOf(db, p.rowSeq);

    assert.equal(
      after.onHand,
      before.onHand - 2,
      "supplier return lowered on-hand by the returned quantity",
    );
    assert.equal(result.status, "received", "the return advanced to received");

    const [m] = await db
      .select()
      .from(schema.movements)
      .where(eq(schema.movements.id, result.lines[0].movementIds[0]));
    assert.equal(m.type, "return-out", "movement type is return-out");
    assert.equal(m.userId, operator.id, "movement is attributed to the operator");
    assert.equal(m.qtyChange, -2, "movement records the quantity leaving stock");
    console.log(`  supplier return: ${p.sku} -2 on-hand, one return-out movement by ${operator.name}`);
  } finally {
    await restoreBalances(db, p.rowSeq, before);
    await deleteReturn(db, returnId);
  }
}

/* --------------------------------------------------------- raising (ticket 10) */

async function returnCountForSource(db: Db, sourceOrderId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.returns)
    .where(eq(schema.returns.sourceOrderId, sourceOrderId));
  return row?.n ?? 0;
}

/** The source Document's own line id for a product — what `raiseReturn` keys
 *  its input lines by. */
async function sourceLineIdFor(
  db: Db,
  kind: ReturnKind,
  sourceOrderId: string,
  productId: string,
): Promise<string> {
  const [row] =
    kind === "sales"
      ? await db
          .select({ id: schema.salesOrderLines.id })
          .from(schema.salesOrderLines)
          .where(
            and(
              eq(schema.salesOrderLines.salesOrderId, sourceOrderId),
              eq(schema.salesOrderLines.productId, productId),
            ),
          )
          .limit(1)
      : await db
          .select({ id: schema.purchaseOrderLines.id })
          .from(schema.purchaseOrderLines)
          .where(
            and(
              eq(schema.purchaseOrderLines.purchaseOrderId, sourceOrderId),
              eq(schema.purchaseOrderLines.productId, productId),
            ),
          )
          .limit(1);
  if (!row) throw new Error(`checks: no ${kind} source line for product ${productId}`);
  return row.id;
}

/**
 * A Role without `sales-returns` create is refused when it reaches `raiseReturn`
 * directly, and nothing is written — the render gate on the new-return screen
 * only ever hid the form.
 */
async function raisingForbiddenIsRefusedAndWritesNothing(db: Db): Promise<void> {
  const forbidden = await actorForRole(db, "auditor");
  assert.equal(
    can(forbidden.role, "sales-returns", "create"),
    false,
    "precondition: the auditor role must not be able to create sales returns",
  );

  const source = await pickSource(db, "sales", { minMoved: 3, minOnHand: 10, lines: 1 });
  const p = source.products[0];
  const lineId = await sourceLineIdFor(db, "sales", source.sourceOrderId, p.productId);

  const before = await eventCount(db);
  const returnsBefore = await returnCountForSource(db, source.sourceOrderId);

  await assert.rejects(
    () =>
      raiseReturn(
        forbidden,
        {
          kind: "sales",
          sourceOrderId: source.sourceOrderId,
          reason: "checks",
          note: "checks",
          lines: [{ lineId, quantity: 1, condition: "sellable", restock: true }],
        },
        db,
      ),
    (err: unknown) => err instanceof ReturnError && err.code === "forbidden",
    "raiseReturn must throw ReturnError('forbidden') for a role without sales-returns create",
  );

  assert.equal(await eventCount(db), before, "a refused raise appended an Event");
  assert.equal(
    await returnCountForSource(db, source.sourceOrderId),
    returnsBefore,
    "a refused raise wrote a Return row",
  );
  console.log(`  raise forbidden: ${forbidden.role} refused directly, event stream unchanged (${before})`);
}

/**
 * A line asking back more than the source Document moved is refused at creation
 * with `over-return` — the constraint enforced when the Return is raised, not
 * left for `processReturn` to reject later.
 */
async function raiseOverReturnIsRefused(db: Db): Promise<void> {
  const operator = await actorForRole(db, "sales-manager");
  const source = await pickSource(db, "sales", { minMoved: 3, minOnHand: 10, lines: 1 });
  const p = source.products[0];
  const lineId = await sourceLineIdFor(db, "sales", source.sourceOrderId, p.productId);

  const before = await eventCount(db);
  const returnsBefore = await returnCountForSource(db, source.sourceOrderId);

  await assert.rejects(
    () =>
      raiseReturn(
        operator,
        {
          kind: "sales",
          sourceOrderId: source.sourceOrderId,
          reason: "checks",
          note: "checks",
          lines: [{ lineId, quantity: p.moved + 1, condition: "sellable", restock: true }],
        },
        db,
      ),
    (err: unknown) => err instanceof ReturnError && err.code === "over-return",
    "raiseReturn must reject a line exceeding what the source order shipped",
  );

  assert.equal(await eventCount(db), before, "a refused over-return appended an Event");
  assert.equal(
    await returnCountForSource(db, source.sourceOrderId),
    returnsBefore,
    "a refused over-return wrote a Return row",
  );
  console.log(
    `  raise over-return: ${p.sku} ${p.moved + 1} > ${p.moved} shipped on ${source.sourceOrderNumber}, refused`,
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

    console.log("returns checks:");
    await raisingForbiddenIsRefusedAndWritesNothing(db);
    await raiseOverReturnIsRefused(db);
    await forbiddenIsRefusedAndWritesNothing(db);
    await overReturnIsRefused(db);
    await customerReturnRoutesByCondition(db);
    await supplierReturnLowersOnHand(db);
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
