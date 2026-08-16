# Weekly Plan Generation Pipeline

How a week's plan gets created, gated, published, and regenerated. This is the
design of record for the foundational epics; refine it via ADRs as pieces are
built.

---

## Principles

1. **Generation is a PR, never a direct publish.** Every generated or edited
   plan flows through a pull request so CI gates (above all the
   forbidden-ingredient linter) and review always run before anything goes
   live.
2. **Deterministic safety, probabilistic creativity.** An LLM drafts the plan;
   deterministic checks (linter, schema validation) decide whether it can
   ship. The golden rules are never left to model judgment alone.
3. **Git is the history.** Published weeks are immutable except through the
   regeneration flow, so the archive is trustworthy and diffable.
4. **No metered LLM spend.** Generation runs on the owner's machine as a
   local Claude Code session, covered by the existing subscription — never as
   a paid API call from CI. Repo automation (CI gates, optional reminders)
   stays inside GitHub's free tier for public repos. This is an owner
   decision (2026-08-15): a weekly manual step is the accepted trade for
   zero generation cost.

## The weekly runbook (settled — ADR-007)

The entry point is the committed Claude Code skill
**`.claude/skills/generate-week/SKILL.md`**, invoked as `/generate-week`
(`docs/decisions/007-generation-entry-point-committed-skill.md`). The exact
weekly owner steps:

1. **Update `main`** locally (`git checkout main && git pull`).
2. **Run `claude`** (a local Claude Code session — existing subscription, no
   API key).
3. **Invoke `/generate-week [YYYY-Www]`** (default target: next ISO week).
   The skill reads the golden rules doc, the nutrition guidelines,
   `content/preferences.json` (schema: `app/content/preferences.ts`), and
   all existing weeks + recipes for variety (compare recipe slugs, don't
   repeat last week's mains, ~30 distinct foods), then drafts
   `content/weeks/<ISO-week>.json` plus any new
   `content/recipes/<slug>.json` files (reusing existing slugs where a dish
   repeats).
4. **Gates, in order, all green before any PR:** `pnpm validate:content`
   (Zod schemas + referential integrity), `pnpm lint:dietary`
   (forbidden-ingredient linter), `pnpm preflight` — plus **one adversarial
   dietary-safety review round** (fresh subagent, most capable tier;
   `docs/agents/orchestration.md`). Food content never uses `skip-review`.
5. **Review the diff yourself**, then let the session open the PR: branch
   `plan-<isoweek>`, title **`feat(plan): <isoweek>`** (e.g.
   `feat(plan): 2026-W34` — satisfies the pr-title regex in
   `.github/workflows/pr-conventions.yml`; a bare `plan: …` does not),
   labels `safe:human` + `review:adversarial-passed` +
   `status:needs-review` + `skip-changelog`, body with TL;DR, the
   golden-rule check statement, and the `## Adversarial review` verdict.
6. **Owner merges after CI is green** (the session never merges a
   `safe:human` PR) → **Vercel deploys** → the week is live.

Content storage is settled by ADR-006
(`docs/decisions/006-content-storage-files-in-repo.md`): generation writes
files, the PR diff is the publish, and editing a shared recipe counts as
regenerating every published week that references it.

**Free reminder automation (live, zero-LLM):**
`.github/workflows/plan-reminder.yml` runs Thursdays 12:00 UTC (and on
manual dispatch), computes the current UTC ISO week
(`scripts/plan-reminder/current-iso-week.mjs`), and opens a
`Plan missing for <week>` issue when `content/weeks/<week>.json` is absent
(no duplicates — it checks for an existing open issue first). It makes no
LLM calls and costs nothing. The generation itself is never automated in CI.

## Regeneration / editing

- **Full regen:** the owner re-runs the local generation session for that
  week (with feedback in the prompt, e.g. "no salmon this week —
  unavailable"). Produces a fresh PR superseding the week.
- **Targeted edit:** an agent session (or human) edits the week's content
  directly on a branch — same PR + gates path. Preferred for small fixes
  ("swap Tuesday's dinner").

## Content inputs to maintain

- `docs/agents/dietary-safety.md` — the golden rules (owner-gated).
- `docs/agents/nutrition-guidelines.md` — the anti-inflammatory guidance
  distilled from the owner's sources (principles only, no copyrighted recipe
  text), including the ~30-distinct-foods-per-week variety target.
- The **preferences config** at `content/preferences.json` (batch servings,
  fresh-meal floor, snack and fatty-fish targets, distinct-foods target,
  pantry staples assumed on hand, soft dislikes) — validated by
  `app/content/preferences.ts` and gated by `pnpm validate:content`. Soft
  preferences only: the golden rules are never configuration
  (`docs/agents/dietary-safety.md` is the only source of safety
  constraints).

## Open decisions (settle by ADR, tracked as issues)

- Week boundary, generation day, and timezone beyond the current defaults
  (ISO weeks in UTC; Thursday reminder cadence).
- How feedback accumulates ("more like this") without turning into a second
  source of truth.
