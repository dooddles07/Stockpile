"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { RolePermissionError, updateRolePermissions } from "@/lib/domain/roles";
import type { AccessLevel, ModuleKey } from "@/lib/types";

/**
 * The one write behind the permission editor (ticket 13). Per ADR-0005 it holds
 * no logic: it validates the payload shape, resolves the Actor from the
 * session, and hands off to `updateRolePermissions`. The permission check, the
 * module/level validation, the last-admin guard, the transaction and the audit
 * entry all live in the domain function — the trust boundary is there, not here.
 */

const LEVELS = ["none", "read", "read-export", "write", "approve", "manage"] as const;

const Schema = z.object({
  roleId: z.string().min(1),
  matrix: z.record(z.string(), z.enum(LEVELS)),
});

export type SaveRolePermissionsResult = { ok: boolean; message?: string };

export async function saveRolePermissionsAction(
  raw: unknown,
): Promise<SaveRolePermissionsResult> {
  const parsed = Schema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: "Those permissions could not be read." };

  const actor = await getCurrentUser();

  try {
    const matrix = parsed.data.matrix as Partial<Record<ModuleKey, AccessLevel>>;
    await updateRolePermissions(actor, parsed.data.roleId, matrix, getDb());
    // Role permissions gate the whole shell (nav, page access), so revalidate
    // the segment rather than one page — the same reason the notification
    // dismiss action does.
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (error) {
    if (error instanceof RolePermissionError) return { ok: false, message: error.message };
    throw error;
  }
}
