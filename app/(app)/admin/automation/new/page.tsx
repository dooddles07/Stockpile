import type { Metadata } from "next";

import { PageHeader } from "@/components/shell/page-header";
import { PermissionDenied } from "@/components/states";
import { RuleBuilder } from "./rule-builder";
import { db } from "@/lib/data/store";
import { getRole } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";

export const metadata: Metadata = {
  title: "New automation rule",
  description: "Build a trigger, its conditions and what happens when it fires.",
};

export default async function NewAutomationRulePage() {
  const role = await getRole();
  if (!can(role, "automation", "create")) {
    return <PermissionDenied module="automation" role={role} action="create" />;
  }

  const scopes = [
    "All warehouses",
    ...db.warehouses.map((w) => `${w.code} · ${w.name}`),
    "All suppliers",
    "All channels",
  ];

  return (
    <>
      <PageHeader
        crumbs={[
          { label: "Administration", href: "/admin/users" },
          { label: "Automation", href: "/admin/automation" },
          { label: "New rule" },
        ]}
        title="New automation rule"
        description="One trigger, the conditions that must hold, and what happens when they do. Every run is logged whether it acts or skips."
      />

      <div className="p-4 sm:p-6">
        <RuleBuilder scopes={scopes} />
      </div>
    </>
  );
}
