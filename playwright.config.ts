import { defineConfig, devices } from "@playwright/test";

/**
 * Smoke suite against the generated dataset (lib/data/store.ts, seeded via
 * lib/data/rng.ts). The dataset is generated once per process from a fixed
 * seed and a fixed `NOW` (lib/data/rng.ts), which is what makes the exact
 * values asserted in e2e/ stable. Changing the seed, `NOW`, or the catalog
 * fixtures in lib/data/catalog.ts invalidates these recorded assertions.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev -- --port 3100",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
