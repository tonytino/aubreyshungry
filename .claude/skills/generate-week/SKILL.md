---
name: generate-week
description: Owner-run weekly meal-plan generation — draft content/weeks/<ISO-week>.json plus any new recipes in a local Claude Code session, run the deterministic gates, one adversarial dietary-safety review round, and open the safe:human plan PR. Use when the owner invokes /generate-week [YYYY-Www] to create (or regenerate) a week's plan. Never runs in CI; no metered LLM spend (ADR-007).
---

# Generate Week (Owner-Run, Local Only)

You are drafting one week of published food content. **This is the highest-
stakes content in the repo** — a single golden-rule miss is treated like
shipping a security vulnerability. Work at the most capable model tier
(`docs/agents/orchestration.md`), never delegate food drafting to a smaller
tier, and never run this from CI (ADR-007: generation is covered by the
owner's local subscription — zero metered spend).

Invocation: `/generate-week` (defaults to **next** ISO week) or
`/generate-week 2026-W34` (explicit target week).

## 1. Read the inputs — in this order

1. **`docs/agents/dietary-safety.md` — read it verbatim, in full, every run.**
   The three golden rules are absolute; rules 1–2 are hard constraints, rule 3
   is the objective function. Nothing below overrides it.
2. `docs/agents/nutrition-guidelines.md` — how to apply rule 3: build around
   the prioritize table, fatty fish 2+ meals/week, ~30 distinct foods,
   turmeric/ginger/garlic-forward defaults, snacks from the prioritize list.
3. `content/preferences.json` via the schema — run `pnpm validate:content`
   and read the file (schema: `app/content/preferences.ts`). It gives you
   `servingsPerMeal`, `freshMealsPerWeekMin`, `snacksPerWeekTarget`,
   `fattyFishMealsPerWeekMin`, `distinctFoodsPerWeekTarget`, `pantryStaples`
   (generator context only — it never filters the shopping list), and
   `avoidIngredients` (soft dislikes only — NEVER a safety mechanism). If the
   file is absent, ask the owner before assuming defaults.
4. **ALL** existing `content/weeks/*.json` plus every recipe they reference —
   for variety. Compare recipe slugs: do **not** repeat last week's mains;
   rotate proteins, grains, and vegetables across recent weeks; count the
   distinct whole foods in your draft and push toward the
   `distinctFoodsPerWeekTarget` (~30).

## 2. Determine the target week

- Default: the ISO week **after** the current UTC ISO week
  (`node scripts/plan-reminder/current-iso-week.mjs` prints the current one).
- Override: an argument in `YYYY-Www` form (e.g. `2026-W34`).
- `app/utils/iso-week.ts` is the reference implementation for week
  boundaries (Monday-start, Jan-4 anchor); `IsoWeekSchema` in
  `app/content/schema.ts` rejects impossible weeks (e.g. W53 in a 52-week
  year).
- If `content/weeks/<week>.json` already exists, you are **regenerating**:
  say so in the PR body and follow `docs/agents/generation.md` →
  Regeneration.

## 3. Draft the week

Write `content/weeks/<isoWeek>.json` and any new
`content/recipes/<slug>.json` files, conforming to `app/content/schema.ts`:

- **Menu**: `Meal` entries (`recipeSlug`, `days`, optional `note`) meeting
  the preferences targets — meal-prep as the backbone, at least
  `freshMealsPerWeekMin` fresh meals, at least `fattyFishMealsPerWeekMin`
  fatty-fish meals. **Reuse existing recipe files** where a dish repeats
  (same slug — that is what makes variety tracking work). Do **not** edit an
  existing recipe as part of generation — per ADR-006 that regenerates every
  published week referencing it; if the dish should change going forward,
  create a new recipe under a new slug.
- **Snacks**: `snacksPerWeekTarget` slugs referencing `style: "snack"`
  recipes, drawn from the nutrition-guidelines prioritize list.
- **Every recipe**: structured `ingredients` only (name, positive quantity,
  unit from the **closed `UNITS` enum**, `section` from `STORE_SECTIONS`) —
  never bury an ingredient in prose; numbered `steps`; `storageNotes`
  (required for `meal-prep` style: storage + reheating); `goldenRuleCallouts`
  naming the safety-relevant choices (e.g. "use certified-GF tamari").
- **Filenames are identity**: `<isoWeek>.json` / `<slug>.json` must match
  the `isoWeek` / `slug` field; menu refs must be `meal-prep`/`fresh`
  recipes, snack refs must be `snack` recipes; every slug must resolve.
- **Tree nuts**: every tree-nut ingredient must carry the mandated
  cross-contact note **verbatim** from `docs/agents/dietary-safety.md` in
  its `safetyNote`: "check label: processed in a facility free of
  cashew/pistachio cross-contact".
  **⚠️ Issue #16:** that mandated wording itself currently trips
  `pnpm lint:dietary` when it appears under `content/`. Until #16 resolves
  (owner-gated allowlist fix), **prefer avoiding tree-nut ingredients
  entirely** — use seeds (pumpkin, sunflower, chia, flax, hemp, sesame)
  instead. NEVER weaken, truncate, or omit the safety note to get a green
  linter — safety text is never scrubbed to pass a gate.
- **Prose fields are linted too**: `goldenRuleCallouts`, `notes`, `steps`,
  and `safetyNote` text must itself be linter-clean — name the safe
  substitute ("use certified-GF tamari"), never the forbidden ingredient
  ("no soy sauce" would trip the linter even as a warning).
- Watch the top failure modes: cashew-based "creams"/vegan cheeses in
  anti-inflammatory recipes (substitute sunflower-seed cream, coconut cream,
  or white-bean purée), soy sauce (always "tamari (certified GF)"), bare
  "flour"/"pasta"/"bread"/"noodles"/"tortillas"/"oats" (always the GF
  qualifier), spice blends and broths (certified GF or from scratch).
- Recipes are **original content** — never republish copyrighted recipe text
  (`docs/agents/governance.md`).

### Shape reference (compact, schema-valid, golden-rule-clean)

`content/recipes/salmon-quinoa-power-bowls.json`:

```json
{
  "slug": "salmon-quinoa-power-bowls",
  "title": "Salmon Quinoa Power Bowls",
  "servings": 4,
  "prepMinutes": 15,
  "cookMinutes": 25,
  "style": "meal-prep",
  "ingredients": [
    { "name": "salmon fillet", "quantity": 1.5, "unit": "lb", "section": "protein" },
    { "name": "quinoa", "quantity": 1.5, "unit": "cup", "section": "pantry" },
    { "name": "baby spinach", "quantity": 5, "unit": "oz", "section": "produce" },
    { "name": "blueberries", "quantity": 1, "unit": "cup", "section": "produce" },
    { "name": "extra-virgin olive oil", "quantity": 3, "unit": "tbsp", "section": "pantry" },
    { "name": "ground turmeric", "quantity": 1, "unit": "tsp", "section": "spices" },
    { "name": "black pepper", "quantity": 0.5, "unit": "tsp", "section": "spices" }
  ],
  "steps": [
    "Cook the quinoa; spread to cool.",
    "Rub the salmon with olive oil, turmeric, and black pepper; roast at 400F until it flakes, about 12 minutes.",
    "Portion quinoa, spinach, blueberries, and salmon into four containers; finish with olive oil."
  ],
  "storageNotes": "Refrigerate up to 3 days. Reheat salmon and quinoa gently (low power); add spinach and blueberries cold after reheating.",
  "goldenRuleCallouts": [
    "Naturally gluten-free; keep it that way — add-ins must be certified GF.",
    "Fatty fish + turmeric with black pepper: anti-inflammatory anchors for the week."
  ]
}
```

`content/weeks/2026-W34.json`:

```json
{
  "isoWeek": "2026-W34",
  "menu": [
    {
      "recipeSlug": "salmon-quinoa-power-bowls",
      "days": ["monday", "wednesday"],
      "note": "Prep Sunday; covers two lunches."
    }
  ],
  "snacks": [],
  "notes": "Example shape only — a real week meets the preferences targets (fresh meals, snacks, fatty fish, ~30 distinct foods)."
}
```

## 4. Self-check gates — all green before any PR, in this order

```bash
pnpm validate:content   # schemas + referential integrity (+ preferences FILE SHAPE only)
pnpm lint:dietary       # deterministic golden-rule linter
pnpm preflight          # biome + tsc + full vitest
```

Fix content until all three pass. Note the gates' limits: `validate:content`
checks the preferences file's shape, NOT that your draft meets the
preferences targets (fresh-meal floor, fatty fish, snacks, ~30 distinct
foods) — meeting the targets is verified by you and the adversarial review
round below, not deterministically. If `lint:dietary` flags something you
believe is safe, the fix is the owner-gated allowlist
(`scripts/dietary-safety/terms.mjs`, `safe:human`) — never rewording safety
text to dodge the scanner, and never shipping red.

## 5. Adversarial dietary-safety review (mandatory — never skip-review)

Run **one review round** per `docs/agents/orchestration.md`: dispatch a
**fresh subagent** at the **most capable tier** with an adversarial mandate
against the full diff. The **Dietary safety** dimension is mandatory (any
finding is automatically a `blocker`); also probe correctness (targets met,
slugs resolve), copyright, and variety. Fix confirmed findings and re-run the
gates; record the reviewer's verdict (the JSON schema in orchestration.md)
for the PR body. Food content **never** uses `skip-review`.

## 6. Ship — the session opens the PR; the owner merges

1. Branch: `plan-<isoweek>` (e.g. `plan-2026-W34`), from up-to-date `main`.
2. PR title: **`feat(plan): <isoweek>`** (e.g. `feat(plan): 2026-W34`) —
   this satisfies the pr-title gate regex in
   `.github/workflows/pr-conventions.yml` (a bare `plan: …` prefix fails it).
3. PR body (template: `.github/pull_request_template.md`):
   - **TL;DR** — 1–3 plain sentences; the plain-language gate is strict here
     (max 25 words per sentence, active voice, simple words).
   - The **mandatory golden-rule statement** (dietary-safety.md →
     Enforcement): state how EACH of the three rules was checked for this
     content (e.g. rule-by-rule: linter run + manual ingredient sweep +
     anti-inflammatory rationale).
   - **`## Adversarial review`** — paste the reviewer's verdict including
     `overall: SHIP` (or the escalation block; a `CONFIRMED` blocker never
     ships).
   - Check the Propagation box for `skip-changelog` (see label rationale
     below).
4. Labels: `safe:human` + `review:adversarial-passed` + `status:needs-review`
   + `skip-changelog`.
   - `safe:human`: all food content is owner-reviewed
     (`docs/agents/governance.md`) — the owner-review CI gate will demand it
     anyway.
   - `skip-changelog`: a weekly content publish changes no template behavior,
     and `changelog.d/README.md` requires fragments only as changelog
     entries for the template/instances — content publishes warrant none. If
     a future plan PR DOES change template behavior (schema, tooling), add a
     fragment for that part instead of the label.
5. Drive CI green (babysit the checks), then **stop**. The owner reviews the
   diff and clicks merge — this session **never** merges (or enables
   auto-merge on) a `safe:human` PR. After merge, Vercel deploys and the
   week is live.
