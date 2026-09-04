"use client";

import { useEffect, useRef } from "react";
import { useInView } from "motion/react";

import { NumberTicker, type NumberTickerRef } from "@/components/ui/number-ticker";
import { cn } from "@/lib/utils";

const METRICS: { value: number; display: string; label: string }[] = [
  { value: 6, display: "", label: "Warehouse sites" },
  { value: 2400, display: "+", label: "SKUs tracked" },
  { value: 50000, display: "+", label: "Movements/month" },
  { value: 7, display: "", label: "Role-based views" },
];

function MetricCell({
  metric,
  index,
}: {
  metric: (typeof METRICS)[number];
  index: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const tickerRef = useRef<NumberTickerRef>(null);
  const inView = useInView(ref, { once: true });

  useEffect(() => {
    if (inView) tickerRef.current?.startAnimation();
  }, [inView]);

  const displayTarget = metric.value >= 1000 ? metric.value / 1000 : metric.value;

  return (
    <div
      ref={ref}
      className={cn(
        "px-6 py-6 text-center sm:py-8",
        index > 0 && "border-l",
        index >= 2 && "border-t sm:border-t-0",
      )}
    >
      <p className="font-heading text-[28px] font-bold tracking-tight text-foreground sm:text-[32px]">
        <NumberTicker
          ref={tickerRef}
          from={0}
          target={displayTarget}
          autoStart={false}
          transition={{ duration: 1.5, type: "tween", ease: "easeOut", delay: index * 0.1 }}
          className="tabular-nums"
        />
        {metric.value >= 1000 ? "k" : ""}
        {metric.display}
      </p>
      <p className="mt-1 text-[12px] font-medium text-muted-foreground">{metric.label}</p>
    </div>
  );
}

export function AnimatedMetrics() {
  return (
    <section aria-labelledby="metrics-heading" className="border-y bg-surface-sunken">
      <h2 id="metrics-heading" className="sr-only">Key metrics</h2>
      <div className="mx-auto grid max-w-6xl grid-cols-2 sm:grid-cols-4">
        {METRICS.map((m, i) => (
          <MetricCell key={m.label} metric={m} index={i} />
        ))}
      </div>
    </section>
  );
}
