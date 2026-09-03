import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowRight, CircleCheck, CircleX, SkipForward, Zap } from "lucide-react";

import { RecordHeader, StatStrip } from "@/components/record/record-header";
import { FieldGrid, Section, StatTile } from "@/components/record/field-grid";
import { SimpleTable } from "@/components/record/simple-table";
import { StatusBadge } from "@/components/status/status-badge";
import { MeterBar } from "@/components/status/meter-bar";
import { EmptyState, PermissionDenied } from "@/components/states";
import { RuleEnabledToggle } from "./rule-enabled-toggle";
import { automationRules, automationRuns } from "@/lib/repo/ops";
import { userById } from "@/lib/repo/inventory";
import { getRole } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { dateTime, percent, plural, qty, relative } from "@/lib/format";
import { cn } from "@/lib/utils";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const rule = (await automationRules()).find((r) => r.id === id);
  return rule ? { title: rule.name, description: rule.description } : { title: "Rule not found" };
}

const OUTCOME_ICON = {
  success: CircleCheck,
  failed: CircleX,
  skipped: SkipForward,
} as const;

export default async function AutomationRulePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const role = await getRole();
  if (!can(role, "automation")) return <PermissionDenied module="automation" role={role} />;

  const { id } = await params;
  const rule = (await automationRules()).find((r) => r.id === id);
  if (!rule) notFound();

  const runs = (await automationRuns())
    .filter((r) => r.ruleId === rule.id)
    .sort((a, b) => b.ts.localeCompare(a.ts));

  const failures = runs.filter((r) => r.outcome === "failed");
  const skipped = runs.filter((r) => r.outcome === "skipped");
  const affected = runs.reduce((s, r) => s + r.affected, 0);
  const meanDuration =
    runs.length > 0 ? Math.round(runs.reduce((s, r) => s + r.durationMs, 0) / runs.length) : 0;
  const createdBy = await userById(rule.createdBy);

  return (
    <>
      <RecordHeader
        crumbs={[
          { label: "Administration", href: "/admin/users" },
          { label: "Automation", href: "/admin/automation" },
          { label: rule.name },
        ]}
        backHref="/admin/automation"
        backLabel="Automation"
        leading={
          <span
            className={cn(
              "flex size-9 items-center justify-center rounded-md border",
              rule.enabled
                ? "border-status-success-border bg-status-success-bg text-status-success"
                : "bg-surface-sunken text-muted-foreground",
            )}
            aria-hidden
          >
            <Zap className="size-4" />
          </span>
        }
        title={rule.name}
        subtitle={rule.scope}
        badge={
          <StatusBadge
            label={rule.enabled ? "Enabled" : "Disabled"}
            tone={rule.enabled ? "success" : "neutral"}
            size="md"
          />
        }
        meta={
          <>
            <span className="text-caption text-muted-foreground">
              {qty(rule.runCount)} total runs
            </span>
            <span className="text-caption text-muted-foreground">
              Last run {rule.lastRunAt ? relative(rule.lastRunAt) : "never"}
            </span>
          </>
        }
        actions={
          can(role, "automation", "manage") && (
            <RuleEnabledToggle ruleId={rule.id} enabled={rule.enabled} />
          )
        }
      >
        <StatStrip columns={5}>
          <StatTile
            label="Success rate"
            value={percent(rule.successRate, 1)}
            tone={
              rule.successRate >= 0.98 ? "success" : rule.successRate >= 0.9 ? "warning" : "danger"
            }
          />
          <StatTile label="Total runs" value={qty(rule.runCount)} />
          <StatTile
            label="Recent failures"
            value={qty(failures.length)}
            tone={failures.length > 0 ? "danger" : "success"}
            hint={`of ${qty(runs.length)} shown`}
          />
          <StatTile label="Records touched" value={qty(affected)} hint="In the shown runs" />
          <StatTile label="Mean duration" value={`${qty(meanDuration)}ms`} />
        </StatStrip>
      </RecordHeader>

      <div className="grid gap-4 p-4 sm:p-6 lg:grid-cols-3">
        <div className="grid content-start gap-4 lg:col-span-2">
          <Section
            title="What this rule does"
            description="Trigger, conditions and actions, in the order they are evaluated."
          >
            <ol className="grid gap-4">
              <li className="grid gap-2">
                <div className="flex items-center gap-2">
                  <StatusBadge label="When" tone="info" showDot={false} />
                  <span className="text-caption text-muted-foreground">the trigger fires</span>
                </div>
                <p className="rounded-md border bg-surface-sunken px-3 py-2.5 text-[13px] leading-relaxed">
                  {rule.trigger}
                </p>
              </li>

              {rule.conditions.length > 0 && (
                <li className="grid gap-2">
                  <div className="flex items-center gap-2">
                    <StatusBadge label="And" tone="warning" showDot={false} />
                    <span className="text-caption text-muted-foreground">
                      {plural(rule.conditions.length, "condition")} all hold
                    </span>
                  </div>
                  <ul className="grid gap-1.5">
                    {rule.conditions.map((condition) => (
                      <li
                        key={condition}
                        className="flex items-start gap-2 rounded-md border bg-surface-sunken px-3 py-2 text-[13px] leading-relaxed"
                      >
                        <CircleCheck className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                        {condition}
                      </li>
                    ))}
                  </ul>
                </li>
              )}

              <li className="grid gap-2">
                <div className="flex items-center gap-2">
                  <StatusBadge label="Then" tone="success" showDot={false} />
                  <span className="text-caption text-muted-foreground">
                    {plural(rule.actions.length, "action")} run
                  </span>
                </div>
                <ul className="grid gap-1.5">
                  {rule.actions.map((action) => (
                    <li
                      key={action}
                      className="flex items-start gap-2 rounded-md border border-status-success-border bg-status-success-bg px-3 py-2 text-[13px] leading-relaxed text-status-success"
                    >
                      <ArrowRight className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                      {action}
                    </li>
                  ))}
                </ul>
              </li>
            </ol>
          </Section>

          <Section
            title="Run history"
            description="The last runs, newest first. A skipped run means the conditions did not match anything — that is normal, not a failure."
            contentClassName="p-0"
          >
            <SimpleTable
              rows={runs}
              getRowId={(r) => r.id}
              columns={[
                {
                  key: "ts",
                  header: "When",
                  cell: (r) => (
                    <span className="text-code whitespace-nowrap text-muted-foreground">
                      {dateTime(r.ts)}
                    </span>
                  ),
                },
                {
                  key: "outcome",
                  header: "Outcome",
                  cell: (r) => {
                    const Icon = OUTCOME_ICON[r.outcome];
                    return (
                      <span className="flex items-center gap-1.5">
                        <Icon
                          className={cn(
                            "size-3.5",
                            r.outcome === "success" && "text-status-success",
                            r.outcome === "failed" && "text-status-danger",
                            r.outcome === "skipped" && "text-muted-foreground",
                          )}
                          aria-hidden
                        />
                        <StatusBadge status={r.outcome} />
                      </span>
                    );
                  },
                },
                {
                  key: "affected",
                  header: "Records",
                  align: "right",
                  cell: (r) =>
                    r.affected > 0 ? (
                      qty(r.affected)
                    ) : (
                      <span className="text-muted-foreground">none</span>
                    ),
                },
                {
                  key: "duration",
                  header: "Duration",
                  align: "right",
                  cell: (r) => (
                    <span className={r.durationMs > 5000 ? "text-status-warning" : "text-muted-foreground"}>
                      {qty(r.durationMs)}ms
                    </span>
                  ),
                },
                {
                  key: "message",
                  header: "Message",
                  cell: (r) => (
                    <span
                      className={cn(
                        "truncate",
                        r.outcome === "failed" ? "text-status-danger" : "text-muted-foreground",
                      )}
                    >
                      {r.message}
                    </span>
                  ),
                },
              ]}
              empty={
                <EmptyState
                  title="No runs recorded"
                  description="This rule has not fired yet. It runs when its trigger condition next occurs."
                  className="py-10"
                />
              }
            />
          </Section>
        </div>

        <div className="grid content-start gap-4">
          <Section title="Details">
            <FieldGrid
              columns={2}
              fields={[
                { label: "Status", value: rule.enabled ? "Enabled" : "Disabled" },
                { label: "Scope", value: rule.scope },
                { label: "Created by", value: createdBy?.name ?? "—" },
                { label: "Total runs", value: qty(rule.runCount) },
                {
                  label: "Last run",
                  value: rule.lastRunAt ? dateTime(rule.lastRunAt) : "Never",
                  span: 2,
                },
              ]}
            />
          </Section>

          <Section title="Reliability" description="How this rule has behaved recently.">
            <div className="grid gap-4">
              <div>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-caption text-muted-foreground">Success rate</span>
                  <span className="tabular text-[15px] font-bold" data-numeric>
                    {percent(rule.successRate, 1)}
                  </span>
                </div>
                <MeterBar
                  value={rule.successRate}
                  tone={
                    rule.successRate >= 0.98
                      ? "success"
                      : rule.successRate >= 0.9
                        ? "warning"
                        : "danger"
                  }
                  className="mt-2"
                  label={`${rule.name} succeeds ${percent(rule.successRate, 1)} of the time`}
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <StatTile
                  label="Succeeded"
                  value={qty(runs.length - failures.length - skipped.length)}
                  tone="success"
                />
                <StatTile label="Skipped" value={qty(skipped.length)} />
                <StatTile
                  label="Failed"
                  value={qty(failures.length)}
                  tone={failures.length > 0 ? "danger" : "neutral"}
                />
              </div>

              {failures.length > 0 && (
                <div className="rounded-md border border-status-danger-border bg-status-danger-bg p-3">
                  <p className="text-[13px] font-medium text-status-danger">
                    {plural(failures.length, "recent failure")}
                  </p>
                  <p className="mt-1 text-caption leading-relaxed text-status-danger/90">
                    A failed run does nothing — no partial writes. The trigger will fire again on
                    the next matching event, so a transient failure self-corrects; a persistent one
                    means the rule is silently doing nothing.
                  </p>
                </div>
              )}
            </div>
          </Section>
        </div>
      </div>
    </>
  );
}
