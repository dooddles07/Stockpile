import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { RecordHeader, StatStrip } from "@/components/record/record-header";
import { StatTile } from "@/components/record/field-grid";
import { StatusBadge } from "@/components/status/status-badge";
import { PermissionDenied } from "@/components/states";
import { ReportTable } from "./report-table";
import { REPORTS, reportBySlugSync } from "@/lib/repo/reports";
import { getRole } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { dateTime, qty } from "@/lib/format";
import { NOW } from "@/lib/data/rng";

export async function generateStaticParams() {
  return REPORTS.map((r) => ({ slug: r.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const report = reportBySlugSync(slug);
  return report
    ? { title: report.name, description: report.description }
    : { title: "Report not found" };
}

export default async function ReportPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const role = await getRole();
  const { slug } = await params;
  const report = reportBySlugSync(slug);
  if (!report) notFound();

  if (!can(role, "reports") || !can(role, report.module)) {
    return <PermissionDenied module={report.module} role={role} />;
  }

  const raw = report.run();
  const summary = report.summary?.(raw) ?? [
    { label: "Rows", value: qty(raw.length) },
  ];

  // Format once on the server. The client gets both the display string and the
  // raw value, so the export cannot drift from what is on screen.
  const formatted = raw.map((row) => {
    const out: Record<string, string> = {};
    for (const col of report.columns) {
      const value = row[col.key];
      out[col.key] = col.format
        ? col.format(value)
        : value === null || value === undefined
          ? "—"
          : String(value);
    }
    return out;
  });

  return (
    <>
      <RecordHeader
        crumbs={[
          { label: "Analytics", href: "/analytics/inventory" },
          { label: "Reports", href: "/analytics/reports" },
          { label: report.name },
        ]}
        backHref="/analytics/reports"
        backLabel="Reports"
        title={report.name}
        subtitle={report.description}
        badge={<StatusBadge label={report.group} tone="neutral" size="md" showDot={false} />}
        meta={
          <>
            <span className="text-caption text-muted-foreground">
              Run against live data at {dateTime(NOW.toISOString())}
            </span>
            <span className="text-caption text-muted-foreground">{qty(raw.length)} rows</span>
          </>
        }
      >
        <div className="grid gap-3">
          <p className="max-w-3xl border-l-2 border-border pl-3 text-[13px] italic leading-relaxed text-muted-foreground">
            {report.purpose}
          </p>
          <StatStrip columns={summary.length >= 4 ? 4 : 4}>
            {summary.map((s) => (
              <StatTile key={s.label} label={s.label} value={s.value} />
            ))}
          </StatStrip>
        </div>
      </RecordHeader>

      <div className="p-4 sm:p-6">
        <ReportTable
          name={report.name}
          columns={report.columns.map((c) => ({
            key: c.key,
            header: c.header,
            align: c.align,
          }))}
          rows={formatted}
          raw={raw}
          canExport={can(role, "reports", "export")}
        />
      </div>
    </>
  );
}
