"use client";

import { createContext, useCallback, useContext, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";

import { ROLE_BY_ID, can, hydrateRoles, isReadOnly, levelFor } from "@/lib/auth/permissions";
import type { ModuleKey, PermissionAction, Role, RoleRow, User } from "@/lib/types";

const ROLE_COOKIE = "stockpile-role";

interface RoleContextValue {
  role: Role;
  user: User;
  setRole: (role: Role) => void;
  switching: boolean;
  can: (module: ModuleKey, action?: PermissionAction) => boolean;
  isReadOnly: (module: ModuleKey) => boolean;
  levelFor: (module: ModuleKey) => ReturnType<typeof levelFor>;
}

const RoleContext = createContext<RoleContextValue | null>(null);

export function RoleProvider({
  initialRole,
  user,
  roles,
  children,
}: {
  initialRole: Role;
  user: User;
  /** The role rows, from Postgres. Feeds the client-side permission engine so
   *  `can()` / `levelFor()` stay synchronous in components as they were. */
  roles: RoleRow[];
  children: React.ReactNode;
}) {
  // Runs before any descendant renders, so components reading `ROLES` / the
  // matrix from `@/lib/auth/permissions` see it populated. Idempotent.
  hydrateRoles(roles);

  const router = useRouter();
  const [switching, startTransition] = useTransition();

  const setRole = useCallback(
    (next: Role) => {
      if (!ROLE_BY_ID.has(next)) return;
      // One year, path-wide: the switcher is a demo affordance, not auth.
      document.cookie = `${ROLE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
      startTransition(() => router.refresh());
    },
    [router],
  );

  const value = useMemo<RoleContextValue>(
    () => ({
      role: initialRole,
      user,
      setRole,
      switching,
      can: (module, action = "view") => can(initialRole, module, action),
      isReadOnly: (module) => isReadOnly(initialRole, module),
      levelFor: (module) => levelFor(initialRole, module),
    }),
    [initialRole, user, setRole, switching],
  );

  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
}

export function useRole(): RoleContextValue {
  const ctx = useContext(RoleContext);
  if (!ctx) throw new Error("useRole must be used inside <RoleProvider>");
  return ctx;
}
