/**
 * Editing a Role's permission matrix (ticket 13).
 *
 * ADR-0004 promised roles are "editable at runtime through the admin UI". The
 * editor computed the diff accurately and then called `toast.success` without
 * writing anything; this is the write. `hydrateRoles` already reloads the
 * `roles` table per request (`getRole()` → `ensureRoles`), so a saved matrix is
 * live on the next request with no cache to bust.
 *
 * Two guards live here rather than in the server action, because automation and
 * a later REST layer reach this function too (ADR-0004, ADR-0005):
 *
 *  - editing permissions *is* the `roles` permission, so an Actor whose Role
 *    cannot `manage` `roles` is refused before anything is read;
 *  - the last Role holding `roles: manage` may not drop it — otherwise nobody
 *    can open the permission editor again without a reseed.
 *
 * Like the other `lib/domain` modules this imports no `server-only` code: the
 * caller passes the Drizzle handle. The permission matrix must already be
 * hydrated (`hydrateRoles`, reached through `getRole()` on the request path).
 */

import { eq } from "drizzle-orm";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";

import { LEVEL_LABEL, can } from "@/lib/auth/permissions";
import { newId } from "@/lib/domain/reference";
import { type Actor } from "@/lib/domain/stock";
import * as schema from "@/lib/db/schema";
import type { AccessLevel, ModuleKey, Role } from "@/lib/types";

type Db = NeonDatabase<typeof schema>;

export type RolePermissionErrorCode = "forbidden" | "not-found" | "last-admin";

export class RolePermissionError extends Error {
  constructor(
    message: string,
    readonly code: RolePermissionErrorCode,
  ) {
    super(message);
    this.name = "RolePermissionError";
  }
}

export interface RolePermissionChange {
  module: ModuleKey;
  from: AccessLevel;
  to: AccessLevel;
}

export interface UpdatedRolePermissions {
  roleId: string;
  changed: RolePermissionChange[];
}

/** Only `manage` expands to the `manage` action — the level that unlocks the editor. */
const grantsRoleAdmin = (level: AccessLevel | undefined): boolean => level === "manage";

/**
 * Apply a permission matrix to one Role in a single transaction and record who
 * changed what. Throws `RolePermissionError` and writes nothing when the Actor
 * cannot manage roles, the Role does not exist, or the change would leave no
 * Role able to edit permissions. A matrix with nothing new in it is a no-op
 * that returns an empty `changed` list.
 */
export async function updateRolePermissions(
  actor: Actor,
  roleId: string,
  matrix: Partial<Record<ModuleKey, AccessLevel>>,
  db: Db,
): Promise<UpdatedRolePermissions> {
  if (!can(actor.role, "roles", "manage")) {
    throw new RolePermissionError(
      `Your role (${actor.role}) is not allowed to change role permissions.`,
      "forbidden",
    );
  }

  return db.transaction(async (tx) => {
    const [target] = await tx
      .select()
      .from(schema.roles)
      .where(eq(schema.roles.id, roleId as Role))
      .for("update");

    if (!target) {
      throw new RolePermissionError("That role could not be found.", "not-found");
    }

    const next = { ...target.permissions, ...matrix };
    const changed: RolePermissionChange[] = (Object.keys(next) as ModuleKey[])
      .filter((m) => next[m] !== target.permissions[m])
      .map((m) => ({ module: m, from: target.permissions[m] ?? "none", to: next[m] ?? "none" }));

    if (changed.length === 0) return { roleId, changed };

    // The last Role that can open the permission editor must not lose that, or
    // the system locks everyone out of its own authorization surface.
    if (grantsRoleAdmin(target.permissions.roles) && !grantsRoleAdmin(next.roles)) {
      const all = await tx
        .select({ id: schema.roles.id, permissions: schema.roles.permissions })
        .from(schema.roles);
      const otherAdmins = all.filter(
        (r) => r.id !== roleId && grantsRoleAdmin(r.permissions.roles),
      );
      if (otherAdmins.length === 0) {
        throw new RolePermissionError(
          `${target.label} is the last role that can edit permissions — it cannot give that up.`,
          "last-admin",
        );
      }
    }

    await tx.update(schema.roles).set({ permissions: next }).where(eq(schema.roles.id, roleId as Role));

    await tx.insert(schema.auditEntries).values({
      id: newId("AUD"),
      ts: new Date().toISOString(),
      userId: actor.id,
      action: "permission-change",
      entity: "Role",
      entityId: roleId,
      entityLabel: target.label,
      field: "permissions",
      before: changed.map((c) => `${c.module}=${LEVEL_LABEL[c.from]}`).join(", "),
      after: changed.map((c) => `${c.module}=${LEVEL_LABEL[c.to]}`).join(", "),
      ip: "internal",
      device: "admin permission editor",
    });

    return { roleId, changed };
  });
}
