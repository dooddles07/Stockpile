"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { ALL_MODULE_KEYS } from "@/lib/auth/permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { RolePermissionError, updateRolePermissions } from "@/lib/domain/roles";
import type { AccessLevel, ModuleKey } from "@/lib/types";

/**
 * The one write behind the permission editor (ticket 13). Per ADR-0005 it holds
 * no logic: it validates the matrix, resolves the Actor from the session, drops
 * any key that is not a real module, and hands off to `updateRolePermissions`.
 * The permission check, the last-admin guard, the transaction and the audit
 * entry all live in the domain function.
 */

const LEVELS = ["none", "read", "read-export", "write", "approve", "manage"] as const;

const Schema = z.object({
  roleId: z.string().min(1),
  matrix: z.record(z.string(), z.enum(LEVELS)),
});

export type SaveRolePermissionsResult = { ok: boolean; message: string };

export async function saveRolePermissionsAction(
  raw: unknown,
): Promise<SaveRolePermissionsResult> {
  const parsed = Schema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: "Those permissions could not be read." };

  const known = new Set<string>(ALL_MODULE_KEYS);
  const matrix = Object.fromEntries(
    Object.entries(parsed.data.matrix).filter(([key]) => known.has(key)),
  ) as Partial<Record<ModuleKey, AccessLevel>>;

  const actor = await getCurrentUser();

  try {
    const { changed } = await updateRolePermissions(actor, parsed.data.roleId, matrix, getDb());
    // Role permissions gate the whole shell (nav, page access), so revalidate
    // the segment rather than one page.
    revalidatePath("/", "layout");
    return {
      ok: true,
      message:
        changed.length === 0
          ? "No permission on this role changed."
          : `${changed.length} ${changed.length === 1 ? "module" : "modules"} updated.`,
    };
  } catch (error) {
    if (error instanceof RolePermissionError) return { ok: false, message: error.message };
    throw error;
  }
}
