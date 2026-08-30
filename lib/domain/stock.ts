/**
 * The choke point.
 *
 * Every stock change in Stockpile passes through `applyStockChange`. It is the
 * only code permitted to append an Event or update a stock projection
 * (`stock_rows`, the Movement ledger). Every later write flow — receipt,
 * shipment, transfer, adjustment, count correction, damage, return — is a
 * domain function that computes the deltas and calls this once. That is what
 * makes ADR-0006's guarantee hold: the row lock is taken in exactly one place,
 * so it cannot be forgotten in another.
 *
 * The sequence inside the transaction is fixed and the order matters
 * (ADR-0006): check the Actor's permission, lock the affected Stock Row for
 * update, read the current balance, append the Event, update the projection,
 * commit. Locking before reading is the point — reading first reintroduces the
 * race the lock exists to prevent.
 *
 * This module deliberately imports no `server-only` code (no `lib/db/client`,
 * no `lib/repo/*`): the caller passes the Drizzle handle. The request path
 * passes `getDb()`; `stock.checks.ts` and any future REST caller pass their
 * own pool. The permission matrix must already be hydrated (`hydrateRoles`,
 * which the request path reaches through `getRole()`) before a call.
 */

import { and, eq, isNull } from "drizzle-orm";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";

import { can } from "@/lib/auth/permissions";
import * as schema from "@/lib/db/schema";
import type { ModuleKey, MovementType, PermissionAction, Role, User } from "@/lib/types";

type Db = NeonDatabase<typeof schema>;

/**
 * A Drizzle handle the choke point can run on: either the pool (`getDb()`, the
 * check scripts) or an already-open transaction. A document write flow that has
 * to advance a Document *and* move stock in one atomic unit — goods receipt
 * (ticket 12), shipment, transfer, count — opens its own `db.transaction` and
 * passes the `tx` here; `applyStockChange`'s inner `db.transaction` then nests
 * as a savepoint, so the stock change commits and rolls back with the document
 * advance rather than in a transaction of its own.
 */
export type StockDb = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];

/** The user on whose authority a change is made (CONTEXT.md "Actor"). */
export type Actor = Pick<User, "id" | "name" | "role">;

/**
 * The Actor automation acts as (ADR-0004: "automation acts as a designated
 * system Actor rather than as nobody"). Not a `users` row — `events.actor_id`
 * and `movements.user_id` carry no foreign key — so a constant is enough until
 * automation rules exist (ticket 17) and attribution needs a joinable name.
 *
 * ponytail: `super-admin` so a rule can move stock in any module. Narrow it to
 * a purpose-built role if automation should ever be more constrained than a
 * human admin.
 */
export const SYSTEM_ACTOR: Actor = {
  id: "system",
  name: "Automation",
  role: "super-admin" as Role,
};

export type StockChangeErrorCode =
  | "forbidden"
  | "invalid"
  | "not-found"
  | "negative-stock";

export class StockChangeError extends Error {
  constructor(
    message: string,
    readonly code: StockChangeErrorCode,
  ) {
    super(message);
    this.name = "StockChangeError";
  }
}

export interface StockChangeInput {
  productId: string;
  warehouseId: string;
  locationId: string;
  /** Null targets the un-lotted holding; a string targets that lot. */
  lotNumber?: string | null;
  movementType: MovementType;
  /** Signed change to on-hand. Negative removes stock. */
  onHandDelta: number;
  /** Signed change to the damaged balance. Damage is `onHandDelta < 0` and this `> 0`. */
  damagedDelta?: number;
  /** Required — story 19: no quantity changes without an explanation. */
  reason: string;
  /**
   * What the Actor must be allowed to do for this change to be accepted.
   *
   * ponytail: caller-supplied because ticket 09 builds no callers yet. Once the
   * write flows exist (ticket 10+), fold this into a `movementType -> {module,
   * action}` map here, so the mapping is decided in the one place ADR-0004 puts
   * the check rather than re-stated at every call site.
   */
  permission: { module: ModuleKey; action: PermissionAction };
  /** The Document this change settles, for the ledger row. */
  ref?: { type: string; id: string; number: string };
}

