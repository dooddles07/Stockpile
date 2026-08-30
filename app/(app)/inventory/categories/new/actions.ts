"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import {
  attempt,
  createCategory,
  updateCategory,
  type SaveResult,
} from "@/lib/domain/reference";

/**
 * Reference-data write actions for Categories (ticket 11). Per ADR-0005 the
 * action holds no logic: it re-validates the payload with zod at the trust
 * boundary, resolves the Actor from the session, and delegates to the domain
 * function, which owns the permission check and the row write.
 */

const ROOT = "—none—";

const Schema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().trim().min(2),
  // The form's picker uses a sentinel for "top level"; the domain wants null.
  parentId: z
    .string()
    .transform((v) => (v === ROOT || v === "" ? null : v))
    .nullable(),
  description: z.string().trim().min(1).max(240),
});

export async function saveCategory(raw: unknown): Promise<SaveResult> {
  const parsed = Schema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, code: "invalid", message: "Check the highlighted fields and try again." };
  }

  const { id, ...input } = parsed.data;
  const actor = await getCurrentUser();
  const db = getDb();

  const result = await attempt(() =>
    id ? updateCategory(actor, id, input, db).then(() => id) : createCategory(actor, input, db),
  );

  if (result.ok) {
    revalidatePath("/inventory/categories");
    if (id) revalidatePath(`/inventory/categories/${id}/edit`);
  }
  return result;
}
