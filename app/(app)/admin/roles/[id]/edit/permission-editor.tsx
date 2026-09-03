"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Save, ShieldAlert, Undo2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Section } from "@/components/record/field-grid";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { plural } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AccessLevel } from "@/lib/auth/permissions";
import { saveRolePermissionsAction } from "./actions";

export interface ModuleRow {
  key: string;
  label: string;
  group: string;
  level: AccessLevel;
}

const LEVELS: AccessLevel[] = ["none", "read", "read-export", "write", "approve", "manage"];

const LEVEL_LABEL: Record<AccessLevel, string> = {
  none: "No access",
  read: "View",
  "read-export": "View & export",
  write: "Edit",
  approve: "Edit & approve",
  manage: "Full control",
};

/** Ranked so a change can be described as a widening or a narrowing. */
const RANK: Record<AccessLevel, number> = {
  none: 0,
  read: 1,
  "read-export": 2,
  write: 3,
  approve: 4,
  manage: 5,
};

const TONE: Record<AccessLevel, string> = {
  none: "text-muted-foreground",
  read: "text-foreground",
  "read-export": "text-foreground",
  write: "text-status-success",
  approve: "text-status-warning",
  manage: "text-status-purple",
};

/**
 * The permission matrix, one row per module.
 *
 * Levels are cumulative rather than a grid of independent checkboxes: "approve"
 * without "view" is not a state anyone means, and letting it be expressed is how
 * permission matrices end up with combinations nobody can reason about. The
 * count of people affected sits next to the save, because this is the one screen
 * where a mistake locks a shift out of the system.
 */
export function PermissionEditor({
  roleId,
  roleLabel,
  holders,
  modules,
  returnTo,
  locked,
}: {
  roleId: string;
  roleLabel: string;
  holders: number;
  modules: ModuleRow[];
  returnTo: string;
  /** Super Admin cannot be narrowed — someone has to be able to undo this. */
  locked?: boolean;
}) {
  const router = useRouter();
  const [saving, startSaving] = React.useTransition();
  const original = React.useMemo(
    () => Object.fromEntries(modules.map((m) => [m.key, m.level])) as Record<string, AccessLevel>,
    [modules],
  );
  const [levels, setLevels] = React.useState<Record<string, AccessLevel>>(original);

  const changed = modules.filter((m) => levels[m.key] !== m.level);
  const widened = changed.filter((m) => RANK[levels[m.key]] > RANK[m.level]);
  const narrowed = changed.filter((m) => RANK[levels[m.key]] < RANK[m.level]);

  const groups = React.useMemo(() => {
    const map = new Map<string, ModuleRow[]>();
    for (const m of modules) {
      const list = map.get(m.group) ?? [];
      list.push(m);
      map.set(m.group, list);
    }
    return [...map];
  }, [modules]);

  const save = () => {
    if (changed.length === 0) {
      toast.info("Nothing to save", { description: "No permission on this role has changed." });
      return;
    }
    startSaving(async () => {
      const result = await saveRolePermissionsAction({ roleId, matrix: levels });
      if (!result.ok) {
        toast.error(result.message ?? "That change could not be saved.");
        return;
      }
      toast.success(`${roleLabel} permissions updated`, {
        description: `${plural(changed.length, "module")} changed${
          narrowed.length > 0 ? `, ${narrowed.length} narrowed` : ""
        }. ${plural(holders, "person takes", "people take")} effect at their next page load.`,
      });
      router.push(returnTo);
      router.refresh();
    });
  };

  return (
    <div className="grid gap-4">
      {locked && (
        <div className="flex items-start gap-2.5 rounded-md border border-status-warning-border bg-status-warning-bg px-3 py-2.5 text-caption text-status-warning">
          <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>
            Super Admin is the role that can restore every other one. Its access is fixed on
            purpose — narrowing it is how an organisation locks itself out of its own system.
          </p>
        </div>
      )}

      {groups.map(([group, rows]) => (
        <Section key={group} title={group} description={`${plural(rows.length, "module")}.`}>
          <ul className="grid gap-1.5">
            {rows.map((row) => {
              const value = levels[row.key];
              const moved = value !== row.level;
              return (
                <li
                  key={row.key}
                  className={cn(
                    "flex flex-wrap items-center justify-between gap-3 rounded-md border px-3 py-2",
                    moved ? "border-status-info-border bg-status-info-bg" : "bg-surface",
                  )}
                >
                  <div className="min-w-0">
                    <p className="text-body font-medium">{row.label}</p>
                    <p className={cn("text-caption", moved ? "text-status-info" : "text-muted-foreground")}>
                      {moved ? (
                        <>
                          {LEVEL_LABEL[row.level]} → {LEVEL_LABEL[value]}
                        </>
                      ) : (
                        LEVEL_LABEL[row.level]
                      )}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    {moved && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Undo the change to ${row.label}`}
                        onClick={() =>
                          setLevels((prev) => ({ ...prev, [row.key]: row.level }))
                        }
                      >
                        <Undo2 className="size-3.5" aria-hidden />
                      </Button>
                    )}
                    <Select
                      items={LEVEL_LABEL}
                      value={value}
                      onValueChange={(next) =>
                        setLevels((prev) => ({
                          ...prev,
                          [row.key]: (next ?? prev[row.key]) as AccessLevel,
                        }))
                      }
                      disabled={locked}
                    >
                      <SelectTrigger
                        className={cn("h-8 w-[172px]", TONE[value])}
                        aria-label={`Access to ${row.label}`}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {LEVELS.map((level) => (
                          <SelectItem key={level} value={level}>
                            {LEVEL_LABEL[level]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </li>
              );
            })}
          </ul>
        </Section>
      ))}

      <div className="sticky bottom-0 flex flex-wrap items-center gap-2 border-t bg-background/95 py-3 backdrop-blur">
        <Button size="sm" className="h-8" onClick={save} disabled={locked || saving}>
          <Save className="size-3.5" aria-hidden />
          {saving ? "Saving…" : "Save permissions"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-8"
          onClick={() => router.push(returnTo)}
        >
          Cancel
        </Button>
        <p className="text-caption text-muted-foreground">
          {changed.length === 0
            ? "No changes yet."
            : `${plural(changed.length, "change")} — ${widened.length} widened, ${
                narrowed.length
              } narrowed, affecting ${plural(holders, "person", "people")}.`}
        </p>
      </div>
    </div>
  );
}
