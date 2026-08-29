import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";

import { roles, users } from "@/lib/repo/reference";
import { ROLE_BY_ID, hydrateRoles } from "./permissions";
import type { Role, User } from "@/lib/types";

export const ROLE_COOKIE = "stockpile-role";
export const DEFAULT_ROLE: Role = "super-admin";

/**
 * Load the role rows into the permission engine, once per request. Every server
 * path that gates on a role goes through `getRole()`, so `can()` / `levelFor()`
 * see a populated matrix without changing their synchronous signatures. The
 * client hydrates separately, in `<RoleProvider>`.
 */
export const ensureRoles = cache(async (): Promise<void> => {
  hydrateRoles(await roles());
});

/**
 * The active role.
 *
 * Held in a cookie rather than client state so server components can gate on
 * it too — a permission check that only runs in the browser is decoration.
 */
export async function getRole(): Promise<Role> {
  await ensureRoles();
  const store = await cookies();
  const value = store.get(ROLE_COOKIE)?.value as Role | undefined;
  return value && ROLE_BY_ID.has(value) ? value : DEFAULT_ROLE;
}

/** A representative user for the active role, used for avatars and attribution. */
export async function getCurrentUser(): Promise<User> {
  const role = await getRole();
  const all = await users();
  return (
    all.find((u) => u.role === role && u.status === "active") ??
    all.find((u) => u.role === role) ??
    all[0]
  );
}
