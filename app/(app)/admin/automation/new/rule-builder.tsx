"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Plus, Save, Trash2, Zap } from "lucide-react";
import { toast } from "sonner";

import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Section } from "@/components/record/field-grid";
import { plural } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Triggers are the fixed set the engine actually listens for. Each carries the
 * conditions and actions that make sense against it — offering "Email the
 * purchase order to the supplier" on a stock-count trigger would be a rule that
 * silently never fires.
 */
const TRIGGERS = {
  "below-reorder": {
    label: "Available quantity falls below reorder point",
    hint: "Evaluated whenever stock moves, on every SKU in scope.",
    conditions: [
      "Product status is Active",
      "Product has a primary supplier",
      "No open PO covering the shortfall",
      "Warehouse is any",
    ],
    actions: [
      "Notify the site inventory manager",
      "Add to the reorder task queue",
      "Create a draft purchase order line",
      "Group by supplier",
    ],
  },
  "lot-expiring": {
    label: "Lot expiry date is within 30 days",
    hint: "Checked nightly against every tracked lot.",
    conditions: ["On-hand quantity is greater than 0", "Product is perishable"],
    actions: [
      "Notify the warehouse manager",
      "Flag the lot for quarantine review",
      "Add to the expiring stock report",
    ],
  },
  "adjustment-submitted": {
    label: "Stock adjustment is submitted",
    hint: "Fires before the adjustment is posted, so it can be routed for approval.",
    conditions: [
      "Absolute value impact is over $500",
      "Reason is Damage or Theft",
      "Submitted by a warehouse operator",
    ],
    actions: [
      "Route to the inventory manager for approval",
      "Post to the audit log",
      "Notify the site manager",
    ],
  },
  "count-review": {
    label: "Stock count moves to Review",
    hint: "Fires once counting finishes and variances are known.",
    conditions: ["Accuracy is below 97%", "Variance value is over $1,000"],
    actions: [
      "Notify the site manager",
      "Require a recount of variance lines",
      "Post to the audit log",
    ],
  },
  "po-approved": {
    label: "Purchase order is approved",
    hint: "Fires on the approval, before the order is sent.",
    conditions: ["Supplier has an email contact", "Order value is over $5,000"],
    actions: [
      "Email the purchase order to the supplier",
      "Set status to Ordered",
      "Notify the purchasing manager",
    ],
  },
  "delivery-overdue": {
    label: "Expected delivery date passes",
    hint: "Checked each morning against open purchase orders.",
    conditions: ["Purchase order is not fully received", "Supplier is not on hold"],
    actions: [
      "Notify the purchasing manager",
      "Mark the order overdue",
      "Add to the supplier scorecard",
    ],
  },
  "so-unreservable": {
    label: "Sales order cannot be fully reserved",
    hint: "Fires at reservation, before anything reaches a pick list.",
    conditions: ["Customer is not on credit hold", "Order channel is any"],
    actions: [
      "Set the order to Backorder",
      "Notify the sales manager",
      "Create a draft purchase order line",
    ],
  },
  schedule: {
    label: "On a schedule",
    hint: "Runs at a fixed time regardless of what happens in the warehouse.",
    conditions: [],
    actions: [
      "Generate the inventory valuation report",
      "Generate the dead stock report",
      "Email it to Finance",
      "Notify the inventory manager",
    ],
  },
} as const;

type TriggerKey = keyof typeof TRIGGERS;

const TRIGGER_LABELS = Object.fromEntries(
  Object.entries(TRIGGERS).map(([k, v]) => [k, v.label]),
) as Record<TriggerKey, string>;

const SCHEDULES = {
  "Every Monday at 07:00": "Every Monday at 07:00",
  "Every weekday at 06:00": "Every weekday at 06:00",
  "First of the month at 08:00": "First of the month at 08:00",
  "Nightly at 23:00": "Nightly at 23:00",
};

export interface RuleDraft {
  name: string;
  trigger: string;
  scope: string;
  conditions: string[];
  actions: string[];
  notes: string;
  enabled: boolean;
}

/** The stored rule keeps the trigger's label; the builder works in its key. */
const triggerKeyFor = (label: string): TriggerKey =>
  (Object.entries(TRIGGERS).find(([, t]) => t.label === label)?.[0] as TriggerKey) ?? "schedule";

