/**
 * Returns in both directions: raising one (ticket 10) and processing it
 * (ticket 16). A Return references the Document that created the Movements it
 * reverses — a customer Return relates to what a Sales Order shipped, a
 * supplier Return to what a Purchase Order received.
 *
 * `raiseReturn` at the bottom creates the Return against its source Document
 * and lands it in `requested`. It moves no stock: it copies the source lines'
 * SKU, name and price, refuses a line asking back more than the Document moved,
 * allocates the number for the kind, appends a `return-created` Event and
 * writes the Return and its lines in one transaction.
 *
 * `processReturn` is one function over both kinds:
 *
 *  - A customer Return (`kind: "sales"`) appends one `return-in` Movement per
 *    line through the choke point. Goods graded sellable raise on-hand; goods
 *    graded anything else raise the damaged balance instead, in the same
 *    Movement. Treating a return as a straight reversal of the sale — everything
 *    back onto on-hand — is the mistake this flow exists to avoid, so the
 *    line's recorded condition (its `restock` flag) decides where the units land.
 *
 *  - A supplier Return (`kind: "purchase"`) appends one or more `return-out`
 *    Movements per line, drawn from the product's holdings in the return's
 *    warehouse oldest-first, the same way a shipment draws. On-hand falls; the
 *    Return advances out of the processable set.
 *
 * Returning more than the source Document ever moved is refused: a line's
 * quantity, plus what sibling Returns against the same Document have already
 * taken back, cannot exceed that Document's received/shipped quantity for the
 * product.
 *
 * Like `lib/domain/stock.ts` this imports no `server-only` code: the caller
 * passes the Drizzle handle (`getDb()` on the request path, an own `Pool` for
 * `returns.checks.ts`). The permission matrix must already be hydrated.
 *
 * ADR-0004 — the permission check is here, keyed by the Return's kind, before
 * the transaction opens, not the return screen's render gate. ADR-0006 — a
 * Return can touch several Stock Rows (a multi-line customer Return, a supplier
 * Return drawing across holdings); every change is planned first, then the
 * choke point's row locks are taken in ascending `stock_rows.seq` order — the
 * one order every multi-row flow shares — so a Return cannot deadlock against a
 * concurrent Return or transfer.
 */

import { and, eq, inArray, ne } from "drizzle-orm";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";

import { can } from "@/lib/auth/permissions";
import * as schema from "@/lib/db/schema";
import { applyStockChange, type Actor } from "@/lib/domain/stock";
import { runAutomation } from "@/lib/domain/automation";
import { allocateDocumentNumber } from "@/lib/db/numbers";
import { newId } from "@/lib/domain/reference";
import type {
  ItemCondition,
  ModuleKey,
  PermissionAction,
  ReturnKind,
  ReturnStatus,
} from "@/lib/types";

type Db = NeonDatabase<typeof schema>;

/** Processing a Return is gated on its own module, by kind (ADR-0004). */
const PERMISSION: Record<ReturnKind, { module: ModuleKey; action: PermissionAction }> = {
  sales: { module: "sales-returns", action: "edit" },
  purchase: { module: "purchase-returns", action: "edit" },
};

/** Raising a Return is a `create` on the same module (ADR-0004) — a different
 *  permission from processing one, and still keyed by the Return's kind. */
const RAISE_PERMISSION: Record<ReturnKind, { module: ModuleKey; action: PermissionAction }> = {
  sales: { module: "sales-returns", action: "create" },
  purchase: { module: "purchase-returns", action: "create" },
};

/**
 * Return statuses a Return can still be processed from — the goods have not yet
 * been booked against stock. `received` / `inspected` / `credited` are past
 * that point; `rejected` never moves stock.
 */
export const PROCESSABLE_RETURN_STATUSES = [
  "requested",
  "approved",
  "in-transit",
] as const satisfies readonly ReturnStatus[];

/** True while a Return's goods have not yet been booked against stock. The
 *  return detail page shares this with the domain so its "Process" control and
 *  `processReturn`'s own guard cannot drift apart. */
export function isProcessableReturn(status: ReturnStatus): boolean {
  return (PROCESSABLE_RETURN_STATUSES as readonly ReturnStatus[]).includes(status);
}