export interface StockChangeResult {
  eventSeq: number;
  movementId: string;
  onHand: number;
  damaged: number;
}

/**
 * Apply one stock change: permission-checked, locked, event-sourced, projected,
 * in a single interactive transaction. Throws `StockChangeError` — nothing is
 * written — when the Actor is not permitted, the target holding is not a single
 * row, or the change would drive on-hand (or damaged) below zero.
 */
export async function applyStockChange(
  actor: Actor,
  input: StockChangeInput,
  db: StockDb,
): Promise<StockChangeResult> {
  const damagedDelta = input.damagedDelta ?? 0;

  return db.transaction(async (tx) => {
    // 1. permission — before anything else, per ADR-0004 ("check permission
    //    before doing anything").
    if (!can(actor.role, input.permission.module, input.permission.action)) {
      throw new StockChangeError(
        `${actor.name} is not permitted to ${input.permission.action} ${input.permission.module}.`,
        "forbidden",
      );
    }

    // Input the server action's zod schema (ADR-0005) will also enforce;
    // re-checked here because automation and any REST caller do not pass one.
    if (!input.reason.trim()) {
      throw new StockChangeError("A reason is required for every stock change.", "invalid");
    }

    // 2. lock the affected Stock Row(s) for update, before the read (ADR-0006).
    const held = await tx
      .select()
      .from(schema.stockRows)
      .where(
        and(
          eq(schema.stockRows.productId, input.productId),
          eq(schema.stockRows.warehouseId, input.warehouseId),
          eq(schema.stockRows.locationId, input.locationId),
          input.lotNumber == null
            ? isNull(schema.stockRows.lotNumber)
            : eq(schema.stockRows.lotNumber, input.lotNumber),
        ),
      )
      .for("update")
      .orderBy(schema.stockRows.seq);

    if (held.length !== 1) {
      throw new StockChangeError(
        held.length === 0
          ? "No stock holding for that product, location and lot."
          : "That product and location holds more than one lot; a lot is required.",
        "not-found",
      );
    }
    const row = held[0];

    // 3. read the current balance and reject the physically impossible.
    const nextOnHand = row.onHand + input.onHandDelta;
    const nextDamaged = row.damaged + damagedDelta;
    if (nextOnHand < 0) {
      throw new StockChangeError("That change would drive on-hand below zero.", "negative-stock");
    }
    if (nextDamaged < 0) {
      throw new StockChangeError("That change would drive damaged below zero.", "negative-stock");
    }

    const [product] = await tx
      .select({ sku: schema.products.sku, unitCost: schema.products.unitCost })
      .from(schema.products)
      .where(eq(schema.products.id, input.productId));
    if (!product) {
      throw new StockChangeError("Unknown product.", "not-found");
    }

    // 4. append the Event — the source of truth.
    const [event] = await tx
      .insert(schema.events)
      .values({
        type: input.movementType,
        actorId: actor.id,
        payload: {
          productId: input.productId,
          warehouseId: input.warehouseId,
          locationId: input.locationId,
          lotNumber: row.lotNumber,
          movementType: input.movementType,
          onHandDelta: input.onHandDelta,
          damagedDelta,
          onHandBefore: row.onHand,
          onHandAfter: nextOnHand,
          damagedBefore: row.damaged,
          damagedAfter: nextDamaged,
          reason: input.reason,
          ref: input.ref ?? null,
        },
      })
      .returning({ seq: schema.events.seq, id: schema.events.id, createdAt: schema.events.createdAt });

    // 5. update the projection — same transaction, so it can never disagree
    //    with the stream (ADR-0003).
    await tx
      .update(schema.stockRows)
      .set({ onHand: nextOnHand, damaged: nextDamaged })
      .where(eq(schema.stockRows.seq, row.seq));

    const valueChange = Math.round(input.onHandDelta * product.unitCost * 100) / 100;
    const [movement] = await tx
      .insert(schema.movements)
      .values({
        id: `MOV-${event.id.slice(0, 8)}`,
        ts: event.createdAt.toISOString(),
        type: input.movementType,
        productId: input.productId,
        sku: product.sku,
        warehouseId: input.warehouseId,
        locationId: input.locationId,
        qtyBefore: row.onHand,
        qtyChange: input.onHandDelta,
        qtyAfter: nextOnHand,
        unitCost: product.unitCost,
        valueChange,
        refType: input.ref?.type ?? "",
        refId: input.ref?.id ?? "",
        refNumber: input.ref?.number ?? "",
        userId: actor.id,
        reason: input.reason,
      })
      .returning({ id: schema.movements.id });

    // 6. commit — implicit on resolve.
    return {
      eventSeq: event.seq,
      movementId: movement.id,
      onHand: nextOnHand,
      damaged: nextDamaged,
    };
  });
}

