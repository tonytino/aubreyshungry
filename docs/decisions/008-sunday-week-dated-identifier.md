# ADR-008: Planning Weeks Run Sunday→Saturday, Identified by the Starting Sunday's Date

## Status

Accepted. **Amends ADR-007** (`docs/decisions/007-generation-entry-point-committed-skill.md`) on two points — the `plan-<isoweek>` branch mandate and the `[YYYY-Www]` invocation parameter — without superseding it: the committed-skill entry point, the gates, the single adversarial dietary-safety round, and the `safe:human` handoff all stand.

## Context

The content model inherited ISO weeks: a week was `YYYY-Www` (e.g. `2026-W34`), ran Monday→Sunday, and "now" was resolved in UTC (`IsoWeekSchema`, `app/utils/iso-week.ts`, `scripts/plan-reminder/current-iso-week.mjs`). ISO weeks are a fine machine standard, but three things made them the wrong fit for this product.

**The boundary is in the wrong place.** The household shops and batch-cooks on the weekend, and the meal-prep backbone of every plan is cooked Sunday. A Monday-start week splits the plan across the exact seam it is built around: Sunday's cooking session belongs to the *previous* week's file, while the food it produces is eaten in the next one. Every plan would need a note explaining the mismatch.

**The identifier is unreadable.** `2026-W34` tells the owner nothing at a glance — it needs a conversion before anyone knows whether it is the week they are shopping for. It is also the filename and the archive URL (ADR-006), so the opacity is permanent and public. A plain calendar date reads unambiguously everywhere, sorts chronologically as a string, and can be checked by eye.

**UTC silently names the wrong week.** The owner is in Mountain Time. UTC midnight falls at 5–6 PM in Denver, so any generation or reminder run on a Saturday evening — a natural time to plan the coming week — computes tomorrow's date and rolls across the week boundary. This is the kind of bug that produces a plausible-looking plan filed under the wrong identifier.

Two smaller things surfaced from using ADR-007's runbook in practice. The mandatory `plan-<isoweek>` branch forced a checkout dance in sessions that were already on a perfectly good branch, and bought nothing that the PR itself does not already provide. And the `[YYYY-Www]` argument was a parameter nobody could type correctly without first looking up the week number — while the answer the owner actually wants is a choice between two obvious candidates.

`content/weeks/` is empty, so there is no published content to migrate and no public URL to break. This is the last cheap moment to change it.

## Decision

A planning week runs **Sunday→Saturday** and is identified by **the `YYYY-MM-DD` calendar date of its starting Sunday** (`content/weeks/2026-08-16.json`, field `weekStart`), with "today" resolved in **`America/Denver`** everywhere a current week is computed. `WeekStartSchema` replaces `IsoWeekSchema` and rejects any value that is not a real Sunday. Generation is invoked as a bare `/generate-week` that asks the owner which week to write, and runs on whatever branch the session is already on.

## Consequences

- **Schema and content contract.** `WeekSchema.isoWeek` becomes `weekStart` (`WeekStartSchema`: `YYYY-MM-DD`, a real calendar date, and a Sunday). The filename must equal the `weekStart` field, so a week filed under a non-Sunday fails `pnpm validate:content` rather than misnaming its own window forever. `DAYS` in `app/content/schema.ts` is ordered Sunday-first, and that order is the menu-by-day display order.
- **Helpers renamed, not duplicated.** `app/utils/iso-week.ts` becomes `app/utils/week-dates.ts` (`weekStartDate()`, `formatWeekRange()`, `weekLabel()`); `scripts/plan-reminder/current-iso-week.mjs` becomes `scripts/plan-reminder/current-week.mjs` and prints `YYYY-MM-DD`. Week-boundary math is never hand-rolled at a call site.
- **No migration.** `content/weeks/` is empty, so nothing is renamed and no published URL changes. Anything written from here on uses the new identifier; there is no compatibility path for `YYYY-Www` and none should be added.
- **Amendment 1 to ADR-007 — the branch mandate is dropped.** A generation session works on the branch it is already on, and only creates one (e.g. `plan-2026-08-16`) if it started on `main`. The PR — not the branch name — is the unit of review.
- **Amendment 2 to ADR-007 — the `[YYYY-Www]` parameter is replaced by an interactive prompt.** `/generate-week` takes no argument. The skill finds the latest `weekStart` under `content/weeks/`, then asks the owner (AskUserQuestion) to choose between regenerating that week and generating the next one (`+7 days`) — plus the week a `Plan missing for <date>` reminder issue named, when a missed cycle puts it outside those two. With no weeks on disk it offers the current Mountain-Time week (the Sunday on or before today) and the one after it. It never guesses.
- **The Thursday reminder targets the upcoming week.** `.github/workflows/plan-reminder.yml` checks `currentWeekStart() + 7 days`, not the current week: under a Sunday→Saturday week the current one is five days gone by Thursday, and the workflow exists to nudge the before-weekend shopping run. This lines the reminder up with the skill's *generate the next week* choice — the same Sunday, which is the happy path.
- **The home page leads with the CURRENT week, not the newest file.** This belongs to the same decision as the reminder retargeting, and follows from it: publishing next week's plan on Thursday means the newest file on disk is normally *not* the week being eaten, so "show the latest week" would put the household in front of food it cannot cook yet for three days of every week. The site therefore resolves the week whose Sunday→Saturday span contains today in `America/Denver`, falls back to the latest week on disk when no week matches (before the first publish, or after a missed cycle), and surfaces a newer published week as a labelled link rather than as the headline. Date-based resolution on the site is also why `America/Denver` had to become the repo-wide rule and not just a generation-time detail.
- **PR title.** The plan PR is titled `feat(plan): week of <weekStart>` (regenerations: `feat(plan): regenerate week of <weekStart>`), which satisfies the Conventional-Commit regex in `.github/workflows/pr-conventions.yml`. Everything else from ADR-007 is unchanged: gates in order, one adversarial dietary-safety round, `safe:human`, the owner clicks merge.
- **Docs that must stay in sync** when any of this changes: `.claude/skills/generate-week/SKILL.md`, `docs/agents/generation.md` (the runbook of record), `docs/agents/domain.md`, and `app/content/schema.ts`.
- **Rejected alternatives:** keeping ISO weeks and documenting the Sunday seam (leaves the identifier opaque and the cooking day in the wrong file); a Sunday-start week still labelled `YYYY-Www` (a non-standard use of a standard notation — the worst of both); resolving dates in UTC and converting for display only (the reminder workflow and the skill both need the *date*, not a rendering, so the bug survives).
