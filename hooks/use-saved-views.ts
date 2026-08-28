"use client";

import { useCallback, useMemo } from "react";
import type {
  ColumnFiltersState,
  SortingState,
  VisibilityState,
} from "@tanstack/react-table";

import { useLocalStorage } from "./use-local-storage";

export interface SavedView {
  id: string;
  name: string;
  createdAt: string;
  state: {
    globalFilter: string;
    columnFilters: ColumnFiltersState;
    sorting: SortingState;
    columnVisibility: VisibilityState;
  };
}

const EMPTY: SavedView[] = [];

/**
 * User-defined table views.
 *
 * A view captures the whole working state — search, filters, sort and which
 * columns are showing — because that combination is the thing an operator
 * rebuilds every morning. Saving only the filters would still leave them
 * re-hiding six columns each time.
 *
 * Stored per table per browser. These are conveniences, not shared config;
 * losing them costs a few seconds, so `useLocalStorage` swallowing a blocked
 * write is the right trade.
 */
export function useSavedViews(tableId: string) {
  const [views, setViews] = useLocalStorage<SavedView[]>(`stockpile:views:${tableId}`, EMPTY);

  const save = useCallback(
    (name: string, state: SavedView["state"]) => {
      const trimmed = name.trim();
      if (!trimmed) return null;

      const existing = views.find((v) => v.name.toLowerCase() === trimmed.toLowerCase());
      const view: SavedView = {
        // Overwrite a view of the same name rather than silently creating a
        // second one the operator cannot tell apart.
        id: existing?.id ?? `view-${Date.now()}`,
        name: trimmed,
        createdAt: new Date().toISOString(),
        state,
      };

      setViews(existing ? views.map((v) => (v.id === view.id ? view : v)) : [...views, view]);
      return view;
    },
    [views, setViews],
  );

  const remove = useCallback(
    (id: string) => setViews(views.filter((v) => v.id !== id)),
    [views, setViews],
  );

  const find = useCallback((id: string) => views.find((v) => v.id === id), [views]);

  return useMemo(() => ({ views, save, remove, find }), [views, save, remove, find]);
}

/** True when a table is in a state worth saving. */
export function hasActiveState(state: SavedView["state"]): boolean {
  return (
    state.globalFilter.trim().length > 0 ||
    state.columnFilters.length > 0 ||
    state.sorting.length > 0 ||
    Object.values(state.columnVisibility).some((v) => v === false)
  );
}

/** A short human description of what a view actually does. */
export function describeView(state: SavedView["state"]): string {
  const parts: string[] = [];
  if (state.globalFilter.trim()) parts.push(`search "${state.globalFilter.trim()}"`);
  if (state.columnFilters.length > 0) {
    const count = state.columnFilters.reduce(
      (sum, f) => sum + (Array.isArray(f.value) ? f.value.length : 1),
      0,
    );
    parts.push(`${count} filter${count === 1 ? "" : "s"}`);
  }
  if (state.sorting.length > 0) {
    parts.push(`sorted by ${state.sorting.map((s) => s.id).join(", ")}`);
  }
  const hidden = Object.values(state.columnVisibility).filter((v) => v === false).length;
  if (hidden > 0) parts.push(`${hidden} column${hidden === 1 ? "" : "s"} hidden`);

  return parts.length > 0 ? parts.join(" · ") : "no filters";
}
