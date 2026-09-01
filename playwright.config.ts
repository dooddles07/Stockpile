import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;

/**
 * Set to run the suite against an already-deployed instance instead of a local
 * dev server — the daily reset workflow points it at production after re-seeding
 * it (ADR-0010). The write project is dropped when it is set: those specs mutate
 * stock, and the demo must be left in the state the reset produced. Unset locally
 * and in CI, where the config starts its own server against a seeded Neon
 * branch.
 */
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL;

/**
 * The suite runs against a freshly seeded Neon branch (CI seeds before every
 * run; see `.github/workflows/e2e.yml`). Exact rendered values — totals, row
 * counts, row order — are stable because the seed is deterministic from a fixed
 * generator seed and `NOW`; changing either invalidates the recorded assertions.
 *
 * Two kinds of spec:
 *   - `*.spec.ts`        read-only, safe to run in parallel (the `read` project).
 *   - `*.write.spec.ts`  exercise the write path, so they mutate stock. They run
 *                        in the `write` project, which `dependsOn` `read` — so
 *                        every read assertion is taken against the untouched
 *                        seed, and only then do the write specs run (each one
 *                        restores the stock it spends, mirroring
 *                        `lib/domain/stock.checks.ts`).
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    // `localhost`, not `127.0.0.1`: Next's dev-origin guard treats them as
    // different origins and silently drops client JS for the latter,
    // breaking hydration without failing the page load.
    baseURL: BASE_URL ?? `http://localhost:${PORT}`,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "read",
      testIgnore: /\.write\.spec\.ts$/,
      use: { ...devices["Desktop Chrome"] },
    },
    ...(BASE_URL
      ? []
      : [
          {
            name: "write",
            testMatch: /\.write\.spec\.ts$/,
            dependencies: ["read"],
            // A write drives a form, a server action and an interactive
            // transaction; the first one after the read project can also wait
            // on a Neon cold start.
            timeout: 60_000,
            use: { ...devices["Desktop Chrome"] },
          },
        ]),
  ],
  webServer: BASE_URL
    ? undefined
    : {
        command: `npm run dev -- --port ${PORT}`,
        url: `http://localhost:${PORT}`,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
