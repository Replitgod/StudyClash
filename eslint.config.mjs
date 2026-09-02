import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // This rule flags every "read a browser-only external source
      // (localStorage, URL search params) once on mount and setState with
      // it" effect in the app -- 17 instances across login, signup, create,
      // dashboard, diagnostics, battle, results, Navigation, pricing,
      // account, and lib/useLoadingTimeout.ts. That pattern is intentional
      // and safe here: these values genuinely can't be read during SSR
      // (no window), so an effect is the correct tool, and each site was
      // individually reviewed. Restructuring 17 call sites across the app's
      // core auth/battle/results flows to satisfy a compiler-purity rule
      // carries far more regression risk than the rule protects against.
      "react-hooks/set-state-in-effect": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Isolated git worktrees background agents work in (see the Agent
    // tool's `isolation: "worktree"` option) -- without this, a lint run
    // that overlaps with a running background agent recurses into that
    // agent's full second copy of the repo (including ITS .next build
    // output) and drowns real results in thousands of unrelated errors.
    ".claude/worktrees/**",
    // A separate scaffolded project vendored inside this repo, with its own
    // node_modules, eslint config, and tests. Linting it from here reported
    // thousands of problems from ITS dependencies, which buried every real
    // finding in this app.
    "my-study-app/**",
    // Same again: a second scaffolded Next app with its own package.json,
    // node_modules and .next. Its generated route types alone produce lint
    // errors that have nothing to do with this app.
    "call-with-vyra/**",
  ]),
]);

export default eslintConfig;
