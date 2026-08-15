# Domain Model

The vocabulary and shapes every agent should use when working on meal-plan
content or features. Read `docs/agents/dietary-safety.md` first — every entity
below is constrained by the golden rules.

---

## Entities

**The Zod schemas in `app/content/schema.ts` are the source of truth for
these shapes** (with `app/content/validate.ts` as the storage-adapter seam
from ADR-006). The descriptions below are the plain-language map; if they
ever disagree with the schemas, the schemas win — fix this doc.

### Week (the unit of publication)

A `Week` is one published weekly plan — the atom of the site. Identified by
ISO week (e.g. `2026-W32`). A week has:

- **isoWeek** — the identifier, `YYYY-Www` (week 01–53); also the filename
- **menu** — the list of `Meal`s planned for the week (non-empty)
- **snacks** — recipe slugs of snack recipes for the week (may be empty)
- **notes** — optional context ("salmon was great, repeat"; "prep Sunday")

There is deliberately **no `status` field** and **no stored shopping list**:

- Published = merged to `main` (ADR-006). A draft is an open PR;
  supersession is git history. A stored status could only drift from that
  reality, so the schema omits it.
- The shopping list is always derived from the referenced recipes at build
  time (see below), never stored.

### Meal

A planned eating occasion within a week's menu. Fields: **recipeSlug**
(reference to the recipe library), **days** it covers (non-empty, no
duplicates), and an optional **note**. Its style — meal-prep vs fresh —
comes from the referenced recipe, not the meal:

- `meal-prep` — batch-cooked ahead, portioned for multiple days. The default;
  the plan optimizes for this.
- `fresh` — made day-of in under ~20 minutes (salad, smoothie, simple
  skillet). Every week includes some of these so the plan doesn't collapse
  into pure logistics.

### Recipe

Original instructions for one dish. Fields: slug (kebab-case, stable
identifier and filename), title, servings, prep/cook time, style
(`meal-prep` | `fresh` | `snack`), ingredient list (structured — see
`Ingredient`), steps, storage/reheating notes (**required** for meal-prep
recipes, optional otherwise), and golden-rule callouts (e.g. "use
certified-GF tamari").

Recipes are **original content**. Adapting general techniques is fine;
republishing a copyrighted recipe's text (NYT Cooking or anywhere else) is
not. See `docs/agents/governance.md`.

### Ingredient

A structured line item: name, quantity (positive number), unit (a closed
enum of canonical units, with `""` meaning a bare count — free-text units
would silently split shopping-list merge groups, so new units are added to
the enum via PR), store section (produce, protein, dairy, pantry, spices,
frozen, other), and optional safety note ("check label: no cashew/pistachio
cross-contact"). Structured ingredients are what make the shopping-list
aggregation and the forbidden-ingredient linter possible — **never bury
ingredients in prose**.

### Snack

A lightweight recipe (or a buy-this product with a safety note) intended for
between-meal eating. Same golden rules, same structured ingredients. In the
schema, a week's `snacks` are slugs referencing recipes with
`style: "snack"`; whether buy-this products get recipe-library entries or a
dedicated shape is still open (ADR-006 → "deliberately left open").

### Shopping list

A derived view: all ingredients for the week's meals + snacks, merged by name
and unit, grouped by store section. Print-friendly and phone-friendly (it gets
used inside a grocery store).

---

## Invariants

1. Every ingredient in every entity passes the golden rules
   (`docs/agents/dietary-safety.md`). No exceptions, including seed/test data.
2. The shopping list is always derivable from the week's recipes — if they
   disagree, the recipes are the source of truth.
3. Weeks are immutable once published except through the regeneration flow
   (PR + CI gates), so the archive is a trustworthy history.
4. All content shapes are validated with Zod at the boundary (see the stack
   rules in `AGENTS.md`).

---

## Storage (settled — ADR-006)

Content lives in-repo as Zod-validated JSON: one file per published week at
`content/weeks/<ISO-week>.json` plus a shared recipe library at
`content/recipes/<slug>.json`, referenced by slug. Git is the history;
Neon/Drizzle is reserved for later features (search, tagging). Full rationale,
layout, immutability rules, and the DB migration path:
`docs/decisions/006-content-storage-files-in-repo.md`.

---

## Open questions (tracked as issues, not settled here)

- Week boundaries and generation day (generate Thu/Fri for weekend shopping?).
- Household serving sizes and portion math.
- **Batch multiplier (for the #6 aggregation spec):** `Meal` has no
  multiplier — a recipe's quantities are always taken at 1x. If "make a
  double batch" becomes a real need, add an optional `multiplier` field to
  `MealSchema` (positive, default 1); it is an additive, non-breaking
  schema change.
- **Count-unit sizes (for the #6 aggregation spec):** count-ish units
  (`can`, `jar`, `package`) carry the size in the ingredient *name* by
  convention (e.g. "diced tomatoes (14.5 oz can)"). Aggregation merges on
  exact (name, unit), so consistent naming is what keeps two 14.5 oz cans
  merging correctly; a structured size field is a possible later addition.
