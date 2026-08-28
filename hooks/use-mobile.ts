"use client";

import { useCallback, useSyncExternalStore } from "react";

const MOBILE_BREAKPOINT = 768;
const QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`;

function subscribe(onChange: () => void) {
  const mql = window.matchMedia(QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

/** Viewport check without a first-render flash of the wrong layout. */
export function useIsMobile(): boolean {
  const getSnapshot = useCallback(() => window.matchMedia(QUERY).matches, []);
  // Desktop is the primary operational surface, so that is the server guess.
  const getServerSnapshot = useCallback(() => false, []);
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
