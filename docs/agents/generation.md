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
- **Never hand-roll week math or a timezone lookup.** There are exactly three
  sanctioned helpers — use them, and add to them rather than beside them:
  - `app/utils/week-dates.ts` — pure, UTC-only, safe anywhere including
    component render: `weekStartDate()`, `weekContains(weekStart, date)` (the
    span check: is this `YYYY-MM-DD` inside that Sunday→Saturday week?),
    `formatWeekRange()`, `weekLabel()`.
  - `app/utils/denver-today.ts` — `denverToday()`, the **only** sanctioned way
    to ask "what is today in Denver", returning `YYYY-MM-DD`. It is impure and
    timezone-aware by design. ⚠️ **Server-only: call it in a loader or server
    function, NEVER during component render.** Resolving the current week
    during render lets a UTC server and a browser in another timezone pick
    different weeks — a hydration mismatch, which is exactly the drift
    `week-dates.ts` is kept pure to avoid. Resolve once on the server, pass
    the chosen week down as data.
  - `scripts/plan-reminder/current-week.mjs` — the zero-dependency path for
    the workflow and for shell use (`--next`, `--from <date> --plus <days>`,
    which also asserts the `--from` date is a Sunday).

  Resolving Denver in a fourth place is the failure this list exists to
  prevent; the repo already pins the two implementations together with a sync
  test.

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
   cycle), it offers that week too. **In the same AskUserQuestion exchange it
   also asks what fresh food is already on hand and about to spoil** (see
   *What the skill asks the owner* below) so the owner answers once.
   With the answers, it drafts `content/weeks/<weekStart>.json` plus any new
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

## What the skill asks the owner — and what it never asks

Exactly **two** questions, in **one** AskUserQuestion exchange (the owner runs
parallel sessions and misses questions in prose — `CLAUDE.md`).

### 1. Which week (blocking)

Covered above and by ADR-008. No answer → **re-ask**; never guess the week.

### 2. What is on hand and about to spoil (non-blocking)

*"What fresh ingredients do you already have that will spoil during this
week?"* The plan is then built to eat them — waste reduction is the point.
Because the real answer is a free-form list, the options are only a nudge
("Nothing on hand / skip", plus a common case or two); the free-text path
carries the substance.

- **A non-answer means skip, not guess.** Unlike the week choice, this one
  never blocks: draft as though nothing is on hand and say so in the PR body.
- **The golden rules still win.** On-hand input is a soft preference and never
  overrides `docs/agents/dietary-safety.md`. Anything the owner names that
  breaks Rule 1 or Rule 2 — or that cannot be verified clear of them — is
  **excluded, and the exclusion is named in the PR body with the rule it
  broke**. Never a silent drop, never an exception because it was already
  bought. (An `avoidIngredients` entry is only a soft dislike; the owner
  volunteering the item here overrides that.)
- **Schedule by perishability, most perishable first.** The week runs
  Sunday→Saturday: berries, soft fruit, herbs, greens, mushrooms, cut veg and
  fresh fish land Sunday–Tuesday; hardy produce can carry the back half. A
  use-it-up item placed on Saturday is not being used up.
- **Where they land naturally:** snacks, sweet dishes, yogurt-style dishes,
  and finishing touches on meals absorb unknown amounts most easily — but they
  may go anywhere they fit, and they never displace the preferences targets.
- **Quantities are unknown.** Never invent a precise amount. Write a modest
  schema-valid quantity and put the flexibility in prose ("use what you have").
- **On-hand items still appear on the shopping list.** The list is derived from
  recipe ingredients and nothing filters it, so the recipe is never shrunk or
  trimmed to hide an item — that would under-buy for anyone cooking it alone.
  The plan discloses instead: name the on-hand items in the week's `notes` and
  in the PR body so the owner can cross them off.

### Never asked: whether a food group is acceptable

**Standing owner rule.** Assume every food group is acceptable unless it is
already captured as a dietary concern — the golden rules forbid it
(`docs/agents/dietary-safety.md`) or it appears in `avoidIngredients` in
`content/preferences.json`. Dairy, soy, eggs, nightshades, fermented foods,
grains, legumes, red meat: in scope by default. Do not ask, and do not hedge
in prose ("plain yogurt if dairy sits well with the household") — a hedge is
the same question relocated to read time. If a food genuinely should be off
the menu, it belongs in `avoidIngredients` or in the golden rules, not in a
generation-time question.

This does **not** touch **label checks**, which always stay: "tempeh only if
certified GF" and "kimchi/kombucha labels need a GF check" are Golden Rule 1
checks on a *product*, not permission checks on a *food group*.

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