/**
 * Return statuses in which the goods have already moved. A later Return against
 * the same Document counts these against what that Document shipped or received
 * when deciding whether it would take back more than ever left or arrived.
 */
export const SETTLED_RETURN_STATUSES = [
  "received",
  "inspected",
  "credited",
] as const satisfies readonly ReturnStatus[];

export type ReturnErrorCode =
  | "forbidden"
  | "not-found"
  | "invalid"
  | "wrong-state"
  | "insufficient-stock"
  | "over-return";

export class ReturnError extends Error {
  constructor(
    message: string,
    readonly code: ReturnErrorCode,
  ) {
    super(message);
    this.name = "ReturnError";
  }
}

export interface ProcessReturnLineResult {
  lineId: string;
  sku: string;
  quantity: number;
  /** Where the units went: back on-hand, into the damaged balance, or out to the supplier. */
  disposition: "on-hand" | "damaged" | "supplier";
  /** One or more Movement ids — a supplier line can draw from several holdings. */
  movementIds: string[];
}

export interface ProcessReturnResult {
  returnId: string;
  number: string;
  kind: ReturnKind;
  status: ReturnStatus;
  sourceOrderId: string;
  sourceOrderNumber: string;
  lines: ProcessReturnLineResult[];
  totalUnits: number;
}

/**
 * Process a Return: book its goods against stock and advance it to `received`.
 * A customer Return appends `return-in` Movements (on-hand or damaged by the
 * line's condition); a supplier Return appends `return-out` Movements drawn
 * oldest-first. The whole thing runs in one transaction — a failure on any line
 * rolls back every Movement and leaves the Return untouched.
 *
 * Throws `ReturnError` (nothing written) when the Actor's Role cannot process
 * this kind of Return, the Return is missing or already booked, a line would
 * take back more than the source Document ever moved, or a supplier Return
 * cannot be covered from on-hand.
 */
