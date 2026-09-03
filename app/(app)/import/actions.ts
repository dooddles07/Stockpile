"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { ImportError, importRows } from "@/lib/domain/import";
import type { ImportKind } from "@/lib/import/validate";

/**
 * The import wizard's write step (ticket 14). Per ADR-0005 this only re-checks
 * the shape at the trust boundary and delegates: `importRows` owns the
 * permission check, the per-kind routing and the one-transaction-per-file
 * guarantee. The wizard hands over the rows it already validated.
 */

const Schema = z.object({
  kind: z.enum(["products", "suppliers", "customers", "stock"]),
  rows: z.array(z.record(z.string(), z.string())).min(1),
});

const REVALIDATE: Record<ImportKind, string[]> = {
  products: ["/inventory/products"],
  suppliers: ["/purchasing/suppliers"],
  customers: ["/sales/customers"],
  stock: ["/inventory/stock-levels", "/inventory/movements"],
};

export type ImportActionResult =
  | { ok: true; imported: number }
  | { ok: false; message: string };

export async function runImport(raw: unknown): Promise<ImportActionResult> {
  const parsed = Schema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, message: "The rows to import were not in the expected shape." };
  }

  const actor = await getCurrentUser();

  try {
    const { kind, imported } = await importRows(
      actor,
      parsed.data.kind,
      parsed.data.rows,
      getDb(),
    );
    for (const path of REVALIDATE[kind]) revalidatePath(path);
    return { ok: true, imported };
  } catch (error) {
    if (error instanceof ImportError) return { ok: false, message: error.message };
    throw error;
  }
}
