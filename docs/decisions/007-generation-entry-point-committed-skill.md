# ADR-007: Generation Entry Point — Committed Claude Code Skill

## Status

Accepted. The reasoning below stands; only the week **identifier** and the runbook specifics that hang off it moved on — ADR-008 (`docs/decisions/008-sunday-week-dated-identifier.md`) made weeks Sunday→Saturday and named them by their starting Sunday's date (`content/weeks/<YYYY-MM-DD>.json`), and with it changed the invocation, the branch rule, the PR title, the reminder script's name, and which week the reminder checks. Where any specific recorded below disagrees with ADR-008, ADR-008 wins.

## Context

`docs/agents/generation.md` left the shape of the local generation entry point open: a documented prompt, a committed Claude Code skill (`/generate-week`), or a `pnpm generate:week` wrapper that launches a session. The forcing constraint is the owner's no-metered-spend decision (2026-08-15, recorded as pipeline principle 4): generation runs in the owner's local Claude Code session on the existing subscription — never as a paid API call from CI — so the entry point must live where that session can execute it, and repo automation must stay zero-LLM inside GitHub's free tier.

A documented prompt is copy-paste-fragile and drifts from the docs it quotes. A `pnpm` wrapper adds a process boundary around a conversation, must shell out to a CLI the repo does not otherwise depend on, and still needs the instructions written somewhere. A committed skill is version-controlled instructions the session loads natively: it ships through the same PR + review gates as everything else, updates atomically with the schemas and docs it references, and follows the pattern already established by the `orchestrate` and `review-loop` skills.

## Decision

The entry point is the committed skill `.claude/skills/generate-week/SKILL.md`, invoked as `/generate-week [YYYY-Www]` in a local session. It encodes the settled runbook (inputs, gates in order, one adversarial dietary-safety review round, `plan-<isoweek>` branch, `feat(plan): <isoweek>` PR title, `safe:human` handoff). The companion reminder workflow (`.github/workflows/plan-reminder.yml` + `scripts/plan-reminder/current-iso-week.mjs`) is zero-LLM by design: it only checks for a missing `content/weeks/<week>.json` and opens a reminder issue.

## Consequences

- Changing the generation process means editing `SKILL.md` via PR — the process itself is reviewed, diffable history like everything else. Keep it in sync with `docs/agents/generation.md` (the runbook of record) and `app/content/schema.ts`.
- No generation path exists in CI, and none may be added without a superseding ADR plus the owner's cost sign-off (`docs/agents/governance.md`). The reminder workflow must stay LLM-free and secret-free (`GITHUB_TOKEN` only).
- The weekly manual step is the accepted trade for zero generation cost; the Thursday reminder issue is the only nudge.
- Rejected alternatives: documented prompt (drift, copy-paste fragility), `pnpm generate:week` wrapper (new dependency surface, no benefit over invoking the skill directly in the session that is already running).
