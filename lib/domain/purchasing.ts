/**
 * Raising a Purchase Order (ticket 06) — the first of the five creation flows.
 *
 * The shape every later creation copies: check the Actor's permission first,
 * then in one transaction allocate the Document number, append the Event, write
 * the document and its lines, and return the new id for the caller to redirect
 * to. Number, Event, order and lines commit together or not at all, so a
 * creation that fails partway leaves nothing behind — except its burned number,
 * which is correct for a Document number (`lib/db/numbers.ts`).
 *
 * Creation moves no stock and so does not go through the choke point: no
 * Movement, no `stock_rows` write. The incoming balance still changes, but as a
 * consequence of the document existing — `documents.incomingByProduct` sums
 * `quantity - fulfilled` over the lines of open Purchase Orders (ADR-0002,
 * CONTEXT.md "Incoming"). A `draft` is not open, so incoming moves when ticket
 * 11 submits the order, not here.
 *
 * The order lands in `draft`. `submitted`, `approved` and `ordered` are ticket
 * 11's transitions.
 *
 * Money is recomputed here from the lines rather than trusted from the client:
 * the browser's totals are for display, and a server action is a trust
 * boundary. It is recomputed with the same `lib/totals.ts` the form and the
 * line editor use, so what the user was shown and what is stored cannot drift.
 *
 * Like `lib/domain/stock.ts` this imports no `server-only` code: the caller
 * passes the Drizzle handle (`getDb()` on the request path, an own `Pool` for
 * `purchasing.checks.ts`). The permission matrix must already be hydrated.
 */

import { eq, inArray } from "drizzle-orm";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";

import { can } from "@/lib/auth/permissions";
import * as schema from "@/lib/db/schema";
import { allocateDocumentNumber } from "@/lib/db/numbers";
import { runAutomation } from "@/lib/domain/automation";
import { newId } from "@/lib/domain/reference";
import type { Actor } from "@/lib/domain/stock";
import { documentTotals, lineMoney, roundMoney } from "@/lib/totals";
import type { ApprovalEvent } from "@/lib/types";

type Db = NeonDatabase<typeof schema>;

/** Raising an order is a `create` on the purchase-orders module (ADR-0004). */
const CREATE_PERMISSION = { module: "purchase-orders", action: "create" } as const;

export type PurchaseOrderErrorCode = "forbidden" | "not-found" | "invalid";

export class PurchaseOrderError extends Error {
  constructor(
    message: string,
    readonly code: PurchaseOrderErrorCode,
  ) {
    super(message);
    this.name = "PurchaseOrderError";
  }
}

export interface CreatePurchaseOrderLineInput {
  productId: string;
  quantity: number;
  unitPrice: number;
  discountPct: number;
  taxPct: number;
}

export interface CreatePurchaseOrderInput {
  supplierId: string;
  warehouseId: string;
  shipping: number;
  notes: string;
  lines: CreatePurchaseOrderLineInput[];
}

export interface CreatePurchaseOrderResult {
  id: string;
  number: string;
  total: number;
}

/**
 * Raise a Purchase Order for the Actor. Returns the new order's id and number.
 * Throws `PurchaseOrderError` — and writes nothing at all — when the Actor's
 * Role forbids creating purchase orders, the order has no lines, or a supplier
 * or product on it does not exist.
 *
 * The warehouse is not looked up: `purchase_orders.warehouse_id` carries a
 * foreign key, so an unknown one is the database's rejection to make, and it
 * rolls the whole transaction back like any other failure.
 */
