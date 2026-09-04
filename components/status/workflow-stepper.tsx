import { Check, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { TERMINAL_FAILURES, WORKFLOWS, statusMeta, type WorkflowKey } from "@/lib/status";

/**
 * One stepper drives every document state machine in the product — purchase
 * orders, transfers, sales orders, adjustments, counts and returns all read
 * their steps from WORKFLOWS rather than shipping their own progress bar.
 */
export function WorkflowStepper({
  workflow,
  status,
  className,
}: {
  workflow: WorkflowKey;
  status: string;
  className?: string;
}) {
  const steps = WORKFLOWS[workflow];
  const failed = TERMINAL_FAILURES.has(status);
  const activeIndex = failed ? -1 : steps.findIndex((s) => s.key === status);

  return (
    <ol className={cn("flex flex-wrap items-center gap-x-1 gap-y-2", className)}>
      {failed && (
        <li className="mr-2 flex items-center gap-1.5 rounded-sm border border-status-danger-border bg-status-danger-bg px-2 py-1 text-xs font-medium text-status-danger">
          <X className="size-3.5" strokeWidth={2} aria-hidden />
          {statusMeta(status).label}
        </li>
      )}
      {steps.map((step, i) => {
        const done = !failed && activeIndex > i;
        const current = !failed && activeIndex === i;
        return (
          <li key={step.key} className="flex items-center gap-1">
            <span
              className={cn(
                "flex items-center gap-1.5 rounded-sm px-2 py-1 text-xs font-medium transition-colors",
                done && "text-status-success",
                current && "bg-primary text-primary-foreground",
                !done && !current && "text-muted-foreground",
                failed && "opacity-55",
              )}
              aria-current={current ? "step" : undefined}
            >
              <span
                className={cn(
                  "flex size-4 shrink-0 items-center justify-center rounded-full border text-[10px] leading-none",
                  done && "border-status-success bg-status-success text-status-success-fg",
                  current && "border-primary-foreground/70 bg-primary-foreground/15 text-primary-foreground",
                  !done && !current && "border-border-strong",
                )}
                aria-hidden
              >
                {done ? <Check className="size-2.5" strokeWidth={3} /> : i + 1}
              </span>
              {step.label}
            </span>
            {i < steps.length - 1 && (
              <span
                className={cn("h-px w-4 shrink-0", done ? "bg-status-success" : "bg-border")}
                aria-hidden
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
