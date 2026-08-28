import type { Metadata } from "next";

import { PageHeader } from "@/components/shell/page-header";
import { PermissionDenied } from "@/components/states";
import { UserForm } from "./user-form";
import { db } from "@/lib/data/store";
import { getRole } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";

export const metadata: Metadata = {
  title: "Invite a user",
  description: "Send an invitation and set what the account can do.",
};

export default async function NewUserPage() {
  const role = await getRole();
  if (!can(role, "users", "create")) {
    return <PermissionDenied module="users" role={role} action="invite people to" />;
  }

  const sites = db.warehouses.map((w) => ({ id: w.id, label: `${w.code} · ${w.name}` }));

  return (
    <>
      <PageHeader
        crumbs={[
          { label: "Administration", href: "/admin/users" },
          { label: "Users", href: "/admin/users" },
          { label: "Invite" },
        ]}
        title="Invite a user"
        description="The account stays in an invited state until the person accepts. Nothing they are given here takes effect before that, so a wrong role can be corrected without anyone noticing."
      />

      <div className="p-4 sm:p-6">
        <UserForm sites={sites} />
      </div>
    </>
  );
}
