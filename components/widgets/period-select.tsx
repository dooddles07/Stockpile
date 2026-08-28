"use client";

import { useQueryState } from "nuqs";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const PERIODS = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last quarter" },
  { value: "12m", label: "Last 12 months" },
];

/** Base UI needs a value→label map or Select.Value renders the raw value. */
const PERIOD_LABELS = Object.fromEntries(PERIODS.map((p) => [p.value, p.label]));

/** Comparison window for the dashboard, kept in the URL so a view is shareable. */
export function PeriodSelect() {
  const [period, setPeriod] = useQueryState("period", { defaultValue: "30d", clearOnDefault: true });

  return (
    <Select items={PERIOD_LABELS} value={period} onValueChange={(value) => setPeriod(value)}>
      <SelectTrigger size="sm" className="h-8 w-[10.5rem] text-[13px]" aria-label="Comparison period">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {PERIODS.map((p) => (
          <SelectItem key={p.value} value={p.value}>
            {p.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
