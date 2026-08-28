import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, ScrollText } from "lucide-react";

import { PageHeader } from "@/components/shell/page-header";
import { EmptyState, PermissionDenied } from "@/components/states";
import { StatTile } from "@/components/record/field-grid";
import { StatusBadge } from "@/components/status/status-badge";
import { REPORTS, reportGroups, reportSize } from "@/lib/repo/reports";
import { getRole } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { plural, qty } from "@/lib/format";

export const metadata: Metadata = {
  title: "Reports",
  description: "Runnable reports across inventory, purchasing, sales and warehousing.",
};

export default async function ReportsPage() {
  const role = await getRole();
  if (!can(role, "reports")) return <PermissionDenied module="reports" role={role} />;

  const available = REPORTS.filter((r) => can(role, r.module));
  const groups = reportGroups().filter((g) => available.some((r) => r.group === g));

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Analytics", href: "/analytics/inventory" }, { label: "Reports" }]}
        title="Reports"
        description="Every report runs against live data and exports the rows exactly as shown. Nothing here is a snapshot taken at some earlier point — a report and the screen it came from cannot disagree."
      >
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatTile label="Reports available" value={qty(available.length)} />
          <StatTile
            label="Restricted by role"
            value={qty(REPORTS.length - available.length)}
            tone={REPORTS.length - available.length > 0 ? "neutral" : "success"}
            hint={
              REPORTS.length - available.length > 0
                ? "Not part of your role"
                : "Full access"
            }
          />
          <StatTile label="Groups" value={qty(groups.length)} />
          <StatTile
            label="Export"
            value={can(role, "reports", "export") ? "Enabled" : "Restricted"}
            tone={can(role, "reports", "export") ? "success" : "neutral"}
          />
        </div>
      </PageHeader>

      <div className="grid gap-6 p-4 sm:p-6">
        {available.length === 0 ? (
          <div className="rounded-lg border bg-surface">
            <EmptyState
              icon={ScrollText}
              title="No reports available to your role"
              description="Reports follow the same permissions as the modules they read from. Your role cannot see any of the underlying data."
            />
          </div>
        ) : (
          groups.map((group) => {
            const reports = available.filter((r) => r.group === group);
            return (
              <section key={group}>
                <div className="mb-3 flex items-baseline justify-between gap-3">
                  <h2 className="text-section">{group}</h2>
                  <span className="text-caption text-muted-foreground">
                    {plural(reports.length, "report")}
                  </span>
                </div>

                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {reports.map((report) => {
                    const size = reportSize(report);
                    return (
                      <Link
                        key={report.slug}
                        href={`/analytics/reports/${report.slug}`}
                        className="group/report flex flex-col rounded-lg border bg-surface p-4 shadow-xs transition-colors hover:border-border-strong hover:bg-surface-hover"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <h3 className="text-card-title min-w-0">{report.name}</h3>
                          <ArrowRight
                            className="mt-0.5 size-3.5 shrink-0 -translate-x-1 text-muted-foreground opacity-0 transition-all group-hover/report:translate-x-0 group-hover/report:opacity-100"
                            aria-hidden
                          />
                        </div>

                        <p className="mt-1.5 text-caption leading-relaxed text-muted-foreground">
                          {report.description}
                        </p>

                        <p className="mt-3 flex-1 border-l-2 border-border pl-2.5 text-caption italic leading-relaxed text-muted-foreground">
                          {report.purpose}
                        </p>

                        <div className="mt-3 flex items-center justify-between gap-2 border-t pt-3">
                          <StatusBadge label={report.group} tone="neutral" showDot={false} />
                          <span className="tabular text-caption text-muted-foreground" data-numeric>
                            {qty(size)} rows
                          </span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </section>
            );
          })
        )}
      </div>
    </>
  );
}
