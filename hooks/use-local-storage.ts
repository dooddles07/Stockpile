"use client";

import { useCallback, useRef, useSyncExternalStore } from "react";

/**
 * Per-viewer preferences (column visibility, row density, pinned nav items).
 *
 * Built on useSyncExternalStore rather than useState + useEffect so the value
 * is correct on the first client render instead of flipping a frame later, and
 * so two components reading the same key stay in step.
 *
 * Every access is wrapped: private windows and "block site data" both throw,
 * and losing a saved column preference must never take a page down with it.
 */

const listeners = new Set<() => void>();
const cache = new Map<string, { raw: string | null; value: unknown }>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  // Another tab writing the same key should update this one too.
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

function read<T>(key: string, fallback: T): T {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(key);
  } catch {
    raw = null;
  }

  // Cache by raw string so getSnapshot returns a stable reference between
  // renders — returning a fresh object every call makes React loop.
  const hit = cache.get(key);
  if (hit && hit.raw === raw) return hit.value as T;

  let value = fallback;
  if (raw !== null) {
    try {
      value = JSON.parse(raw) as T;
    } catch {
      value = fallback;
    }
  }
  cache.set(key, { raw, value });
  return value;
}

export function useLocalStorage<T>(key: string, fallback: T): [T, (next: T) => void] {
  const fallbackRef = useRef(fallback);

  const getSnapshot = useCallback(() => read(key, fallbackRef.current), [key]);
  const getServerSnapshot = useCallback(() => fallbackRef.current, []);

  const value = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setValue = useCallback(
    (next: T) => {
      const raw = JSON.stringify(next);
      cache.set(key, { raw, value: next });
      try {
        window.localStorage.setItem(key, raw);
      } catch {
        // Preference not persisted; it still applies for this session.
      }
      emit();
    },
    [key],
  );

  return [value, setValue];
}
