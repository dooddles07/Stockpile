/**
 * Stock Counts: scheduling one (ticket 09) and completing it (ticket 15) — the
 * flow where the system admits it was wrong and reconciles itself to reality.
 *
 * `scheduleStockCount` at the bottom raises the count: it resolves a scope to
 * the holdings in it and fixes them as the sheet's lines, each carrying the
 * on-hand it had at that moment as its `expected`. It moves no stock.
 *
 * A warehouse operator works through a count sheet entering what is physically
 * on the shelf, then completes the count as one operation. `completeStockCount`:
 *
 *  - appends one `count-correction` Movement through the choke point for every
 *    line whose counted quantity differs from the recorded one, carrying the
 *    counted and recorded quantities so the ledger explains the jump rather than
 *    showing an unexplained one;
 *  - appends nothing for a line that matched — recording zero-quantity
 *    corrections would pollute the ledger with non-events, so a count with no
 *    variances writes no Movements at all;
 *  - applies every correction together or not at all: the whole thing runs in
 *    one transaction, so a count that fails partway through leaves no
 *    corrections and the shelf and the system do not disagree in a new way;
 *  - sets the last-counted timestamp on every Stock Row the count covered, which
 *    is what tells an inventory manager where to count next.
 *
 * Like `lib/domain/stock.ts` this imports no `server-only` code: the caller
 * passes the Drizzle handle (`getDb()` on the request path, an own `Pool` for
 * `counts.checks.ts`). The permission matrix must already be hydrated.
 *
 * ADR-0004 — the permission check is here, not the Count sheet's render gate.
 * ADR-0006 — a count touches one Stock Row per line, so it locks several; the
 * per-row locks are acquired in ascending `stock_rows.seq` order, the one
 * consistent order every multi-row flow uses, so a completion cannot deadlock
 * against another concurrent completion.
 */

import { and, eq, gt, isNull } from "drizzle-orm";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";

import { can } from "@/lib/auth/permissions";
import * as schema from "@/lib/db/schema";
import {
  applyStockChange,
  ensureStockHolding,
  markCounted,
  type Actor,
} from "@/lib/domain/stock";
import { runAutomation } from "@/lib/domain/automation";
import { allocateDocumentNumber } from "@/lib/db/numbers";
import { newId } from "@/lib/domain/reference";
import type { CountStatus, CountType } from "@/lib/types";

type Db = NeonDatabase<typeof schema>;

/** Completing a count is gated on `counts` / `edit` — the operator working the
 *  sheet (ADR-0004, in the domain; the sheet tab's render gate protects
 *  nothing). */
const COUNT_PERMISSION = { module: "counts", action: "edit" } as const;

/** Statuses a count can still be completed from. `review` is left out on
 *  purpose — a count already submitted for review has its own approval path. */
const COMPLETABLE_STATUSES = [
  "scheduled",
  "in-progress",
] as const satisfies readonly CountStatus[];

export type CountErrorCode = "forbidden" | "not-found" | "invalid" | "wrong-state";

export class CountError extends Error {
  constructor(
    message: string,
    readonly code: CountErrorCode,
  ) {
    super(message);
    this.name = "CountError";
  }
}

export interface CompleteCountLineInput {
  /** `CountLine.id` (`CL-001`) — unique within its count. */
  lineId: string;
  /** Units physically on the shelf for this line. */
  counted: number;
}

export interface CompleteStockCountInput {
  stockCountId: string;
  /**
   * Counted quantities entered on the sheet. A line omitted here keeps whatever
   * `count_lines.counted` already holds; a line that still has no counted
   * quantity is not part of the count and is left untouched.
   */
  lines: CompleteCountLineInput[];
}

export interface CompleteStockCountResult {
  stockCountId: string;
  number: string;
  status: CountStatus;
  /** How many lines produced a correction Movement. */
  corrections: number;
}

/**
 * Complete a Stock Count: `scheduled | in-progress | review -> applied`. Every
 * counted line whose quantity differs from the recorded one produces a
 * `count-correction` Movement through the choke point; matching lines produce
 * nothing. The whole set commits together or not at all.
 *
 * Throws `CountError` (nothing written) when the Actor is not permitted, the
 * count is missing or already closed, or a line references a line id not on the
 * count; a choke-point rejection (e.g. a correction that would drive on-hand
 * below zero) rolls the whole completion back too.
 *
 * ponytail: the correction delta is `counted - line.expected`, the variance the
 * operator saw on the sheet, not `counted - liveOnHand`. Normally the two are
 * equal; if stock moved at that holding between the sheet being generated and
 * the count completing, the ledger stays internally consistent (the projection
 * moves by the same delta) but the final on-hand is the counted quantity offset
 * by that concurrent movement. Re-read the holding inside the transaction if a
 * count is ever completed long after the sheet is cut.
 */
