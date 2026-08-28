import "server-only";

import { cookies } from "next/headers";

import { db } from "@/lib/data/store";
import { ROLE_BY_ID } from "./permissions";
import type { Role, User } from "@/lib/types";

export const ROLE_COOKIE = "stockpile-role";
export const DEFAULT_ROLE: Role = "super-admin";

/**
 * The active role.
 *
 * Held in a cookie rather than client state so server components can gate on
 * it too — a permission check that only runs in the browser is decoration.
 */
export async function getRole(): Promise<Role> {
  const store = await cookies();
  const value = store.get(ROLE_COOKIE)?.value as Role | undefined;
  return value && ROLE_BY_ID.has(value) ? value : DEFAULT_ROLE;
}

/** A representative user for the active role, used for avatars and attribution. */
export async function getCurrentUser(): Promise<User> {
  const role = await getRole();
  return (
    db.users.find((u) => u.role === role && u.status === "active") ??
    db.users.find((u) => u.role === role) ??
    db.users[0]
  );
}