/**
 * Make sure a `(product, warehouse, location, lot)` Stock Row exists, inserting
 * a zero-balance one if it does not. `applyStockChange` deliberately never
 * inserts a Stock Row — it locks exactly one and moves its balance — so a flow
 * that can put stock into a holding that has never existed (a goods receipt
 * into a fresh put-away location, ticket 12) calls this first, on the same
 * transaction handle, so the row is there for the choke point to lock.
 *
 * This lives here, beside the choke point, so that `stock_rows` is still only
 * ever written from this one module. It creates row *structure*, not a
 * projected balance: every quantity still moves through `applyStockChange`.
 *
 * ponytail: SELECT-then-INSERT with no unique constraint on the tuple, so two
 * concurrent receipts into the same brand-new holding could both insert. That
 * needs a partial unique index to close properly; until a flow can create the
 * same holding twice at once it is not worth the migration.
 */
export async function ensureStockHolding(
  db: StockDb,
  holding: {
    productId: string;
    warehouseId: string;
    locationId: string;
    lotNumber: string | null;
  },
): Promise<void> {
  const existing = await db
    .select({ seq: schema.stockRows.seq })
    .from(schema.stockRows)
    .where(
      and(
        eq(schema.stockRows.productId, holding.productId),
        eq(schema.stockRows.warehouseId, holding.warehouseId),
        eq(schema.stockRows.locationId, holding.locationId),
        holding.lotNumber == null
          ? isNull(schema.stockRows.lotNumber)
          : eq(schema.stockRows.lotNumber, holding.lotNumber),
      ),
    )
    .limit(1);
  if (existing.length > 0) return;

  await db.insert(schema.stockRows).values({
    productId: holding.productId,
    warehouseId: holding.warehouseId,
    locationId: holding.locationId,
    lotNumber: holding.lotNumber,
    onHand: 0,
    reserved: 0,
    damaged: 0,
    incoming: 0,
    inTransit: 0,
  });
}

/**
 * The nine movement types as a runtime list — the Event types the
 * reconciliation check replays (the `events` table will later also hold
 * document events, which it must skip). `satisfies` plus the `Exclude` guard
 * below make `tsc` fail if `MovementType` gains a member this list is missing.
 */
export const MOVEMENT_TYPES = [
  "purchase-receipt",
  "sale",
  "transfer-out",
  "transfer-in",
  "adjustment",
  "return-in",
  "return-out",
  "damage",
  "count-correction",
] as const satisfies readonly MovementType[];

type _MovementTypesExhaustive =
  Exclude<MovementType, (typeof MOVEMENT_TYPES)[number]> extends never
    ? true
    : ["MOVEMENT_TYPES is missing", Exclude<MovementType, (typeof MOVEMENT_TYPES)[number]>];
const _movementTypesExhaustive: _MovementTypesExhaustive = true;
void _movementTypesExhaustive;