export async function completeStockCount(
  actor: Actor,
  input: CompleteStockCountInput,
  db: Db,
): Promise<CompleteStockCountResult> {
  if (!can(actor.role, COUNT_PERMISSION.module, COUNT_PERMISSION.action)) {
    throw new CountError(
      `Your role (${actor.role}) is not allowed to complete stock counts.`,
      "forbidden",
    );
  }

  const entered = new Map<string, number>();
  for (const l of input.lines) {
    if (!Number.isInteger(l.counted) || l.counted < 0) {
      throw new CountError(
        "Counted quantities must be whole numbers of zero or more.",
        "invalid",
      );
    }
    entered.set(l.lineId, l.counted);
  }

  const eventSeqs: number[] = [];
  const result = await db.transaction(async (tx) => {
    const [count] = await tx
      .select()
      .from(schema.stockCounts)
      .where(eq(schema.stockCounts.id, input.stockCountId))
      .for("update");
    if (!count) throw new CountError("Stock count not found.", "not-found");
    if (!(COMPLETABLE_STATUSES as readonly CountStatus[]).includes(count.status)) {
      throw new CountError(
        `${count.number} is ${count.status}; only a count still in progress can be completed.`,
        "wrong-state",
      );
    }

    const lineRows = await tx
      .select()
      .from(schema.countLines)
      .where(eq(schema.countLines.stockCountId, count.id))
      .for("update")
      .orderBy(schema.countLines.seq);
    if (lineRows.length === 0) {
      throw new CountError(`${count.number} has no lines to count.`, "invalid");
    }
    const lineIds = new Set(lineRows.map((r) => r.id));
    for (const id of entered.keys()) {
      if (!lineIds.has(id)) {
        throw new CountError(`Line ${id} is not on ${count.number}.`, "invalid");
      }
    }

    // A line's final counted quantity: the value just entered, or whatever the
    // sheet already held. Lines still uncounted are not part of this count.
    const covered = lineRows
      .map((line) => ({
        line,
        counted: entered.has(line.id) ? entered.get(line.id)! : line.counted,
      }))
      .filter(
        (c): c is { line: (typeof lineRows)[number]; counted: number } =>
          c.counted !== null,
      );
    if (covered.length === 0) {
      throw new CountError(`${count.number} has no counted lines.`, "invalid");
    }

    // Every covered holding needs a Stock Row for the choke point to lock.
    for (const { line } of covered) {
      await ensureStockHolding(tx, {
        productId: line.productId,
        warehouseId: count.warehouseId,
        locationId: line.locationId,
        lotNumber: null,
      });
    }

    // ADR-0006: acquire the per-Stock-Row locks in ascending `stock_rows.seq`
    // order — the same key every multi-row flow uses — so two concurrent
    // completions cannot deadlock.
    const seqByHolding = new Map(
      (
        await tx
          .select({
            productId: schema.stockRows.productId,
            locationId: schema.stockRows.locationId,
            seq: schema.stockRows.seq,
          })
          .from(schema.stockRows)
          .where(
            and(
              eq(schema.stockRows.warehouseId, count.warehouseId),
              isNull(schema.stockRows.lotNumber),
            ),
          )
      ).map((r) => [`${r.productId}@${r.locationId}`, r.seq] as const),
    );
    const ordered = [...covered].sort(
      (a, b) =>
        (seqByHolding.get(`${a.line.productId}@${a.line.locationId}`) ?? 0) -
        (seqByHolding.get(`${b.line.productId}@${b.line.locationId}`) ?? 0),
    );

    const now = new Date().toISOString();
    let corrections = 0;
    let totalVarianceValue = 0;

    for (const { line, counted } of ordered) {
      const variance = counted - line.expected;

      if (variance !== 0) {
        corrections += 1;
        const change = await applyStockChange(
          actor,
          {
            productId: line.productId,
            warehouseId: count.warehouseId,
            locationId: line.locationId,
            lotNumber: null,
            movementType: "count-correction",
            onHandDelta: variance,
            reason: `${count.number}: counted ${counted}, recorded ${line.expected} (variance ${
              variance > 0 ? "+" : ""
            }${variance})`,
            permission: COUNT_PERMISSION,
            ref: { type: "stock-count", id: count.id, number: count.number },
          },
          tx,
        );
        eventSeqs.push(change.eventSeq);
      }

      const [product] = await tx
        .select({ unitCost: schema.products.unitCost })
        .from(schema.products)
        .where(eq(schema.products.id, line.productId));
      const varianceValue =
        Math.round(variance * (product?.unitCost ?? 0) * 100) / 100;
      totalVarianceValue += varianceValue;

      await tx
        .update(schema.countLines)
        .set({
          counted,
          variance,
          varianceValue,
          countedBy: line.countedBy ?? actor.id,
          countedAt: line.countedAt ?? now,
        })
        .where(eq(schema.countLines.seq, line.seq));
    }

    // The last-counted timestamp is what tells an inventory manager where to
    // count next — set it on every Stock Row this count covered, in the same
    // ascending `stock_rows.seq` order the corrections locked in (ADR-0006), so
    // the trailing `UPDATE` locks cannot deadlock against another completion.
    await markCounted(
      tx,
      ordered.map(({ line }) => ({
        productId: line.productId,
        warehouseId: count.warehouseId,
        locationId: line.locationId,
        lotNumber: null,
      })),
      now,
    );

    await tx
      .update(schema.stockCounts)
      .set({
        status: "applied",
        startedAt: count.startedAt ?? now,
        completedAt: now,
        accuracyPct:
          Math.round(((covered.length - corrections) / covered.length) * 1000) / 10,
        totalVarianceValue: Math.round(totalVarianceValue * 100) / 100,
      })
      .where(eq(schema.stockCounts.id, count.id));

    return {
      stockCountId: count.id,
      number: count.number,
      status: "applied" as CountStatus,
      corrections,
    };
  });

  // After commit: evaluate matching Automation Rules in the same request
  // (ADR-0008). Never throws; a failing rule is recorded, not propagated.
  await runAutomation(db, eventSeqs);
  return result;
}

