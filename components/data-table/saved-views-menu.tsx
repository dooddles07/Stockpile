"use client";

import * as React from "react";
import type { Table } from "@tanstack/react-table";
import { Bookmark, BookmarkPlus, Check, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuGroupLabel,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  describeView,
  hasActiveState,
  useSavedViews,
} from "@/hooks/use-saved-views";
import type { TableView } from "./toolbar";
import { cn } from "@/lib/utils";

/**
 * Saved views.
 *
 * Built-in views (the ones a page ships with, like "Low stock") and views the
 * operator saves themselves live in one menu, because from the operator's side
 * they do the same job. Only their own are deletable.
 */
export function SavedViewsMenu<TData>({
  table,
  tableId,
  builtIn,
  activeBuiltIn,
  onBuiltInChange,
}: {
  table: Table<TData>;
  tableId: string;
  builtIn?: TableView[];
  activeBuiltIn?: string;
  onBuiltInChange?: (id: string) => void;
}) {
  const { views, save, remove } = useSavedViews(tableId);
  const [saveOpen, setSaveOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [appliedId, setAppliedId] = React.useState<string | null>(null);

  const currentState = () => {
    const s = table.getState();
    return {
      globalFilter: (s.globalFilter as string) ?? "",
      columnFilters: s.columnFilters,
      sorting: s.sorting,
      columnVisibility: s.columnVisibility,
    };
  };

  const savable = hasActiveState(currentState());

  const applyView = (id: string) => {
    const view = views.find((v) => v.id === id);
    if (!view) return;
    table.setGlobalFilter(view.state.globalFilter);
    table.setColumnFilters(view.state.columnFilters);
    table.setSorting(view.state.sorting);
    table.setColumnVisibility(view.state.columnVisibility);
    setAppliedId(id);
    toast.success(`Applied "${view.name}"`, {
      description: describeView(view.state),
    });
  };

  const activeLabel =
    builtIn?.find((v) => v.id === activeBuiltIn)?.label ??
    views.find((v) => v.id === appliedId)?.name ??
    "Views";

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="outline" size="sm" className="h-8 gap-1.5" />
          }
        >
          <Bookmark className="size-3.5" aria-hidden />
          <span className="hidden max-w-[9rem] truncate sm:inline">
            {activeLabel}
          </span>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-72">
          {builtIn && builtIn.length > 0 && onBuiltInChange && (
            <>
              <DropdownMenuGroup>
                <DropdownMenuGroupLabel className="text-overline text-muted-foreground">
                  Built-in views
                </DropdownMenuGroupLabel>
                {builtIn.map((view) => (
                  <DropdownMenuItem
                    key={view.id}
                    onClick={() => {
                      setAppliedId(null);
                      onBuiltInChange(view.id);
                    }}
                    className={cn(
                      "items-start",
                      view.id === activeBuiltIn && "bg-accent",
                    )}
                  >
                    <span className="grid min-w-0 flex-1 gap-0.5">
                      <span className="text-[13px] font-medium">
                        {view.label}
                      </span>
                      {view.description && (
                        <span className="text-[11px] leading-snug text-muted-foreground">
                          {view.description}
                        </span>
                      )}
                    </span>
                    {view.id === activeBuiltIn && (
                      <Check className="mt-0.5 size-4 shrink-0" aria-hidden />
                    )}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
            </>
          )}

          <DropdownMenuGroup>
            <DropdownMenuGroupLabel className="text-overline text-muted-foreground">
              Your views
            </DropdownMenuGroupLabel>

            {views.length === 0 ? (
              <p className="px-2 py-2 text-caption leading-relaxed text-muted-foreground">
                Filter and sort the table how you want it, then save it here. A
                view remembers the search, filters, sort and which columns are
                showing.
              </p>
            ) : (
              views.map((view) => (
                <DropdownMenuItem
                  key={view.id}
                  onClick={() => applyView(view.id)}
                  className={cn(
                    "items-start gap-2",
                    view.id === appliedId && "bg-accent",
                  )}
                >
                  <span className="grid min-w-0 flex-1 gap-0.5">
                    <span className="text-[13px] font-medium">{view.name}</span>
                    <span className="truncate text-[11px] leading-snug text-muted-foreground">
                      {describeView(view.state)}
                    </span>
                  </span>
                  <button
                    type="button"
                    aria-label={`Delete view ${view.name}`}
                    className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      remove(view.id);
                      if (appliedId === view.id) setAppliedId(null);
                      toast.success(`Deleted "${view.name}"`);
                    }}
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                  </button>
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuGroup>

          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => {
              setName("");
              setSaveOpen(true);
            }}
            disabled={!savable}
          >
            <BookmarkPlus className="size-4" aria-hidden />
            {savable ? "Save this view" : "Filter something first"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={saveOpen} onOpenChange={setSaveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Save this view</AlertDialogTitle>
            <AlertDialogDescription>
              {describeView(currentState())}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="grid gap-2">
            <Label htmlFor="view-name">Name</Label>
            <Input
              id="view-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Critical at DC-01"
              autoFocus
            />
            <p className="text-caption text-muted-foreground">
              Saved in this browser only. A view of the same name is
              overwritten.
            </p>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={name.trim().length === 0}
              onClick={() => {
                const view = save(name, currentState());
                if (view) {
                  setAppliedId(view.id);
                  toast.success(`Saved "${view.name}"`, {
                    description: describeView(view.state),
                  });
                }
                setSaveOpen(false);
              }}
            >
              Save view
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
