import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { PageHeader } from "@/components/shell/page-header";
import { PermissionDenied } from "@/components/states";
import { RuleBuilder } from "../../new/rule-builder";
import { db } from "@/lib/data/store";
import { getRole } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { plural } from "@/lib/format";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const rule = db.automationRules.find((r) => r.id === id);
  return rule
    ? { title: `Edit ${rule.name}`, description: `Change when ${rule.name} fires and what it does.` }
    : { title: "Rule not found" };
}

export default async function EditAutomationRulePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const role = await getRole();
  const rule = db.automationRules.find((r) => r.id === id);
  if (!rule) notFound();
  if (!can(role, "automation", "edit")) {
    return <PermissionDenied module="automation" role={role} action="edit" />;
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
          { label: rule.name, href: `/admin/automation/${rule.id}` },
          { label: "Edit" },
        ]}
        title={`Edit ${rule.name}`}
        description={`This rule has fired ${plural(
          rule.runCount,
          "time",
        )}. Changing the trigger clears its conditions and actions — they are only valid against the trigger they were written for.`}
      />

      <div className="p-4 sm:p-6">
        <RuleBuilder
          scopes={scopes.includes(rule.scope) ? scopes : [rule.scope, ...scopes]}
          returnTo={`/admin/automation/${rule.id}`}
          initial={{
            name: rule.name,
            trigger: rule.trigger,
            scope: rule.scope,
            conditions: rule.conditions,
            actions: rule.actions,
            notes: rule.description,
            enabled: rule.enabled,
          }}
        />
      </div>
    </>
  );
}