/* --------------------------------------------------------------- scheduling */

/** Scheduling a count is a `create` on the same module (ADR-0004) — a different
 *  permission from working the sheet. */
const SCHEDULE_PERMISSION = { module: "counts", action: "create" } as const;

export interface ScheduleStockCountInput {
  warehouseId: string;
  type: CountType;
  /** A `location` count: only holdings in this zone of the site. */
  zone?: string | null;
  /** A `category` count: only products in this category. */
  categoryId?: string | null;
  /** A `cycle` or `spot` count: at most this many holdings, lowest `stock_rows.seq` first. */
  limit?: number | null;
  /** Days from today the count is due; `scheduled_for` is NOT NULL. */
  scheduledInDays: number;
  assignedTo: string[];
  /** How the scope reads on the count ("All zones", "Zone A", a category name). */
  scopeLabel: string;
}

export interface ScheduleStockCountResult {
  id: string;
  number: string;
  /** How many holdings the scope resolved to — the size of the sheet. */
  lines: number;
}

/**
 * Schedule a Stock Count over a scope (ticket 09). Returns the new count's id
 * and number. Throws `CountError` — and writes nothing — when the Actor's Role
 * forbids scheduling counts or the scope resolves to no holdings.
 *
 * The lines are the product-location holdings in scope *at the moment the count
 * is scheduled*, each carrying the on-hand it had then as its `expected`.
 * Fixing them here rather than resolving the scope lazily when someone starts
 * counting is what makes a variance mean something: `expected` is what the
 * system believed when the count was raised, and `completeStockCount` posts the
 * difference from what the counter found as a `count-correction`. A sheet cut
 * at counting time would instead compare the shelf against itself.
 *
 * Only un-lotted holdings with something in them are taken: a count line has no
 * lot column, so a lotted holding has nowhere to record which lot was counted,
 * and an empty holding is a line with nothing to count. A scope that resolves
 * to none of them is refused rather than creating an empty count — a sheet with
 * no lines can never be completed (`completeStockCount` rejects it) and would
 * sit `scheduled` forever.
 *
 * Scheduling moves no stock: it appends its Event and writes the count and its
 * lines, and no Movement. The count lands in `scheduled`, which is one of
 * `COMPLETABLE_STATUSES`, so it opens in the existing sheet and completes
 * through the existing flow.
 *
 * The number, the Event, the count and its lines commit together or not at all,
 * so a scheduling that fails partway leaves nothing behind — except its burned
 * number, which is correct for a Document number (`lib/db/numbers.ts`).
 */
