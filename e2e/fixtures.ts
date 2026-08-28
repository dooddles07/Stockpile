import { test as base, expect, type Locator } from "@playwright/test";

export const test = base.extend<{ main: Locator }>({
  main: async ({ page }, use) => {
    await use(page.locator("main"));
  },
});

export { expect };
