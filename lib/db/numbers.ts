/**
 * Document number allocation.
 *
 * Every Document number a visitor's creation produces comes from a Postgres
 * sequence — one per creatable Document type — read with `nextval` inside the
 * transaction that writes the Document, and formatted here into the exact shape
 * the seeded dataset uses. A created Purchase Order is `PO-2026-1101`, in the
 * same series as the seeded `PO-2026-1100` before it.
 *
 * A sequence rather than `max(number) + 1`: ADR-0010 puts every visitor on one
 * shared account, so two people creating the same Document type at the same
 * moment is the normal case, and a read-then-increment races unless it takes a
 * lock nothing else needs. `nextval` does not race and does not lock. It also
 * does not roll back — a creation that fails burns its number, which is correct
 * for a Document number and not a defect. The unique index on each `number`
 * column is the backstop that turns any future non-sequence allocation into a
 * loud error rather than a duplicate on screen.
 *
 * The seed is the trap: it loads Documents numbered from a fixed base, so every
 * sequence has to be advanced past the highest number it loaded on every run
 * (`advanceDocumentNumbers`, called by `lib/db/seed.ts`) or the first creation
 * collides with a seeded row.
 *
 * This module imports nothing from `./schema` — `schema.ts` imports the
 * sequence names from here to declare them, so the migration and the allocator
 * cannot drift apart.
 */

import { sql, type SQL } from "drizzle-orm";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";

/** The year every seeded Document number carries (`lib/data/store.ts`). */
const NUMBER_YEAR = 2026;

/**
 * A Drizzle handle a number can be allocated on: the pool, or the open
 * transaction of the creation that needs the number.
 */
export type NumberDb = Pick<NeonDatabase, "execute">;

export type DocumentNumberType =
  | "purchaseOrder"
  | "salesOrder"
  | "transfer"
  | "adjustment"
  | "stockCount"
  | "salesReturn"
  | "purchaseReturn";

type DocumentNumberSpec = {
  /** The Postgres sequence, declared in `schema.ts` and created by migration. */
  sequence: string;
  /** The `PO` in `PO-2026-1100`. */
  prefix: string;
  /** The counter the seeded series starts at, so an empty table still matches. */
  start: number;
  /** Digits the counter is padded to — `CNT-2026-050` pads to 3, not 4. */
  pad: number;
  /** The table the seeded numbers of this type live in. */
  table: string;
  /** `returns` holds both kinds, so its two series are told apart by `kind`. */
  where?: SQL;
};

/**
 * Every Document type that can be created, and the shape of its number. The
 * prefix, padding and table mirror the generated dataset exactly — change one
 * here and created Documents stop matching seeded ones.
 */
export const documentNumbers: Record<DocumentNumberType, DocumentNumberSpec> = {
  purchaseOrder: {
    sequence: "purchase_order_number_seq",
    prefix: "PO",
    start: 1000,
    pad: 4,
    table: "purchase_orders",
  },
  salesOrder: {
    sequence: "sales_order_number_seq",
    prefix: "SO",
    start: 4000,
    pad: 4,
    table: "sales_orders",
  },
  transfer: { sequence: "transfer_number_seq", prefix: "TR", start: 200, pad: 3, table: "transfers" },
  adjustment: { sequence: "adjustment_number_seq", prefix: "ADJ", start: 300, pad: 4, table: "adjustments" },
  stockCount: { sequence: "stock_count_number_seq", prefix: "CNT", start: 50, pad: 3, table: "stock_counts" },
  salesReturn: {
    sequence: "sales_return_number_seq",
    prefix: "SR",
    start: 100,
    pad: 3,
    table: "returns",
    where: sql`kind = 'sales'`,
  },
  purchaseReturn: {
    sequence: "purchase_return_number_seq",
    prefix: "PR",
    start: 100,
    pad: 3,
    table: "returns",
    where: sql`kind = 'purchase'`,
  },
};

/**
 * The next number for a Document type, formatted. Pass the open transaction of
 * the creation that needs it; the number is allocated with `nextval`, so two
 * concurrent callers never receive the same one, and a caller that then rolls
 * back leaves its number burned rather than reused.
 */
export async function allocateDocumentNumber(
  db: NumberDb,
  type: DocumentNumberType,
): Promise<string> {
  const spec = documentNumbers[type];
  const result = await db.execute(
    sql`select nextval(${spec.sequence}::regclass)::bigint::int as value`,
  );
  const value = (result.rows[0] as { value: number } | undefined)?.value;
  if (typeof value !== "number") {
    throw new Error(`allocateDocumentNumber: ${spec.sequence} returned no value`);
  }
  return `${spec.prefix}-${NUMBER_YEAR}-${String(value).padStart(spec.pad, "0")}`;
}

/**
 * Advance every sequence past the highest number already in the database. The
 * seed calls this after loading, on every run — including ADR-0010's daily
 * reset — so the first Document a visitor creates continues the seeded series
 * instead of colliding with it.
 *
 * The high water mark is read from the loaded rows rather than from the
 * generator's bases, so it stays correct if the dataset changes size.
 */
export async function advanceDocumentNumbers(db: NumberDb): Promise<void> {
  for (const spec of Object.values(documentNumbers)) {
    // split_part on the third segment: `ADJ-2026-0300` -> 300. `setval(..., n,
    // true)` makes the next nextval n + 1; the coalesce covers a type the seed
    // loaded no rows for, which then starts at its own base.
    await db.execute(sql`
      select setval(
        ${spec.sequence}::regclass,
        coalesce(
          (select max(split_part(number, '-', 3)::bigint)
             from ${sql.raw(spec.table)}
            ${spec.where ? sql`where ${spec.where}` : sql``}),
          ${spec.start - 1}
        ),
        true
      )
    `);
  }
}
