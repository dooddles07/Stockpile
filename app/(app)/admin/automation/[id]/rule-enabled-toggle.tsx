"use client";

import * as React from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { setRuleEnabledAction } from "./actions";

/**
 * Enable / disable one Automation Rule. The whole operable surface of the
 * automation screen while the rule vocabulary is still hardcoded (ADR-0008):
 * a disabled rule stops evaluating on the next Event. The row only flips once
 * the write lands; the server revalidation re-renders the badge.
 */
export function RuleEnabledToggle({ ruleId, enabled }: { ruleId: string; enabled: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  const setEnabled = (next: boolean) => {
    startTransition(async () => {
      const result = await setRuleEnabledAction({ ruleId, enabled: next });
      if (result.ok) {
        toast.success(result.message);
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  };

  return (
    <div className="flex items-center gap-2">
      <Switch
        id={`rule-${ruleId}-enabled`}
        checked={enabled}
        disabled={pending}
        onCheckedChange={setEnabled}
      />
      <Label htmlFor={`rule-${ruleId}-enabled`} className="text-caption text-muted-foreground">
        {enabled ? "Enabled" : "Disabled"}
      </Label>
    </div>
  );
}
