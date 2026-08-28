/**
 * Deterministic pseudo-randomness.
 *
 * Every fixture in the app is generated from a fixed seed so the server and
 * the client render byte-identical markup. Never call Math.random() in data
 * generation — it hydration-mismatches and makes the numbers change under the
 * user between navigations, which reads as fake immediately.
 */

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function next(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Rng {
  private next: () => number;

  constructor(seed: number) {
    this.next = mulberry32(seed);
  }

  /** Float in [min, max). */
  float(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    return Math.floor(this.float(min, max + 1));
  }

  /** Value rounded to `dp` decimals. */
  round(min: number, max: number, dp = 2): number {
    const f = 10 ** dp;
    return Math.round(this.float(min, max) * f) / f;
  }

  bool(trueProbability = 0.5): boolean {
    return this.next() < trueProbability;
  }

  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length)];
  }

  /** Weighted pick. Weights need not sum to 1. */
  weighted<T>(entries: readonly (readonly [T, number])[]): T {
    const total = entries.reduce((sum, [, w]) => sum + w, 0);
    let roll = this.next() * total;
    for (const [value, weight] of entries) {
      roll -= weight;
      if (roll <= 0) return value;
    }
    return entries[entries.length - 1][0];
  }

  /** `count` distinct items, or all of them when the pool is smaller. */
  sample<T>(items: readonly T[], count: number): T[] {
    const pool = [...items];
    const out: T[] = [];
    const n = Math.min(count, pool.length);
    for (let i = 0; i < n; i++) {
      out.push(pool.splice(Math.floor(this.next() * pool.length), 1)[0]);
    }
    return out;
  }

  shuffle<T>(items: readonly T[]): T[] {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }
}

/**
 * The "now" the whole dataset is anchored to.
 *
 * Fixed rather than `new Date()` so server and client agree and so relative
 * labels ("3 days ago") stay stable within a session. Bump when reseeding.
 */
export const NOW = new Date("2026-08-27T09:15:00.000Z");

export const DAY_MS = 86_400_000;

export function daysFromNow(days: number): string {
  return new Date(NOW.getTime() + days * DAY_MS).toISOString();
}

export function hoursFromNow(hours: number): string {
  return new Date(NOW.getTime() + hours * 3_600_000).toISOString();
}

/** Stable id: `prefix-0007`. */
export function id(prefix: string, n: number, width = 4): string {
  return `${prefix}-${String(n).padStart(width, "0")}`;
}