export function RuleBuilder({
  scopes,
  initial,
  returnTo = "/admin/automation",
}: {
  scopes: string[];
  /** Present when editing an existing rule. */
  initial?: RuleDraft;
  returnTo?: string;
}) {
  const router = useRouter();
  const editing = initial !== undefined;
  const scopeLabels = React.useMemo(
    () => Object.fromEntries(scopes.map((s) => [s, s])),
    [scopes],
  );

  const [name, setName] = React.useState(initial?.name ?? "");
  const [trigger, setTrigger] = React.useState<TriggerKey>(
    initial ? triggerKeyFor(initial.trigger) : "below-reorder",
  );
  const [schedule, setSchedule] = React.useState(
    initial && triggerKeyFor(initial.trigger) === "schedule" && initial.trigger in SCHEDULES
      ? initial.trigger
      : "Every Monday at 07:00",
  );
  const [scope, setScope] = React.useState(initial?.scope ?? scopes[0]);
  const [conditions, setConditions] = React.useState<string[]>(initial?.conditions ?? []);
  const [actions, setActions] = React.useState<string[]>(initial?.actions ?? []);
  const [custom, setCustom] = React.useState("");
  const [notes, setNotes] = React.useState(initial?.notes ?? "");
  const [enabled, setEnabled] = React.useState(initial?.enabled ?? true);
  const [submitted, setSubmitted] = React.useState(false);

  const definition = TRIGGERS[trigger];

  // Changing the trigger changes what can be asked and done, so anything
  // carried over would be a condition the engine cannot evaluate.
  const changeTrigger = (next: TriggerKey) => {
    setTrigger(next);
    setConditions([]);
    setActions([]);
  };

  // Functional update, not a splice of the captured array: two toggles inside
  // one React batch would otherwise both read the pre-batch list and the second
  // would silently discard the first.
  const toggle = (
    value: string,
    setList: React.Dispatch<React.SetStateAction<string[]>>,
  ) =>
    setList((list) =>
      list.includes(value) ? list.filter((v) => v !== value) : [...list, value],
    );

  const nameError = submitted && name.trim().length < 3;
  const actionError = submitted && actions.length === 0;

  const triggerText = trigger === "schedule" ? schedule : definition.label;

  const save = () => {
    setSubmitted(true);
    if (name.trim().length < 3 || actions.length === 0) {
      toast.error("The rule is not ready", {
        description:
          actions.length === 0
            ? "A rule that does nothing when it fires would run forever with no effect. Pick at least one action."
            : "Give the rule a name people will recognise in the run log.",
      });
      return;
    }

    toast.success(`${name.trim()} ${editing ? "updated" : "created"}`, {
      description: enabled
        ? `Live now. ${triggerText}, ${plural(conditions.length, "condition")}, ${plural(
            actions.length,
            "action",
          )}.`
        : "Saved disabled. Enable it when you are ready for it to fire.",
    });
    router.push(returnTo);
  };

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="grid content-start gap-4 lg:col-span-2">
        <Section title="Rule" description="What this rule is called in the run log and audit trail.">
          <div className="grid gap-5">
            <Field>
              <FieldLabel htmlFor="rule-name">Name</FieldLabel>
              <Input
                id="rule-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Escalate high-value adjustments"
                aria-invalid={nameError}
              />
              <FieldError
                errors={nameError ? [{ message: "Give the rule a recognisable name." }] : []}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="rule-scope">Scope</FieldLabel>
              <Select items={scopeLabels} value={scope} onValueChange={(v) => setScope(v as string)}>
                <SelectTrigger id="rule-scope" className="sm:max-w-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {scopes.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldDescription>Records outside the scope are never evaluated.</FieldDescription>
            </Field>
          </div>
        </Section>

        <Section
          title="When"
          description="The event the engine listens for. One trigger per rule — chain rules rather than combining triggers."
        >
          <div className="grid gap-5">
            <Field>
              <FieldLabel htmlFor="rule-trigger">Trigger</FieldLabel>
              <Select
                items={TRIGGER_LABELS}
                value={trigger}
                onValueChange={(v) => changeTrigger(v as TriggerKey)}
              >
                <SelectTrigger id="rule-trigger">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(TRIGGERS).map(([key, t]) => (
                    <SelectItem key={key} value={key}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldDescription>{definition.hint}</FieldDescription>
            </Field>

            {trigger === "schedule" && (
              <Field>
                <FieldLabel htmlFor="rule-schedule">Runs</FieldLabel>
                <Select
                  items={SCHEDULES}
                  value={schedule}
                  onValueChange={(v) => setSchedule(v as string)}
                >
                  <SelectTrigger id="rule-schedule" className="sm:max-w-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.keys(SCHEDULES).map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            )}
          </div>
        </Section>

        <Section
          title="Only if"
          description="Every condition must hold or the run is skipped. Leave them all off to act on every event."
        >
          {definition.conditions.length === 0 ? (
            <p className="text-caption text-muted-foreground">
              A scheduled rule has nothing to test — it simply runs. Narrow it with the scope above.
            </p>
          ) : (
            <div className="grid gap-2">
              {definition.conditions.map((condition) => (
                <ToggleRow
                  key={condition}
                  label={condition}
                  checked={conditions.includes(condition)}
                  onToggle={() => toggle(condition, setConditions)}
                />
              ))}
            </div>
          )}
        </Section>

        <Section
          title="Then"
          description="What the rule does when it fires. At least one is required."
        >
          <div className="grid gap-2">
            {definition.actions.map((action) => (
              <ToggleRow
                key={action}
                label={action}
                checked={actions.includes(action)}
                onToggle={() => toggle(action, setActions)}
              />
            ))}

            {actions
              .filter((a) => !(definition.actions as readonly string[]).includes(a))
              .map((a) => (
                <div
                  key={a}
                  className="flex items-center justify-between gap-2 rounded border border-dashed bg-surface px-2.5 py-2 text-[13px]"
                >
                  <span className="min-w-0 truncate">{a}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    aria-label={`Remove action ${a}`}
                    onClick={() => setActions((list) => list.filter((x) => x !== a))}
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                  </Button>
                </div>
              ))}
          </div>

          <div className="mt-3 flex flex-wrap items-end gap-2">
            <Field className="min-w-[15rem] flex-1">
              <FieldLabel htmlFor="rule-custom">Custom action</FieldLabel>
              <Input
                id="rule-custom"
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                placeholder="e.g. Post a message to the #inventory channel"
              />
            </Field>
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              disabled={custom.trim().length < 4}
              onClick={() => {
                const next = custom.trim();
                setActions((list) => (list.includes(next) ? list : [...list, next]));
                setCustom("");
              }}
            >
              <Plus className="size-3.5" aria-hidden />
              Add
            </Button>
          </div>

          <FieldError
            errors={actionError ? [{ message: "Pick at least one action." }] : []}
          />
        </Section>

        <Section title="Notes" description="Why this rule exists. The next person will want to know.">
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="e.g. Added after the Q2 stocktake found $4,100 of unapproved write-offs at DC-01."
          />
        </Section>

        <div className="flex flex-wrap gap-2">
          <Button size="sm" className="h-8" onClick={save}>
            <Save className="size-3.5" aria-hidden />
            {editing ? "Save changes" : "Create rule"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            onClick={() => router.push(returnTo)}
          >
            Cancel
          </Button>
        </div>
      </div>

      <aside className="grid content-start gap-4">
        <Section title="Preview" description="Read it back before you turn it on.">
          <div className="grid gap-3 text-[13px]">
            <Step tone="info" label="When" text={triggerText} />
            <Step
              tone="warning"
              label="Only if"
              text={
                conditions.length > 0
                  ? conditions.join(" · and · ")
                  : "no conditions — every event acts"
              }
            />
            <Step
              tone="success"
              label="Then"
              text={actions.length > 0 ? actions.join(" · then · ") : "nothing yet"}
            />
          </div>

          <div className="mt-4 border-t pt-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[13px] font-medium">Enabled on save</p>
                <p className="text-caption text-muted-foreground">
                  {enabled
                    ? "The rule starts firing as soon as it is created."
                    : "Saved but dormant until someone turns it on."}
                </p>
              </div>
              <Switch
                checked={enabled}
                onCheckedChange={setEnabled}
                aria-label="Enable this rule on save"
              />
            </div>
          </div>

          <p className="mt-3 flex items-start gap-1.5 text-caption text-muted-foreground">
            <Zap className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            Scoped to {scope}. Runs are recorded whether they act or skip, so a rule that never
            fires is visible in the log rather than silently missing.
          </p>
        </Section>
      </aside>
    </div>
  );
}

function ToggleRow({
  label,
  checked,
  onToggle,
}: {
  label: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={checked}
      className={cn(
        "flex items-center justify-between gap-3 rounded border px-2.5 py-2 text-left text-[13px] transition-colors",
        checked
          ? "border-status-info-border bg-status-info-bg text-status-info"
          : "bg-surface hover:bg-surface-sunken",
      )}
    >
      <span className="min-w-0">{label}</span>
      <span
        className={cn(
          "shrink-0 text-[11px] font-medium uppercase tracking-wide",
          checked ? "text-status-info" : "text-muted-foreground",
        )}
      >
        {checked ? "on" : "off"}
      </span>
    </button>
  );
}

function Step({
  tone,
  label,
  text,
}: {
  tone: "info" | "warning" | "success";
  label: string;
  text: string;
}) {
  return (
    <div className="grid gap-1">
      <span className="flex items-center gap-1.5 text-overline text-muted-foreground">
        <ArrowRight
          className={cn(
            "size-3",
            tone === "info" && "text-status-info",
            tone === "warning" && "text-status-warning",
            tone === "success" && "text-status-success",
          )}
          aria-hidden
        />
        {label}
      </span>
      <p className="leading-snug">{text}</p>
    </div>
  );
}