export async function scheduleStockCount(
  actor: Actor,
  input: ScheduleStockCountInput,
  db: Db,
): Promise<ScheduleStockCountResult> {
  if (!can(actor.role, SCHEDULE_PERMISSION.module, SCHEDULE_PERMISSION.action)) {
    throw new CountError(
      `Your role (${actor.role}) is not allowed to schedule stock counts.`,
      "forbidden",
    );
  }

  const created = await db.transaction(async (tx) => {
    const holdings = await tx
      .select({
        productId: schema.stockRows.productId,
        locationId: schema.stockRows.locationId,
        onHand: schema.stockRows.onHand,
        sku: schema.products.sku,
        name: schema.products.name,
      })
      .from(schema.stockRows)
      .innerJoin(schema.products, eq(schema.products.id, schema.stockRows.productId))
      .innerJoin(schema.locations, eq(schema.locations.id, schema.stockRows.locationId))
      .where(
        and(
          eq(schema.stockRows.warehouseId, input.warehouseId),
          isNull(schema.stockRows.lotNumber),
          gt(schema.stockRows.onHand, 0),
          eq(schema.products.status, "active"),
          input.zone ? eq(schema.locations.zone, input.zone) : undefined,
          input.categoryId ? eq(schema.products.categoryId, input.categoryId) : undefined,
        ),
      )
      .orderBy(schema.stockRows.seq);

    // A `cycle` or `spot` count caps its sheet size; the others take the
    // scope whole. Sliced in JS rather than a SQL `LIMIT` sentinel — the
    // "no cap" case has no honest limit value to pass.
    const capped =
      input.limit && input.limit > 0 ? holdings.slice(0, input.limit) : holdings;

    if (capped.length === 0) {
      throw new CountError(
        "Nothing is held in that scope, so there is nothing to count.",
        "invalid",
      );
    }

    const number = await allocateDocumentNumber(tx, "stockCount");
    const id = newId("SC");
    const now = new Date();

    // The Event first — it is the source of truth; the rows below are its
    // projection and commit with it (ADR-0002, ADR-0003).
    const [event] = await tx
      .insert(schema.events)
      .values({
        type: "stock-count-scheduled",
        actorId: actor.id,
        payload: {
          stockCountId: id,
          number,
          warehouseId: input.warehouseId,
          countType: input.type,
          scopeLabel: input.scopeLabel,
          status: "scheduled",
          lines: capped.length,
        },
      })
      .returning({ seq: schema.events.seq });

    await tx.insert(schema.stockCounts).values({
      id,
      number,
      type: input.type,
      warehouseId: input.warehouseId,
      scopeLabel: input.scopeLabel,
      status: "scheduled",
      scheduledFor: new Date(
        now.getTime() + Math.max(0, input.scheduledInDays) * 24 * 60 * 60 * 1000,
      ).toISOString(),
      startedAt: null,
      completedAt: null,
      assignedTo: input.assignedTo,
      accuracyPct: 0,
      totalVarianceValue: 0,
      createdBy: actor.id,
      approvedBy: null,
    });

    await tx.insert(schema.countLines).values(
      capped.map((h, i) => ({
        stockCountId: id,
        id: `CL-${String(i + 1).padStart(3, "0")}`,
        productId: h.productId,
        sku: h.sku,
        name: h.name,
        locationId: h.locationId,
        // What the system believed at scheduling time. The counter's number is
        // measured against this, not against on-hand when they get there.
        expected: h.onHand,
        counted: null,
        variance: 0,
        varianceValue: 0,
        countedBy: null,
        countedAt: null,
        recount: false,
      })),
    );

    return { id, number, lines: capped.length, eventSeq: event.seq };
  });

  // After commit: evaluate matching Automation Rules in the same request
  // (ADR-0008), as every other flow that appends an Event does. Never throws.
  await runAutomation(db, [created.eventSeq]);
  return { id: created.id, number: created.number, lines: created.lines };
}
