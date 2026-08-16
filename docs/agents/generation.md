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

## The week model (settled — ADR-008)

- A planning week runs **Sunday → Saturday**. The household shops and
  batch-cooks on the weekend, so Sunday morning is the real boundary.
- A week is identified by **the calendar date of its starting Sunday**
  (`YYYY-MM-DD`): the file is `content/weeks/2026-08-16.json` and its
  `weekStart` field is `"2026-08-16"`. `WeekStartSchema` in
  `app/content/schema.ts` rejects any date that is not a real Sunday. There
  is no ISO-week identifier anywhere in the content model.
- **"Today" resolves in `America/Denver` (Mountain Time)** — in the skill and
  in the reminder workflow both. The owner shops and cooks on Mountain Time,
  and a UTC "today" rolls over at 5–6 PM local, which would silently name the
  wrong week on an evening run.
- Week-boundary math lives in `app/utils/week-dates.ts` (`weekStartDate()`,
  `formatWeekRange()`, `weekLabel()`) and, for the zero-dependency workflow
  path, `scripts/plan-reminder/current-week.mjs`. Never hand-roll it.

## The weekly runbook (settled — ADR-007, amended by ADR-008)

The entry point is the committed Claude Code skill
**`.claude/skills/generate-week/SKILL.md`**, invoked as `/generate-week`
(`docs/decisions/007-generation-entry-point-committed-skill.md`). The exact
weekly owner steps:

1. **Update `main`** locally (`git checkout main && git pull`) — a fresh
   weekly run starts here, and the session branches off it at step 5. If you
   are already on a working branch for this week, stay on it.
2. **Run `claude`** (a local Claude Code session — existing subscription, no
   API key).
3. **Invoke `/generate-week`** — bare, with no week argument. The skill reads
   the golden rules doc, the nutrition guidelines,
   `content/preferences.json` (schema: `app/content/preferences.ts`), and
   all existing weeks + recipes for variety (compare recipe slugs, don't
   repeat last week's mains, ~30 distinct foods). It then finds the latest
   `weekStart` under `content/weeks/` and **asks the owner** (AskUserQuestion)
   whether to *regenerate that week* or *generate the next one*
   (`latest + 7 days`); with no weeks on disk yet it offers the current
   Mountain-Time week (the Sunday on or before today) and the one after it,
   and if a reminder issue named a week outside those choices (a missed
   cycle), it offers that week too.
   With the answer, it drafts `content/weeks/<weekStart>.json` plus any new
   `content/recipes/<slug>.json` files (reusing existing slugs where a dish
   repeats).
4. **Gates, in order, all green before any PR:** `pnpm validate:content`
   (Zod schemas + referential integrity), `pnpm lint:dietary`
   (forbidden-ingredient linter), `pnpm preflight` — plus **one adversarial
   dietary-safety review round** (fresh subagent, most capable tier;
   `docs/agents/orchestration.md`). Food content never uses `skip-review`.
5. **Review the diff yourself**, then let the session open the PR. The
   session works on whatever branch it is already on (no mandated branch
   name; it only creates one — e.g. `plan-2026-08-16` — if it started on
   `main`). Title **`feat(plan): week of <weekStart>`** (e.g.
   `feat(plan): week of 2026-08-16`, or
   `feat(plan): regenerate week of 2026-08-16`) — satisfies the pr-title
   regex in `.github/workflows/pr-conventions.yml`; a bare `plan: …` does
   not. Labels `safe:human` + `review:adversarial-passed` +
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
manual dispatch) and checks the **upcoming** week — the Sunday that opens the
week you are about to shop for. It takes the current Mountain-Time week start
from `scripts/plan-reminder/current-week.mjs` (a zero-dependency script that
prints `YYYY-MM-DD` — the Sunday opening the week containing "now" in
`America/Denver`), adds **7 days**, and opens a
`Plan missing for <that Sunday's date>` issue when
`content/weeks/<that date>.json` is absent (no duplicates — it checks for an
existing open issue first). It makes no LLM calls and costs nothing. The
generation itself is never automated in CI.

It targets the upcoming week on purpose: under a Sunday→Saturday week, the
current week is five days gone by Thursday, and the whole point of the
Thursday nudge is the before-weekend shopping run. **So the reminder and the
skill's "generate the next week" option name the same Sunday** — that is the
happy path. The owner gets the Thursday issue, runs `/generate-week`, takes
the *generate the next week* choice, and the plan lands before the weekend
shop.

## Regeneration / editing

- **Full regen:** the owner re-runs the local generation session and picks
  *regenerate the last generated week* at the skill's prompt (with feedback
  in the session, e.g. "no salmon this week — unavailable"). It rewrites
  `content/weeks/<weekStart>.json` in place and produces a fresh PR
  superseding the week; the PR body must say it is a regeneration and what
  changed.
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

- Generation day and reminder cadence (currently Thursday). The week boundary
  and timezone are settled — Sunday→Saturday in Mountain Time, ADR-008.
- How feedback accumulates ("more like this") without turning into a second
  source of truth.
