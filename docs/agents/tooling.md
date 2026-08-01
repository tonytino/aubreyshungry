# Tooling

This project uses Biome, Lefthook, and a `preflight` script for code quality. Three commands, three distinct purposes — don't mix them up.

## Decision Rule

| Situation | Command | What it does |
| --------- | ------- | ------------ |
| Writing code, iterating | `pnpm check` | Runs `biome check --write .` — **mutates files** to auto-fix lint and format issues across the whole repo |
| About to commit | *Nothing — Lefthook runs automatically* | Runs `biome check --staged` on staged files only — **read-only**. Blocks the commit if issues remain |
| "Is my change ready to ship?" | `pnpm preflight` | Runs `biome check .` + `tsc --noEmit` + `vitest run` — **read-only**, whole repo, all validators. Required before declaring work complete |
| Validating a dependency bump | `pnpm preflight && pnpm build` | Preflight plus production build. Catches issues that only surface at build time |

## Why Three Commands

`check`, the pre-commit hook, and `preflight` look similar on the surface but serve different moments:

- **`pnpm check` is mutating.** You run it while you are still writing code and want auto-fix to clean things up. It is not a "validate" command — it changes files.
- **The pre-commit hook is scoped and non-mutating.** It runs on staged files only so commits stay fast and it never rewrites your code out from under you. It is the safety net that stops dirty code from entering the repo.
- **`pnpm preflight` is whole-repo and non-mutating.** It is the single command that answers "did I break anything?" across lint, types, and tests. Run it before opening a PR.

If a new kind of validation is added (e.g. a custom check script), it goes into `preflight`. Don't document bespoke chains like `biome check && tsc && vitest` elsewhere — they drift. Call `pnpm preflight` and let the script definition be the source of truth.

## Editor Integration

Install the Biome extension for your editor so you get format-on-save. This eliminates 99% of the fixes `pnpm check` would apply and keeps the pre-commit hook silent.

## Skipping the Pre-commit Hook

Do not. If the hook fails, fix the issue. If you believe the hook is wrong, raise it as an issue and fix the root cause. Bypassing hooks (`--no-verify`) defeats the safety net.
