import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, Workflow, Zap } from "lucide-react";

import { PageHeader } from "@/components/shell/page-header";
import { EmptyState, PermissionDenied } from "@/components/states";
import { StatTile } from "@/components/record/field-grid";
import { StatusBadge } from "@/components/status/status-badge";
import { MeterBar } from "@/components/status/meter-bar";
import { automationRules as allRules, automationRuns as allRuns } from "@/lib/repo/ops";
import { getRole } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { percent, plural, qty, relative } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Automation",
  description: "Rules that run without anyone remembering to run them.",
};

export default async function AutomationPage() {
  const role = await getRole();
  if (!can(role, "automation")) return <PermissionDenied module="automation" role={role} />;

  const rules = await allRules();
  const enabled = rules.filter((r) => r.enabled);
  const runs = await allRuns();
  const failures = runs.filter((r) => r.outcome === "failed");
  const affected = runs.reduce((s, r) => s + r.affected, 0);

  const runsByRule = new Map<string, typeof runs>();
  for (const run of runs) {
    const list = runsByRule.get(run.ruleId) ?? [];
    list.push(run);
    runsByRule.set(run.ruleId, list);
  }

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Administration", href: "/admin/users" }, { label: "Automation" }]}
        title="Automation"
        description="Every rule is a trigger, a set of conditions and a set of actions. They run whether or not anyone is watching, which is the point — and why the run history matters as much as the rule."
      >
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatTile
            label="Rules"
            value={qty(rules.length)}
            hint={`${qty(enabled.length)} enabled`}
          />
          <StatTile
            label="Runs (14 days)"
            value={qty(runs.length)}
            hint={`${qty(affected)} records touched`}
          />
          <StatTile
            label="Failures"
            value={qty(failures.length)}
            tone={failures.length > 0 ? "danger" : "success"}
            hint={
              runs.length > 0
                ? `${percent(1 - failures.length / runs.length, 1)} success rate`
                : undefined
            }
          />
          <StatTile
            label="Disabled"
            value={qty(rules.length - enabled.length)}
            tone={rules.length - enabled.length > 0 ? "warning" : "neutral"}
            hint="Not running at all"
          />
        </div>
      </PageHeader>

      <div className="grid gap-3 p-4 sm:p-6 lg:grid-cols-2">
        {rules.length === 0 ? (
          <div className="rounded-lg border bg-surface lg:col-span-2">
            <EmptyState
              icon={Workflow}
              title="No automation rules"
              description="Rules turn recurring judgement into something that happens on its own — reordering below a threshold, escalating a high-value write-off, chasing an overdue delivery."
            />
          </div>
        ) : (
          rules.map((rule) => {
            const ruleRuns = runsByRule.get(rule.id) ?? [];
            const ruleFailures = ruleRuns.filter((r) => r.outcome === "failed");

            return (
              <Link
                key={rule.id}
                href={`/admin/automation/${rule.id}`}
                className={cn(
                  "group/rule flex flex-col rounded-lg border bg-surface p-4 shadow-xs transition-colors hover:border-border-strong hover:bg-surface-hover",
                  !rule.enabled && "opacity-70",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-2.5">
                    <span
                      className={cn(
                        "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md border",
                        rule.enabled
                          ? "border-status-success-border bg-status-success-bg text-status-success"
                          : "bg-surface-sunken text-muted-foreground",
                      )}
                      aria-hidden
                    >
                      <Zap className="size-3.5" />
                    </span>
                    <div className="min-w-0">
                      <h2 className="text-card-title truncate">{rule.name}</h2>
                      <p className="mt-0.5 text-caption text-muted-foreground">{rule.scope}</p>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <StatusBadge
                      label={rule.enabled ? "Enabled" : "Disabled"}
                      tone={rule.enabled ? "success" : "neutral"}
                    />
                    <ArrowRight
                      className="size-3.5 -translate-x-1 text-muted-foreground opacity-0 transition-all group-hover/rule:translate-x-0 group-hover/rule:opacity-100"
                      aria-hidden
                    />
                  </div>
                </div>

                <dl className="mt-3 grid gap-2 border-t pt-3 text-caption">
                  <div className="flex gap-2">
                    <dt className="w-16 shrink-0 text-muted-foreground">When</dt>
                    <dd className="min-w-0 flex-1 leading-relaxed">{rule.trigger}</dd>
                  </div>
                  {rule.conditions.length > 0 && (
                    <div className="flex gap-2">
                      <dt className="w-16 shrink-0 text-muted-foreground">And</dt>
                      <dd className="min-w-0 flex-1 leading-relaxed">
                        {rule.conditions.join(" · ")}
                      </dd>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <dt className="w-16 shrink-0 text-muted-foreground">Then</dt>
                    <dd className="min-w-0 flex-1 leading-relaxed">{rule.actions.join(" · ")}</dd>
                  </div>
                </dl>

                <div className="mt-3 grid gap-2 border-t pt-3">
                  <div className="flex items-baseline justify-between gap-2 text-caption">
                    <span className="text-muted-foreground">Success rate</span>
                    <span
                      className={cn(
                        "tabular font-medium",
                        rule.successRate >= 0.98
                          ? "text-status-success"
                          : rule.successRate >= 0.9
                            ? "text-status-warning"
                            : "text-status-danger",
                      )}
                      data-numeric
                    >
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
                    size="sm"
                    label={`${rule.name} succeeds ${percent(rule.successRate, 1)} of the time`}
                  />
                  <div className="flex flex-wrap items-center justify-between gap-2 text-caption text-muted-foreground">
                    <span>
                      {qty(rule.runCount)} runs · last {rule.lastRunAt ? relative(rule.lastRunAt) : "never"}
                    </span>
                    {ruleFailures.length > 0 && (
                      <StatusBadge
                        label={`${plural(ruleFailures.length, "failure")} recently`}
                        tone="danger"
                      />
                    )}
                  </div>
                </div>
              </Link>
            );
          })
        )}
      </div>
    </>
  );
}
