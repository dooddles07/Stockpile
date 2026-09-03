import { PageHeader } from "@/components/shell/page-header";
import { PermissionDenied } from "@/components/states";
import { getRole } from "@/lib/auth/session";
import { can, isReadOnly } from "@/lib/auth/permissions";
import { StatusBadge } from "@/components/status/status-badge";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const role = await getRole();
  if (!can(role, "settings")) return <PermissionDenied module="settings" role={role} />;

  const readOnly = isReadOnly(role, "settings");

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Administration", href: "/admin/users" }, { label: "Settings" }]}
        title="Settings"
        description="Configuration that changes how the whole system behaves. Every change here is written to the audit log."
        badge={readOnly ? <StatusBadge label="Read only" tone="neutral" size="md" /> : undefined}
      />

      <div className="p-4 sm:p-6">
        <div className="min-w-0">{children}</div>
      </div>
    </>
  );
}
