import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // The seam, now sealed at the seed (phase 2, ticket 08): the generated
    // dataset (`lib/data/store`, one export — `db`) is loaded into Postgres once
    // by `lib/db/seed.ts` and read nowhere else. Every repository function and
    // every request path queries the database. An import of the generator from
    // a repository function or a request path fails the build.
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
                "The generated dataset is the seed's input only. Query Postgres through an async lib/repo/* function; nothing outside lib/db/seed.ts imports lib/data/store.",
            },
          ],
        },
      ],
    },
  },
  {
    // The seed script — the one sanctioned bridge that loads the generated
    // dataset into Postgres.
    files: ["lib/db/seed.ts"],
    rules: {
      "no-restricted-imports": "off",
    },
  },
  {
    // The repository layer and the seed: stitching Postgres rows back into
    // domain shapes routinely drops a column (`seq`, a parent FK, a nested
    // array) with `const { seq, ...rest }`.
    files: ["lib/repo/**", "lib/db/seed.ts"],
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { ignoreRestSiblings: true }],
    },
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
