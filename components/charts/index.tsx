"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from "recharts";

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { ChartCard, type ChartSeriesMeta } from "./chart-card";
import { compact, money, moneyCompact, percent, qty } from "@/lib/format";

/**
 * Formatters are named, not passed.
 *
 * These charts are client components rendered from server pages, and a
 * function cannot cross the RSC boundary — so the caller names a formatter and
 * the lookup happens here.
 */
export type FormatKey = "moneyCompact" | "money" | "compact" | "qty" | "percent";

const FORMATTERS: Record<FormatKey, (v: number) => string> = {
  moneyCompact,
  money: (v) => money(v),
  compact,
  qty,
  percent: (v) => percent(v / 100, 1),
};

const AXIS = {
  tickLine: false,
  axisLine: false,
  tick: { fontSize: 11 },
} as const;

const GRID = { strokeDasharray: "3 3", vertical: false, className: "stroke-border" } as const;

type Row = Record<string, string | number>;

/* ------------------------------------------------------------ area trend - */

export function TrendAreaChart({
  title,
  description,
  data,
  dataKey,
  label,
  format = "moneyCompact",
  color = "var(--chart-1)",
  actions,
  className,
}: {
  title: string;
  description?: string;
  data: Row[];
  dataKey: string;
  label: string;
  format?: FormatKey;
  color?: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  const fmt = FORMATTERS[format];
  const config: ChartConfig = { [dataKey]: { label, color } };
  const series: ChartSeriesMeta[] = [{ key: dataKey, label, format: fmt }];

  // Anchor the axis near the data. A value series that only moves 20% looks
  // like a flat line when the axis is forced to start at zero.
  const values = data.map((d) => Number(d[dataKey]));
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const pad = Math.max((hi - lo) * 0.35, hi * 0.04);

  return (
    <ChartCard
      title={title}
      description={description}
      data={data}
      series={series}
      actions={actions}
      className={className}
    >
      <ChartContainer config={config} className="h-56 w-full">
        <AreaChart data={data} margin={{ left: 4, right: 8, top: 6, bottom: 0 }}>
          <defs>
            <linearGradient id={`fill-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.18} />
              <stop offset="100%" stopColor={color} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid {...GRID} />
          <XAxis dataKey="label" {...AXIS} minTickGap={16} />
          <YAxis
            {...AXIS}
            width={56}
            domain={[Math.max(0, lo - pad), hi + pad]}
            tickFormatter={(v) => fmt(Number(v))}
          />
          <ChartTooltip
            content={<ChartTooltipContent formatter={(v) => fmt(Number(v))} indicator="line" />}
          />
          <Area
            isAnimationActive={false}
            dataKey={dataKey}
            type="monotone"
            stroke={color}
            strokeWidth={2}
            fill={`url(#fill-${dataKey})`}
            dot={false}
            activeDot={{ r: 3.5 }}
          />
        </AreaChart>
      </ChartContainer>
    </ChartCard>
  );
}

/* ------------------------------------------------------- two-series line - */

export function ComparisonLineChart({
  title,
  description,
  data,
  seriesA,
  seriesB,
  format = "moneyCompact",
  actions,
  className,
}: {
  title: string;
  description?: string;
  data: Row[];
  seriesA: { key: string; label: string; color?: string };
  seriesB: { key: string; label: string; color?: string };
  format?: FormatKey;
  actions?: React.ReactNode;
  className?: string;
}) {
  const fmt = FORMATTERS[format];
  const colorA = seriesA.color ?? "var(--chart-3)";
  const colorB = seriesB.color ?? "var(--chart-2)";
  const config: ChartConfig = {
    [seriesA.key]: { label: seriesA.label, color: colorA },
    [seriesB.key]: { label: seriesB.label, color: colorB },
  };

  return (
    <ChartCard
      title={title}
      description={description}
      data={data}
      series={[
        { key: seriesA.key, label: seriesA.label, format: fmt },
        { key: seriesB.key, label: seriesB.label, format: fmt },
      ]}
      actions={actions}
      className={className}
    >
      <ChartContainer config={config} className="h-56 w-full">
        <LineChart data={data} margin={{ left: 4, right: 8, top: 6, bottom: 0 }}>
          <CartesianGrid {...GRID} />
          <XAxis dataKey="label" {...AXIS} minTickGap={16} />
          <YAxis {...AXIS} width={52} tickFormatter={(v) => fmt(Number(v))} />
          <ChartTooltip content={<ChartTooltipContent formatter={(v) => fmt(Number(v))} />} />
          <ChartLegend content={<ChartLegendContent />} />
          {/* Dashed second series so the two are separable without colour. */}
          <Line
            isAnimationActive={false}
            dataKey={seriesA.key}
            type="monotone"
            stroke={colorA}
            strokeWidth={2}
            dot={false}
          />
          <Line
            isAnimationActive={false}
            dataKey={seriesB.key}
            type="monotone"
            stroke={colorB}
            strokeWidth={2}
            strokeDasharray="5 3"
            dot={false}
          />
        </LineChart>
      </ChartContainer>
    </ChartCard>
  );
}

/* --------------------------------------------------------- grouped bars -- */

export function GroupedBarChart({
  title,
  description,
  data,
  series,
  format = "compact",
  actions,
  className,
}: {
  title: string;
  description?: string;
  data: Row[];
  series: { key: string; label: string; color: string }[];
  format?: FormatKey;
  actions?: React.ReactNode;
  className?: string;
}) {
  const fmt = FORMATTERS[format];
  const config: ChartConfig = Object.fromEntries(
    series.map((s) => [s.key, { label: s.label, color: s.color }]),
  );

  return (
    <ChartCard
      title={title}
      description={description}
      data={data}
      series={series.map((s) => ({ key: s.key, label: s.label, format: fmt }))}
      actions={actions}
      className={className}
    >
      <ChartContainer config={config} className="h-56 w-full">
        <BarChart data={data} margin={{ left: 4, right: 8, top: 6, bottom: 0 }}>
          <CartesianGrid {...GRID} />
          <XAxis dataKey="label" {...AXIS} minTickGap={16} />
          <YAxis {...AXIS} width={44} tickFormatter={(v) => fmt(Number(v))} />
          <ChartTooltip content={<ChartTooltipContent formatter={(v) => fmt(Number(v))} />} />
          <ChartLegend content={<ChartLegendContent />} />
          {series.map((s) => (
            <Bar
              key={s.key}
              isAnimationActive={false}
              dataKey={s.key}
              fill={s.color}
              radius={[2, 2, 0, 0]}
              maxBarSize={18}
            />
          ))}
        </BarChart>
      </ChartContainer>
    </ChartCard>
  );
}

/* --------------------------------------------------------- stacked bars -- */

export function StackedBarChart({
  title,
  description,
  data,
  series,
  format = "compact",
  actions,
  className,
}: {
  title: string;
  description?: string;
  data: Row[];
  series: { key: string; label: string; color: string }[];
  format?: FormatKey;
  actions?: React.ReactNode;
  className?: string;
}) {
  const fmt = FORMATTERS[format];
  const config: ChartConfig = Object.fromEntries(
    series.map((s) => [s.key, { label: s.label, color: s.color }]),
  );

  return (
    <ChartCard
      title={title}
      description={description}
      data={data}
      series={series.map((s) => ({ key: s.key, label: s.label, format: fmt }))}
      labelHeader="Warehouse"
      actions={actions}
      className={className}
    >
      <ChartContainer config={config} className="h-56 w-full">
        <BarChart data={data} margin={{ left: 4, right: 8, top: 6, bottom: 0 }}>
          <CartesianGrid {...GRID} />
          <XAxis dataKey="label" {...AXIS} />
          <YAxis {...AXIS} width={44} tickFormatter={(v) => fmt(Number(v))} />
          <ChartTooltip content={<ChartTooltipContent formatter={(v) => fmt(Number(v))} />} />
          <ChartLegend content={<ChartLegendContent />} />
          {series.map((s, i) => (
            <Bar
              key={s.key}
              isAnimationActive={false}
              dataKey={s.key}
              stackId="stock"
              fill={s.color}
              radius={i === series.length - 1 ? [2, 2, 0, 0] : 0}
              maxBarSize={38}
            />
          ))}
        </BarChart>
      </ChartContainer>
    </ChartCard>
  );
}

/* ---------------------------------------------------------- ranked bars -- */

/** Horizontal, sorted descending, value labels always on — per chart guidance. */
export function RankedBarChart({
  title,
  description,
  data,
  dataKey,
  label,
  format = "moneyCompact",
  actions,
  className,
  height,
}: {
  title: string;
  description?: string;
  data: Row[];
  dataKey: string;
  label: string;
  format?: FormatKey;
  actions?: React.ReactNode;
  className?: string;
  height?: number;
}) {
  const fmt = FORMATTERS[format];
  const sorted = [...data].sort((a, b) => Number(b[dataKey]) - Number(a[dataKey]));
  const config: ChartConfig = { [dataKey]: { label, color: "var(--chart-1)" } };
  const palette = [
    "var(--chart-1)", "var(--chart-2)", "var(--chart-3)",
    "var(--chart-4)", "var(--chart-5)", "var(--chart-6)",
  ];

  return (
    <ChartCard
      title={title}
      description={description}
      data={sorted}
      series={[{ key: dataKey, label, format: fmt }]}
      labelHeader="Category"
      actions={actions}
      className={className}
    >
      <ChartContainer
        config={config}
        className="w-full"
        style={{ height: height ?? Math.max(180, sorted.length * 27) }}
      >
        <BarChart
          data={sorted}
          layout="vertical"
          margin={{ left: 4, right: 64, top: 2, bottom: 2 }}
        >
          <CartesianGrid strokeDasharray="3 3" horizontal={false} className="stroke-border" />
          <XAxis type="number" {...AXIS} tickFormatter={(v) => fmt(Number(v))} hide />
          <YAxis
            type="category"
            dataKey="label"
            {...AXIS}
            width={132}
            interval={0}
            tick={{ fontSize: 11 }}
          />
          <ChartTooltip content={<ChartTooltipContent formatter={(v) => fmt(Number(v))} />} />
          <Bar isAnimationActive={false} dataKey={dataKey} radius={[0, 2, 2, 0]} maxBarSize={16}>
            {sorted.map((_, i) => (
              <Cell key={i} fill={palette[i % palette.length]} />
            ))}
            <LabelList
              dataKey={dataKey}
              position="right"
              fill="var(--foreground)"
              fontSize={11}
              formatter={(v: unknown) => fmt(Number(v))}
            />
          </Bar>
        </BarChart>
      </ChartContainer>
    </ChartCard>
  );
}
