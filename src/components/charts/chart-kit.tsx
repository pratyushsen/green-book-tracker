"use client";

import * as React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts";
import { cn } from "@/lib/utils";
import { minutesLabel } from "@/lib/dates";

/** Categorical slots in fixed order (validated for CVD separation in both themes). */
export const SERIES = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

export type ValueFormat = "minutes" | "number" | "percent" | "hours";

export function formatValue(v: number, f: ValueFormat = "number") {
  if (f === "minutes") return minutesLabel(v);
  if (f === "hours") return `${Math.round((v / 60) * 10) / 10}h`;
  if (f === "percent") return `${Math.round(v)}%`;
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

export function ChartTooltip({
  active,
  payload,
  label,
  format = "number",
  labelFmt,
}: Partial<TooltipContentProps<number, string>> & { format?: ValueFormat; labelFmt?: (l: string) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="min-w-32 rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-xl">
      {label !== undefined && <div className="mb-1 font-medium text-foreground">{labelFmt ? labelFmt(String(label)) : String(label)}</div>}
      <div className="space-y-0.5">
        {payload.map((p) => (
          <div key={String(p.dataKey ?? p.name)} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span className="size-2 rounded-[2px]" style={{ background: (p.payload?.fill as string) ?? p.color }} />
              {p.name}
            </span>
            <span className="tabular font-medium text-foreground">{formatValue(Number(p.value), format)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ChartFrame({ height = 240, className, children, label }: { height?: number; className?: string; children: React.ReactElement; label: string }) {
  return (
    <div className={cn("w-full", className)} style={{ height }} role="img" aria-label={label}>
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </div>
  );
}

/** Clean tick steps for minute values (15m, 30m, 1h, 2h …) so the axis never shows 2.3h. */
export function minuteTicks(max: number): number[] {
  const steps = [15, 30, 60, 90, 120, 180, 240, 360, 480, 600, 900, 1200, 1800, 2400, 3600, 4800, 6000];
  const m = Math.max(max, 1);
  const step = steps.find((s) => m / s <= 4) ?? Math.ceil(m / 4 / 60) * 60;
  const top = Math.ceil(m / step) * step;
  return Array.from({ length: top / step + 1 }, (_, i) => i * step);
}

export function minuteTick(v: number): string {
  if (v < 60) return `${v}m`;
  const h = Math.round((v / 60) * 10) / 10;
  return `${h}h`;
}

export const axisProps = {
  tickLine: false,
  axisLine: false,
  tickMargin: 8,
} as const;

/** Single-series bar chart with an optional dashed target line. */
export function SimpleBars({
  data,
  xKey,
  yKey,
  name,
  format = "minutes",
  target,
  height = 220,
  xFormatter,
  tooltipLabel,
  highlightKey,
}: {
  data: Record<string, unknown>[];
  xKey: string;
  yKey: string;
  name: string;
  format?: ValueFormat;
  target?: number;
  height?: number;
  xFormatter?: (v: string) => string;
  tooltipLabel?: (v: string) => string;
  highlightKey?: string;
}) {
  const dataMax = Math.max(0, ...data.map((d) => Number(d[yKey]) || 0), target ?? 0);
  const ticks = format === "minutes" ? minuteTicks(dataMax * 1.05) : undefined;
  const domain: [number, number] | undefined = ticks ? [0, ticks[ticks.length - 1]] : format === "percent" ? [0, 100] : undefined;
  return (
    <ChartFrame height={height} label={name}>
      <BarChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }} barCategoryGap="24%">
        <CartesianGrid vertical={false} strokeDasharray="0" />
        <XAxis dataKey={xKey} {...axisProps} tickFormatter={xFormatter} interval="preserveStartEnd" minTickGap={8} />
        <YAxis {...axisProps} width={48} ticks={ticks} domain={domain} allowDecimals={false} tickFormatter={(v: number) => (format === "minutes" ? minuteTick(v) : formatValue(v, format))} />
        <Tooltip content={<ChartTooltip format={format} labelFmt={tooltipLabel} />} cursor={{ radius: 4 }} />
        {target !== undefined && target > 0 && (
          <ReferenceLine y={target} stroke="var(--muted-foreground)" strokeDasharray="4 4" strokeOpacity={0.7} label={{ value: "Target", position: "insideTopRight", fontSize: 10, fill: "var(--muted-foreground)" }} />
        )}
        <Bar dataKey={yKey} name={name} radius={[4, 4, 0, 0]} maxBarSize={36}>
          {data.map((d, i) => (
            <Cell key={i} fill={highlightKey && d[xKey] === highlightKey ? "var(--primary)" : "color-mix(in oklab, var(--primary) 62%, var(--card))"} />
          ))}
        </Bar>
      </BarChart>
    </ChartFrame>
  );
}

/** Donut with a value legend (legend carries identity + values, so color is never alone). */
export function Donut({
  data,
  format = "minutes",
  height = 200,
  centerLabel,
  centerValue,
}: {
  data: { name: string; value: number }[];
  format?: ValueFormat;
  height?: number;
  centerLabel?: string;
  centerValue?: string;
}) {
  const total = data.reduce((a, d) => a + d.value, 0);
  // fold beyond 5 into Other — never generate extra hues
  const shown = data.length > 5 ? [...data.slice(0, 4), { name: "Other", value: data.slice(4).reduce((a, d) => a + d.value, 0) }] : data;
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row">
      <div className="relative shrink-0" style={{ width: height, height }} role="img" aria-label="Distribution chart">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={shown} dataKey="value" nameKey="name" innerRadius="66%" outerRadius="96%" paddingAngle={shown.length > 1 ? 2 : 0} stroke="var(--card)" strokeWidth={2}>
              {shown.map((_, i) => (
                <Cell key={i} fill={SERIES[i % SERIES.length]} />
              ))}
            </Pie>
            <Tooltip content={<ChartTooltip format={format} />} />
          </PieChart>
        </ResponsiveContainer>
        {centerValue && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="tabular text-lg font-semibold">{centerValue}</span>
            {centerLabel && <span className="text-[10px] text-muted-foreground">{centerLabel}</span>}
          </div>
        )}
      </div>
      <ul className="w-full min-w-0 space-y-1.5 text-xs">
        {shown.map((d, i) => (
          <li key={d.name} className="flex items-center gap-2">
            <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: SERIES[i % SERIES.length] }} />
            <span className="min-w-0 flex-1 truncate text-muted-foreground">{d.name}</span>
            <span className="tabular font-medium">{formatValue(d.value, format)}</span>
            <span className="tabular w-9 text-right text-muted-foreground">{total ? Math.round((d.value / total) * 100) : 0}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export { Legend };