export async function createPurchaseOrder(
  actor: Actor,
  input: CreatePurchaseOrderInput,
  db: Db,
): Promise<CreatePurchaseOrderResult> {
  if (!can(actor.role, CREATE_PERMISSION.module, CREATE_PERMISSION.action)) {
    throw new PurchaseOrderError(
      `Your role (${actor.role}) is not allowed to raise purchase orders.`,
      "forbidden",
    );
  }
  if (input.lines.length === 0) {
    throw new PurchaseOrderError("A purchase order needs at least one line.", "invalid");
  }
  if (input.lines.some((l) => l.quantity <= 0)) {
    throw new PurchaseOrderError("Every line needs a quantity of at least one.", "invalid");
  }

  const created = await db.transaction(async (tx) => {
    const [supplier] = await tx
      .select({
        currency: schema.suppliers.currency,
        paymentTerms: schema.suppliers.paymentTerms,
        leadTimeDays: schema.suppliers.leadTimeDays,
      })
      .from(schema.suppliers)
      .where(eq(schema.suppliers.id, input.supplierId));
    if (!supplier) throw new PurchaseOrderError("Unknown supplier.", "not-found");

    // The line's SKU and name are copied from the catalogue, not from the
    // client: a Document records what was ordered at the time it was raised.
    const productRows = await tx
      .select({ id: schema.products.id, sku: schema.products.sku, name: schema.products.name })
      .from(schema.products)
      .where(inArray(schema.products.id, input.lines.map((l) => l.productId)));
    const products = new Map(productRows.map((p) => [p.id, p]));

    const lines = input.lines.map((line, i) => {
      const product = products.get(line.productId);
      if (!product) throw new PurchaseOrderError(`Unknown product on line ${i + 1}.`, "not-found");

      return {
        id: `LN-${String(i + 1).padStart(3, "0")}`,
        productId: product.id,
        sku: product.sku,
        name: product.name,
        quantity: line.quantity,
        fulfilled: 0,
        unitPrice: line.unitPrice,
        discountPct: line.discountPct,
        taxPct: line.taxPct,
        lineTotal: lineMoney(line).lineTotal,
      };
    });

    const shipping = roundMoney(Math.max(0, input.shipping));
    const totals = documentTotals(input.lines, shipping);

    const number = await allocateDocumentNumber(tx, "purchaseOrder");
    const id = newId("PO");
    const createdAt = new Date();
    const createdAtIso = createdAt.toISOString();

    // The Event first — it is the source of truth; the rows below are its
    // projection and commit with it (ADR-0002, ADR-0003).
    const [event] = await tx.insert(schema.events).values({
      type: "purchase-order-created",
      actorId: actor.id,
      payload: {
        purchaseOrderId: id,
        number,
        supplierId: input.supplierId,
        warehouseId: input.warehouseId,
        status: "draft",
        total: totals.total,
        lines: lines.map((l) => ({ sku: l.sku, quantity: l.quantity, unitPrice: l.unitPrice })),
      },
    }).returning({ seq: schema.events.seq });

    // `approvals` is NOT NULL and every seeded order opens with a `created`
    // entry, so a raised one does too; ticket 11 appends to this trail.
    const approvals: ApprovalEvent[] = [
      { id: "APV-01", ts: createdAtIso, userId: actor.id, action: "created" },
    ];

    await tx.insert(schema.purchaseOrders).values({
      id,
      number,
      supplierId: input.supplierId,
      warehouseId: input.warehouseId,
      status: "draft",
      createdAt: createdAtIso,
      orderedAt: null,
      // `expected_at` is NOT NULL and the supplier's lead time is the only
      // expectation an unplaced order has. It is measured from today, so ticket
      // 11 should re-derive it when the order is actually placed — a draft that
      // sat for a fortnight would otherwise carry a delivery date already past.
      expectedAt: new Date(
        createdAt.getTime() + supplier.leadTimeDays * 24 * 60 * 60 * 1000,
      ).toISOString(),
      receivedAt: null,
      subtotal: totals.subtotal,
      taxTotal: totals.taxTotal,
      discountTotal: totals.discountTotal,
      shipping,
      total: totals.total,
      currency: supplier.currency,
      createdBy: actor.id,
      approvedBy: null,
      approvals,
      notes: input.notes,
      attachments: [],
      paymentTerms: supplier.paymentTerms,
    });

    await tx
      .insert(schema.purchaseOrderLines)
      .values(lines.map((line) => ({ ...line, purchaseOrderId: id })));

    return { id, number, total: totals.total, eventSeq: event.seq };
  });

  // After commit: evaluate matching Automation Rules in the same request
  // (ADR-0008), as every other flow that appends an Event does. No modelled
  // rule triggers on a Document event yet; this is here so that when one does,
  // creation is not the flow that quietly skipped it. Never throws.
  await runAutomation(db, [created.eventSeq]);
  return created;
}
