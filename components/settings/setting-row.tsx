"use client";

import * as React from "react";
import { toast } from "sonner";

import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

/**
 * One configurable setting.
 *
 * The `impact` line is the point: a setting whose consequence is not spelled
 * out gets changed by someone who did not know what it did. Read-only roles
 * see the value but cannot alter it.
 */
export function SettingRow({
  label,
  description,
  impact,
  readOnly,
  children,
  className,
}: {
  label: string;
  description?: string;
  impact?: string;
  readOnly?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-start justify-between gap-4 border-b px-4 py-3.5 last:border-b-0",
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium">{label}</p>
        {description && (
          <p className="mt-0.5 text-caption leading-relaxed text-muted-foreground">{description}</p>
        )}
        {impact && (
          <p className="mt-1.5 border-l-2 border-border pl-2.5 text-caption italic leading-relaxed text-muted-foreground">
            {impact}
          </p>
        )}
      </div>
      <div className={cn("shrink-0", readOnly && "pointer-events-none opacity-60")}>{children}</div>
    </div>
  );
}

export function SettingToggle({
  id,
  defaultChecked,
  label,
  readOnly,
}: {
  id: string;
  defaultChecked: boolean;
  label: string;
  readOnly?: boolean;
}) {
  const [checked, setChecked] = React.useState(defaultChecked);

  return (
    <Switch
      id={id}
      checked={checked}
      aria-label={label}
      disabled={readOnly}
      onCheckedChange={(value) => {
        setChecked(Boolean(value));
        toast.success(`${label} ${value ? "enabled" : "disabled"}`, {
          description: "The change is recorded in the audit log.",
        });
      }}
    />
  );
}

export function SettingNumber({
  id,
  defaultValue,
  label,
  suffix,
  min = 0,
  max,
  step = 1,
  readOnly,
}: {
  id: string;
  defaultValue: number;
  label: string;
  suffix?: string;
  min?: number;
  max?: number;
  step?: number;
  readOnly?: boolean;
}) {
  const [value, setValue] = React.useState(defaultValue);

  return (
    <div className="flex items-center gap-2">
      <Input
        id={id}
        type="number"
        min={min}
        max={max}
        step={step}
        inputMode="decimal"
        value={value}
        disabled={readOnly}
        aria-label={label}
        onChange={(e) => setValue(Number(e.target.value) || 0)}
        className="h-8 w-28 text-right tabular"
      />
      {suffix && <span className="text-caption text-muted-foreground">{suffix}</span>}
    </div>
  );
}

export function SettingSelect({
  id,
  options,
  defaultValue,
  label,
  width = "14rem",
  readOnly,
}: {
  id: string;
  options: Record<string, string>;
  defaultValue: string;
  label: string;
  width?: string;
  readOnly?: boolean;
}) {
  const [value, setValue] = React.useState(defaultValue);

  return (
    <Select
      items={options}
      value={value}
      onValueChange={(v) => {
        const next = v ?? defaultValue;
        setValue(next);
        toast.success(`${label} set to ${options[next]}`, {
          description: "The change is recorded in the audit log.",
        });
      }}
      disabled={readOnly}
    >
      <SelectTrigger id={id} size="sm" className="h-8 text-[13px]" style={{ width }} aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {Object.entries(options).map(([key, text]) => (
          <SelectItem key={key} value={key}>
            {text}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function SettingText({
  id,
  defaultValue,
  label,
  placeholder,
  width = "20rem",
  mono,
  readOnly,
}: {
  id: string;
  defaultValue: string;
  label: string;
  placeholder?: string;
  width?: string;
  mono?: boolean;
  readOnly?: boolean;
}) {
  const [value, setValue] = React.useState(defaultValue);

  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id} className="sr-only">
        {label}
      </Label>
      <Input
        id={id}
        value={value}
        placeholder={placeholder}
        disabled={readOnly}
        onChange={(e) => setValue(e.target.value)}
        className={cn("h-8 text-[13px]", mono && "text-code")}
        style={{ width }}
      />
    </div>
  );
}