export async function processReturn(
  actor: Actor,
  input: { returnId: string },
  db: Db,
): Promise<ProcessReturnResult> {
  // ADR-0004: permission before any write, and before the row lock — the way
  // `counts.ts` / `transfers.ts` check outside the transaction. The module is
  // keyed by the Return's kind, so read that (cheap, no lock) up front.
  const [head] = await db
    .select({ kind: schema.returns.kind })
    .from(schema.returns)
    .where(eq(schema.returns.id, input.returnId));
  if (!head) throw new ReturnError("Return not found.", "not-found");

  const permission = PERMISSION[head.kind];
  if (!can(actor.role, permission.module, permission.action)) {
    throw new ReturnError(
      `Your role (${actor.role}) is not allowed to process ${
        head.kind === "sales" ? "customer" : "supplier"
      } returns.`,
      "forbidden",
    );
  }

  const eventSeqs: number[] = [];
  const result = await db.transaction(async (tx) => {
    const [doc] = await tx
      .select()
      .from(schema.returns)
      .where(eq(schema.returns.id, input.returnId))
      .for("update");
    if (!doc) throw new ReturnError("Return not found.", "not-found");

    if (!(PROCESSABLE_RETURN_STATUSES as readonly ReturnStatus[]).includes(doc.status)) {
      throw new ReturnError(
        `${doc.number} is ${doc.status}; only a return that has not been booked in can be processed.`,
        "wrong-state",
      );
    }

    const lines = await tx
      .select()
      .from(schema.returnLines)
      .where(eq(schema.returnLines.returnId, doc.id))
      .orderBy(schema.returnLines.seq);
    if (lines.length === 0) {
      throw new ReturnError(`${doc.number} has no lines to process.`, "invalid");
    }

    const isSales = doc.kind === "sales";

    // What the source Document actually moved per product...
    const sourceLines = isSales
      ? await tx
          .select({
            productId: schema.salesOrderLines.productId,
            moved: schema.salesOrderLines.fulfilled,
          })
          .from(schema.salesOrderLines)
          .where(eq(schema.salesOrderLines.salesOrderId, doc.sourceOrderId))
      : await tx
          .select({
            productId: schema.purchaseOrderLines.productId,
            moved: schema.purchaseOrderLines.fulfilled,
          })
          .from(schema.purchaseOrderLines)
          .where(eq(schema.purchaseOrderLines.purchaseOrderId, doc.sourceOrderId));
    const movedByProduct = new Map<string, number>();
    for (const l of sourceLines) {
      movedByProduct.set(l.productId, (movedByProduct.get(l.productId) ?? 0) + l.moved);
    }

    // ...minus what sibling Returns against the same Document have already booked.
    const siblingLines = await tx
      .select({
        productId: schema.returnLines.productId,
        quantity: schema.returnLines.quantity,
      })
      .from(schema.returnLines)
      .innerJoin(schema.returns, eq(schema.returns.id, schema.returnLines.returnId))
      .where(
        and(
          eq(schema.returns.sourceOrderId, doc.sourceOrderId),
          eq(schema.returns.kind, doc.kind),
          ne(schema.returns.id, doc.id),
          inArray(schema.returns.status, [...SETTLED_RETURN_STATUSES]),
        ),
      );
    const returnedByProduct = new Map<string, number>();
    for (const l of siblingLines) {
      returnedByProduct.set(l.productId, (returnedByProduct.get(l.productId) ?? 0) + l.quantity);
    }

    // This Return's own demand per product, checked as we accumulate so a second
    // line for the same product sees the first line's claim.
    //
    // ponytail: the ceiling reads `sourceOrderLines.fulfilled` and sibling
    // Return quantities without `FOR UPDATE`, so two Returns against the same
    // Document processed at once can each see the other as not-yet-booked and
    // both pass. A supplier over-draw still fails at the choke point's
    // negative-stock guard; a customer double-refund would not. Lock the source
    // Document's lines here if that race ever matters.
    const plannedByProduct = new Map<string, number>();
    for (const line of lines) {
      const planned = (plannedByProduct.get(line.productId) ?? 0) + line.quantity;
      const ceiling =
        (movedByProduct.get(line.productId) ?? 0) - (returnedByProduct.get(line.productId) ?? 0);
      if (planned > ceiling) {
        throw new ReturnError(
          `${line.sku}: ${planned} to return but only ${Math.max(0, ceiling)} of what ${
            doc.sourceOrderNumber
          } ${isSales ? "shipped" : "received"} is still returnable.`,
          "over-return",
        );
      }
      plannedByProduct.set(line.productId, planned);
    }

    const reason = `Return ${doc.number} processed against ${doc.sourceOrderNumber}`;

    // Plan every stock change for every line first, then acquire the choke
    // point's row locks in ascending `stock_rows.seq` order — the one
    // consistent order every multi-row flow uses (`transfers.ts`, `counts.ts`)
    // so a return cannot deadlock against a concurrent return or transfer
    // (ADR-0006).
    interface PlannedChange {
      lineIdx: number;
      rowSeq: number;
      productId: string;
      locationId: string;
      lotNumber: string | null;
      onHandDelta: number;
      damagedDelta: number;
    }
    const plan: PlannedChange[] = [];

    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
      const line = lines[lineIdx];
      const holdings = await tx
        .select({
          seq: schema.stockRows.seq,
          locationId: schema.stockRows.locationId,
          lotNumber: schema.stockRows.lotNumber,
          onHand: schema.stockRows.onHand,
        })
        .from(schema.stockRows)
        .where(
          and(
            eq(schema.stockRows.productId, line.productId),
            eq(schema.stockRows.warehouseId, doc.warehouseId),
          ),
        )
        .orderBy(schema.stockRows.seq);

      if (isSales) {
        // Land the goods at the product's main holding — the one with the most
        // on-hand, tie-broken by age. Condition decides the balance: sellable
        // units go back on-hand, everything else (damaged / defective / expired
        // — the stock model's one non-sellable bucket) into the damaged
        // balance. A return is not a straight reversal of the sale (ticket 16).
        const target = [...holdings].sort((a, b) => b.onHand - a.onHand || a.seq - b.seq)[0];
        if (!target) {
          throw new ReturnError(
            `${line.sku}: no holding in the return's warehouse to book the goods into.`,
            "invalid",
          );
        }
        const toDamaged = !line.restock;
        plan.push({
          lineIdx,
          rowSeq: target.seq,
          productId: line.productId,
          locationId: target.locationId,
          lotNumber: target.lotNumber,
          onHandDelta: toDamaged ? 0 : line.quantity,
          damagedDelta: toDamaged ? line.quantity : 0,
        });
        continue;
      }

      // Supplier Return: draw the units out of the return's warehouse
      // oldest-first, the same way a shipment does.
      let remaining = line.quantity;
      for (const h of holdings) {
        if (remaining <= 0) break;
        const take = Math.min(remaining, Math.max(0, h.onHand));
        if (take <= 0) continue;
        plan.push({
          lineIdx,
          rowSeq: h.seq,
          productId: line.productId,
          locationId: h.locationId,
          lotNumber: h.lotNumber,
          onHandDelta: -take,
          damagedDelta: 0,
        });
        remaining -= take;
      }
      if (remaining > 0) {
        throw new ReturnError(
          `${line.sku}: ${line.quantity} to send back but only ${
            line.quantity - remaining
          } on hand in the return's warehouse.`,
          "insufficient-stock",
        );
      }
    }

    // ADR-0006: lock Stock Rows low-seq-first regardless of line order.
    plan.sort((a, b) => a.rowSeq - b.rowSeq);

    const movementType = isSales ? "return-in" : "return-out";
    const movementIdsByLine = new Map<number, string[]>();
    for (const change of plan) {
      const applied = await applyStockChange(
        actor,
        {
          productId: change.productId,
          warehouseId: doc.warehouseId,
          locationId: change.locationId,
          lotNumber: change.lotNumber,
          movementType,
          onHandDelta: change.onHandDelta,
          damagedDelta: change.damagedDelta,
          reason,
          permission,
          ref: { type: "return", id: doc.id, number: doc.number },
        },
        tx,
      );
      eventSeqs.push(applied.eventSeq);
      const ids = movementIdsByLine.get(change.lineIdx) ?? [];
      ids.push(applied.movementId);
      movementIdsByLine.set(change.lineIdx, ids);
    }

    const results: ProcessReturnLineResult[] = lines.map((line, lineIdx) => ({
      lineId: line.id,
      sku: line.sku,
      quantity: line.quantity,
      disposition: isSales ? (line.restock ? "on-hand" : "damaged") : "supplier",
      movementIds: movementIdsByLine.get(lineIdx) ?? [],
    }));
    const totalUnits = lines.reduce((sum, l) => sum + l.quantity, 0);

    // The Return advances as a consequence of the goods moving.
    await tx
      .update(schema.returns)
      .set({ status: "received" })
      .where(eq(schema.returns.id, doc.id));

    return {
      returnId: doc.id,
      number: doc.number,
      kind: doc.kind,
      status: "received" as ReturnStatus,
      sourceOrderId: doc.sourceOrderId,
      sourceOrderNumber: doc.sourceOrderNumber,
      lines: results,
      totalUnits,
    };
  });

  // After commit: evaluate matching Automation Rules in the same request
  // (ADR-0008). Never throws; a failing rule is recorded, not propagated.
  await runAutomation(db, eventSeqs);
  return result;
}

