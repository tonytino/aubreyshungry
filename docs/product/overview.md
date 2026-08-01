# Product Overview

## Mission

Make it effortless to feed Aubrey well. Every week, the site publishes a
complete plan for the household's food: what to buy, what to cook, and what to
snack on — with every item **gluten-free**, **free of cashews and
pistachios**, and **optimized for anti-inflammatory nutrition** (the golden
rules: `docs/agents/dietary-safety.md`).

The person doing the shopping and cooking should be able to open the current
week's page, take the shopping list to the store, and cook from the recipes —
zero daily decision-making required for the person being fed.

## What the site is

A free, public, statically-hostable (Vercel) **blog-style weekly digest**:

- **One page per week** — the current week front and center, past weeks
  browsable as an archive (history is a first-class feature).
- Each weekly plan contains:
  - **Shopping list** — every ingredient needed for the week, aggregated
    across recipes, organized for shopping ease (by store section), with
    quantities.
  - **Meals** — a weekly menu weighted toward **meal-prep-friendly batch
    recipes**, deliberately mixed with a few **fresh, quick meals** (salads,
    smoothies, simple skillets) so the week never feels like pure logistics.
  - **Snacks** — healthy, golden-rule-compliant snack options for the
    household (adults and a child).
  - **Recipes** — full instructions for everything on the menu. Original
    recipes only (see copyright rules in `docs/agents/governance.md`).

## How plans get made

Generation is **automated and reviewable**, not hand-written:

1. A scheduled GitHub Actions workflow generates the next week's plan.
2. The generated plan lands as a **pull request**, never a direct publish.
3. CI gates the PR — most critically the **forbidden-ingredient linter**
   (gluten + cashew/pistachio aliases) once built.
4. Merge publishes; Vercel deploys.
5. **Regeneration**: if a week's plan misses (item out of stock, meal didn't
   land), the workflow can be re-run for that week, or an agent session edits
   the plan through the same PR + gates path.

Full pipeline design: `docs/agents/generation.md`.

## Who it's for

Primarily this household. But the site is public on purpose: other people
cooking gluten-free and anti-inflammatory (with or without the nut
restrictions) may find the weekly plans useful. Nothing personal or medical
beyond the dietary constraints themselves is ever published.

## Non-goals (v1)

- No user accounts, comments, or community features.
- No nutrition-tracking / calorie-counting app mechanics.
- No medical claims. The site describes a household's meal plan, not medical
  advice.
- No paid content or monetization.

## How work happens

This repo is **agent-first**: GitHub Issues are the project-management state
machine (`docs/agents/tasks.md`), orchestrator agents dispatch and
adversarially review worker output (`docs/agents/orchestration.md`), and
`safe:agent` work self-merges on green CI while owner-gated surfaces require
@tonytino (`docs/agents/governance.md`).
