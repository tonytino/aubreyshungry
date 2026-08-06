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

## The pipeline (target design)

```
GitHub Actions cron (weekly, e.g. Thu — before weekend shopping)
  └─> generate job: LLM (ANTHROPIC_API_KEY secret) + generation prompt
        • inputs: golden rules doc, nutrition guidelines, recent weeks
          (variety — don't repeat last week), household preferences config
        • output: structured week content (schema-validated with Zod)
  └─> open PR "plan: 2026-W32"
        • CI: forbidden-ingredient linter, schema validation, build, tests
        • label per governance: safe:human while the linter is unproven;
          may graduate to safe:agent later (owner decision)
  └─> merge → Vercel deploys → the week is live
```

## Regeneration / editing

- **Full regen:** `workflow_dispatch` on the generation workflow with a week
  parameter (and optional feedback input, e.g. "no salmon this week —
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

- **Content storage:** settled — see
  `docs/decisions/006-content-storage-files-in-repo.md`. Files-in-repo for
  v1: Zod-validated JSON at `content/weeks/<ISO-week>.json` plus a shared
  recipe library `content/recipes/<slug>.json`; the DB stays available for
  later features (search, tagging).
- **Generator runtime:** direct Claude API call from a workflow script vs a
  Claude Code agent session. Start with the simplest thing that produces
  schema-valid output.
- Week boundary, generation day, and timezone.
- How feedback accumulates ("more like this") without turning into a second
  source of truth.