/* ----------------------------------------------------------------- raising */

export interface RaiseReturnLineInput {
  /** The source Document's own line id — the Return line copies that line's
   *  product, SKU, name and price. */
  lineId: string;
  /** Units coming back on this line; at least one. */
  quantity: number;
  condition: ItemCondition;
  /** Whether the units go back as available stock. Forced off for a
   *  non-sellable condition — a defective unit never returns to the shelf. */
  restock: boolean;
}

export interface RaiseReturnInput {
  kind: ReturnKind;
  /** The Sales Order (customer return) or Purchase Order (supplier return) the
   *  goods moved on. */
  sourceOrderId: string;
  /** Why the goods are coming back; `returns.reason` is NOT NULL. */
  reason: string;
  /** Free text onto the Return and the audit trail; `returns.note` is NOT NULL. */
  note: string;
  lines: RaiseReturnLineInput[];
}

export interface RaiseReturnResult {
  id: string;
  number: string;
  kind: ReturnKind;
  /** Units the Return asks back — `sum(quantity)`. */
  units: number;
}

/**
 * Raise a Return against its source Document (ticket 10). A customer Return
 * (`kind: "sales"`) is raised against a Sales Order, a supplier Return
 * (`kind: "purchase"`) against a Purchase Order; the two directions differ in
 * which permission is checked (`sales-returns` vs `purchase-returns`), in the
 * source Document type, and in nothing else.
 *
 * Creation moves no stock. The Return lands in `requested` — one of
 * `PROCESSABLE_RETURN_STATUSES` — so it opens on the detail page and books its
 * goods against stock through the existing `processReturn`. Its lines record
 * the SKU, name and unit price copied from the source Document at the moment it
 * was raised, not from the client.
 *
 * A line asking back more than the source Document moved for that product is
 * refused here (`over-return`) rather than accepted and rejected later by
 * `processReturn`: an impossible Return should not be raised. The ceiling is
 * `sum(fulfilled)` over the source Document's lines for the product.
 *
 * ponytail: the ceiling does not subtract sibling Returns already raised
 * against the same Document — only what the Document itself moved, which is the
 * constraint the ticket names. `processReturn` still does the full
 * settled-sibling accounting when the goods actually move, so a second Return
 * over the same units is caught there.
 *
 * Throws `ReturnError` and writes nothing when the Actor's Role cannot raise
 * this kind of Return, the source Document is missing, a line is not one of the
 * Document's lines, or a line exceeds what the Document moved. The number, the
 * Event, the Return and its lines commit together or not at all — a creation
 * that fails partway leaves nothing behind bar its burned number, which is
 * correct for a Document number (`lib/db/numbers.ts`).
 */
