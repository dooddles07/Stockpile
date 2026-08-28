/**
 * Formatting. One place, so a quantity looks the same on the dashboard, in a
 * table cell and in an export.
 */

import { NOW } from "@/lib/data/rng";

const currency0 = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const currency2 = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const int = new Intl.NumberFormat("en-US");

export function money(value: number, opts: { cents?: boolean } = {}): string {
  return opts.cents ? currency2.format(value) : currency0.format(value);
}

/** Compact money for KPI tiles: $1.24M, $84.2K. */
export function moneyCompact(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${value < 0 ? "-" : ""}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${value < 0 ? "-" : ""}$${(abs / 1_000).toFixed(1)}K`;
  return currency0.format(value);
}

export function qty(value: number): string {
  return int.format(value);
}

export function compact(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 10_000) return `${(value / 1_000).toFixed(0)}K`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return int.format(value);
}

export function percent(value: number, dp = 1): string {
  return `${(value * 100).toFixed(dp)}%`;
}

export function signed(value: number): string {
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${int.format(Math.abs(value))}`;
}

export function signedMoney(value: number): string {
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${currency2.format(Math.abs(value))}`;
}

/* -------------------------------------------------------------- dates ---- */

const dateFmt = new Intl.DateTimeFormat("en-US", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

const dateShortFmt = new Intl.DateTimeFormat("en-US", {
  day: "2-digit",
  month: "short",
  timeZone: "UTC",
});

const timeFmt = new Intl.DateTimeFormat("en-US", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "UTC",
});

export function date(iso: string | null | undefined): string {
  if (!iso) return "—";
  return dateFmt.format(new Date(iso));
}

export function dateShort(iso: string | null | undefined): string {
  if (!iso) return "—";
  return dateShortFmt.format(new Date(iso));
}

export function dateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${dateFmt.format(d)} ${timeFmt.format(d)}`;
}

export function time(iso: string | null | undefined): string {
  if (!iso) return "—";
  return timeFmt.format(new Date(iso));
}

/**
 * Relative label against the dataset's fixed "now". Server and client agree
 * because NOW is a constant, not `new Date()`.
 */
export function relative(iso: string | null | undefined): string {
  if (!iso) return "—";
  const diffMs = new Date(iso).getTime() - NOW.getTime();
  const past = diffMs < 0;
  const mins = Math.round(Math.abs(diffMs) / 60_000);

  if (mins < 1) return "just now";
  if (mins < 60) return past ? `${mins}m ago` : `in ${mins}m`;

  const hours = Math.round(mins / 60);
  if (hours < 24) return past ? `${hours}h ago` : `in ${hours}h`;

  const days = Math.round(hours / 24);
  if (days === 1) return past ? "yesterday" : "tomorrow";
  if (days < 30) return past ? `${days}d ago` : `in ${days}d`;

  const months = Math.round(days / 30);
  if (months < 12) return past ? `${months}mo ago` : `in ${months}mo`;

  const years = (days / 365).toFixed(1);
  return past ? `${years}y ago` : `in ${years}y`;
}

/** Whole days from the dataset's now. Negative means the date has passed. */
export function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  return Math.round((new Date(iso).getTime() - NOW.getTime()) / 86_400_000);
}

/** "due in 4d" / "6d overdue" — an operator cares about the gap, not the date. */
export function dueLabel(iso: string | null | undefined): string {
  const days = daysUntil(iso);
  if (days === null) return "no date";
  if (days === 0) return "due today";
  if (days > 0) return days === 1 ? "due tomorrow" : `due in ${days}d`;
  const overdue = Math.abs(days);
  return overdue === 1 ? "1d overdue" : `${overdue}d overdue`;
}

/**
 * How a delivery date reads once you know whether it was met.
 *
 * While something is still in flight, its date is a deadline — "3d overdue".
 * Once it has arrived the deadline no longer exists, and the useful reading is
 * how it went: a closed purchase order saying "157d overdue" is reporting a
 * countdown that stopped months ago.
 */
export function deliveryLabel(
  expectedAt: string | null | undefined,
  settledAt: string | null | undefined,
): string {
  if (!settledAt) return dueLabel(expectedAt);
  if (!expectedAt) return "no date";

  const days = Math.round(
    (new Date(settledAt).getTime() - new Date(expectedAt).getTime()) / 86_400_000,
  );
  if (days > 0) return days === 1 ? "1d late" : `${days}d late`;
  if (days < 0) return days === -1 ? "1d early" : `${Math.abs(days)}d early`;
  return "on the day";
}

/** "1 line" / "4 lines" — pluralisation that reads like a person wrote it. */
export function plural(count: number, singular: string, pluralForm?: string): string {
  return `${int.format(count)} ${count === 1 ? singular : (pluralForm ?? `${singular}s`)}`;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}
