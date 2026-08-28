import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // The seam: the generated dataset (`lib/data/store`, one export — `db`) is
    // reachable only from the repository layer. Every screen and component
    // reads through an async `lib/repo/*` function instead. Phase 2 swaps the
    // repository bodies for Drizzle queries against one module, not seventy-seven.
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              // `@/` alias, any deeper relative path, `.ts` suffix, and the
              // bare `./data/store` / `../data/store` a sibling in `lib/` could use.
              group: [
                "**/lib/data/store",
                "**/lib/data/store.*",
                "**/data/store",
                "**/data/store.*",
              ],
              message:
                "The generated dataset is private to the repository layer. Add or use an async function in lib/repo/* instead of importing lib/data/store directly.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["lib/repo/**"],
    rules: { "no-restricted-imports": "off" },
  },
  {
    // Playwright fixtures take a `use` callback that the React hooks rules
    // mistake for a hook — these files aren't React, so the rule doesn't apply.
    files: ["e2e/**"],
    rules: {
      "react-hooks/rules-of-hooks": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
