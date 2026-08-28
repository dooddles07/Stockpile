import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;

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
    // `localhost`, not `127.0.0.1`: Next's dev-origin guard treats them as
    // different origins and silently drops client JS for the latter,
    // breaking hydration without failing the page load.
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npm run dev -- --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
