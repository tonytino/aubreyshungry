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

## The pipeline (owner-run, by design)

```
Owner runs generation locally (weekly, e.g. Thu — before weekend shopping)
  └─> a local Claude Code session (existing subscription, no API key) drives
      the generation prompt/skill
        • inputs: golden rules doc, nutrition guidelines, recent weeks
          (variety — compare recipe slugs, don't repeat last week's),
          household preferences config
        • output: content/weeks/<ISO-week>.json plus any new
          content/recipes/<slug>.json files (reuse existing slugs where the
          dish repeats) — all schema-validated with Zod
  └─> the session opens PR "plan: 2026-W32"
        • CI (free on public repos): forbidden-ingredient linter, schema
          validation, build, tests
        • label per governance: safe:human while the linter is unproven;
          may graduate to safe:agent later (owner decision)
  └─> owner merges → Vercel deploys → the week is live
```

Content storage is settled by ADR-006
(`docs/decisions/006-content-storage-files-in-repo.md`): generation writes
files, the PR diff is the publish, and editing a shared recipe counts as
regenerating every published week that references it.

**Optional, free automation:** a scheduled GitHub Actions job MAY check
whether the current ISO week's plan exists and open a reminder issue when it
is missing. It makes no LLM calls and costs nothing. The generation itself is
never automated in CI.

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
- A **preferences config** (household size/servings, meal-prep vs fresh ratio,
  disliked ingredients, staple pantry items assumed on hand) — structured so
  the generator and linter can both read it.

## Open decisions (settle by ADR, tracked as issues)

- The exact shape of the local entry point: a documented prompt, a committed
  Claude Code skill (e.g. `/generate-week`), or a `pnpm generate:week`
  wrapper that launches the session. Start with the simplest thing that
  produces schema-valid output.
- Week boundary, generation day, and timezone.
- How feedback accumulates ("more like this") without turning into a second
  source of truth.