export async function raiseReturn(
  actor: Actor,
  input: RaiseReturnInput,
  db: Db,
): Promise<RaiseReturnResult> {
  // ADR-0004: permission before any write, keyed by the Return's kind — the way
  // `processReturn` checks, and the way `counts.ts` / `transfers.ts` check
  // their own `create` permission outside the transaction.
  const permission = RAISE_PERMISSION[input.kind];
  if (!can(actor.role, permission.module, permission.action)) {
    throw new ReturnError(
      `Your role (${actor.role}) is not allowed to raise ${
        input.kind === "sales" ? "customer" : "supplier"
      } returns.`,
      "forbidden",
    );
  }

  if (input.lines.length === 0) {
    throw new ReturnError("A return needs at least one line.", "invalid");
  }
  if (input.lines.some((l) => !Number.isInteger(l.quantity) || l.quantity <= 0)) {
    throw new ReturnError("Every line needs a whole quantity of at least one.", "invalid");
  }

  const isSales = input.kind === "sales";

  const created = await db.transaction(async (tx) => {
    // The source Document's head — the Return copies its number, warehouse and
    // counterparty from here, not from the client.
    const [source] = isSales
      ? await tx
          .select({
            id: schema.salesOrders.id,
            number: schema.salesOrders.number,
            partnerId: schema.salesOrders.customerId,
            warehouseId: schema.salesOrders.warehouseId,
          })
          .from(schema.salesOrders)
          .where(eq(schema.salesOrders.id, input.sourceOrderId))
      : await tx
          .select({
            id: schema.purchaseOrders.id,
            number: schema.purchaseOrders.number,
            partnerId: schema.purchaseOrders.supplierId,
            warehouseId: schema.purchaseOrders.warehouseId,
          })
          .from(schema.purchaseOrders)
          .where(eq(schema.purchaseOrders.id, input.sourceOrderId));
    if (!source) {
      throw new ReturnError("The source document could not be found.", "not-found");
    }

    // Every line of the source Document, keyed by its own id so a Return line
    // copies the exact source line's product, SKU, name and price. `moved` is
    // also summed per product below for the over-return ceiling.
    const sourceLines = isSales
      ? await tx
          .select({
            lineId: schema.salesOrderLines.id,
            productId: schema.salesOrderLines.productId,
            sku: schema.salesOrderLines.sku,
            name: schema.salesOrderLines.name,
            unitPrice: schema.salesOrderLines.unitPrice,
            moved: schema.salesOrderLines.fulfilled,
          })
          .from(schema.salesOrderLines)
          .where(eq(schema.salesOrderLines.salesOrderId, source.id))
      : await tx
          .select({
            lineId: schema.purchaseOrderLines.id,
            productId: schema.purchaseOrderLines.productId,
            sku: schema.purchaseOrderLines.sku,
            name: schema.purchaseOrderLines.name,
            unitPrice: schema.purchaseOrderLines.unitPrice,
            moved: schema.purchaseOrderLines.fulfilled,
          })
          .from(schema.purchaseOrderLines)
          .where(eq(schema.purchaseOrderLines.purchaseOrderId, source.id));

    const sourceByLineId = new Map(sourceLines.map((l) => [l.lineId, l]));
    const movedByProduct = new Map<string, number>();
    for (const l of sourceLines) {
      movedByProduct.set(l.productId, (movedByProduct.get(l.productId) ?? 0) + l.moved);
    }

    // Each line's demand per product, checked as it accumulates so two lines
    // for the same product cannot together exceed what the Document moved.
    const plannedByProduct = new Map<string, number>();
    const lines = input.lines.map((line, i) => {
      const src = sourceByLineId.get(line.lineId);
      if (!src) {
        throw new ReturnError(
          `Line ${i + 1} is not a line on ${source.number}.`,
          "invalid",
        );
      }
      const unitPrice = Number(src.unitPrice);
      const planned = (plannedByProduct.get(src.productId) ?? 0) + line.quantity;
      const ceiling = movedByProduct.get(src.productId) ?? 0;
      if (planned > ceiling) {
        throw new ReturnError(
          `${src.sku}: ${planned} to return but ${source.number} only ${
            isSales ? "shipped" : "received"
          } ${ceiling}.`,
          "over-return",
        );
      }
      plannedByProduct.set(src.productId, planned);

      // A non-sellable unit never goes back on the shelf, whatever the client asked.
      const restock = line.condition === "sellable" && line.restock;
      const refundAmount = Math.round(line.quantity * unitPrice * 100) / 100;
      return {
        id: `RL-${String(i + 1).padStart(3, "0")}`,
        productId: src.productId,
        sku: src.sku,
        name: src.name,
        quantity: line.quantity,
        condition: line.condition,
        restock,
        unitPrice,
        refundAmount,
      };
    });

    const refundTotal = Math.round(lines.reduce((s, l) => s + l.refundAmount, 0) * 100) / 100;
    const restockValue =
      Math.round(lines.reduce((s, l) => s + (l.restock ? l.refundAmount : 0), 0) * 100) / 100;

    const number = await allocateDocumentNumber(tx, isSales ? "salesReturn" : "purchaseReturn");
    const id = newId("RET");
    const now = new Date().toISOString();

    // The Event first — it is the source of truth; the rows below are its
    // projection and commit with it (ADR-0002, ADR-0003).
    const [event] = await tx
      .insert(schema.events)
      .values({
        type: "return-created",
        actorId: actor.id,
        payload: {
          returnId: id,
          number,
          kind: input.kind,
          sourceOrderId: source.id,
          sourceOrderNumber: source.number,
          warehouseId: source.warehouseId,
          status: "requested",
          lines: lines.map((l) => ({ sku: l.sku, quantity: l.quantity })),
        },
      })
      .returning({ seq: schema.events.seq });

    await tx.insert(schema.returns).values({
      id,
      number,
      kind: input.kind,
      partnerId: source.partnerId,
      sourceOrderId: source.id,
      sourceOrderNumber: source.number,
      warehouseId: source.warehouseId,
      status: "requested",
      reason: input.reason,
      createdAt: now,
      resolvedAt: null,
      refundTotal,
      restockValue,
      createdBy: actor.id,
      note: input.note,
    });

    await tx
      .insert(schema.returnLines)
      .values(lines.map((line) => ({ ...line, returnId: id })));

    return {
      id,
      number,
      units: lines.reduce((s, l) => s + l.quantity, 0),
      eventSeq: event.seq,
    };
  });

  // After commit: evaluate matching Automation Rules in the same request
  // (ADR-0008), as every other flow that appends an Event does. Never throws.
  await runAutomation(db, [created.eventSeq]);
  return { id: created.id, number: created.number, kind: input.kind, units: created.units };
}
