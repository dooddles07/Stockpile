import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { PageHeader } from "@/components/shell/page-header";
import { PermissionDenied } from "@/components/states";
import { PermissionEditor, type ModuleRow } from "./permission-editor";
import {
  ALL_MODULE_KEYS,
  MODULE_GROUP,
  MODULE_LABEL,
  ROLE_BY_ID,
  can,
  levelFor,
} from "@/lib/auth/permissions";
import { users as allUsers } from "@/lib/repo/reference";
import { ensureRoles, getRole } from "@/lib/auth/session";
import { plural } from "@/lib/format";
import type { Role } from "@/lib/types";

// Roles are Postgres rows and the build has no DATABASE_URL, so these render on
// demand rather than prerendered — 7 admin pages, nothing gained by prerender.
export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  await ensureRoles();
  const { id } = await params;
  const meta = ROLE_BY_ID.get(id as Role);
  return meta
    ? { title: `Edit ${meta.label}`, description: `Change what the ${meta.label} role can reach.` }
    : { title: "Role not found" };
}

export default async function EditRolePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const role = await getRole();
  const meta = ROLE_BY_ID.get(id as Role);
  if (!meta) notFound();
  if (!can(role, "roles", "manage")) {
    return <PermissionDenied module="roles" role={role} action="change permissions for" />;
  }

  const holders = (await allUsers()).filter((u) => u.role === meta.id && u.status === "active").length;

  const modules: ModuleRow[] = ALL_MODULE_KEYS.map((key) => ({
    key,
    label: MODULE_LABEL[key],
    group: MODULE_GROUP[key],
    level: levelFor(meta.id, key),
  }));

  return (
    <>
      <PageHeader
        crumbs={[
          { label: "Administration", href: "/admin/users" },
          { label: "Roles", href: "/admin/roles" },
          { label: meta.label, href: `/admin/roles/${meta.id}` },
          { label: "Edit" },
        ]}
        title={`Edit ${meta.label}`}
        description={`${plural(
          holders,
          "person holds",
          "people hold",
        )} this role today. Narrowing a module takes their access away at their next page load, mid-shift, without warning them — widening one is the safe direction.`}
      />

      <div className="p-4 sm:p-6">
        <PermissionEditor
          roleLabel={meta.label}
          holders={holders}
          modules={modules}
          returnTo={`/admin/roles/${meta.id}`}
          locked={meta.id === "super-admin"}
        />
      </div>
    </>
  );
}
