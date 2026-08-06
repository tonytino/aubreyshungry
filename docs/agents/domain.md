# Domain Model

The vocabulary and shapes every agent should use when working on meal-plan
content or features. Read `docs/agents/dietary-safety.md` first — every entity
below is constrained by the golden rules.

---

## Entities

### Week (the unit of publication)

A `Week` is one published weekly plan — the atom of the site. Identified by
ISO week (e.g. `2026-W32`). A week has:

- **status** — `draft` (open PR) → `published` (merged) → optionally
  `regenerated` (superseded by a re-run; history preserved via git)
- **menu** — the list of `Meal`s planned for the week
- **snacks** — a list of `Snack`s for the week
- **shoppingList** — derived by aggregating ingredients across the menu +
  snacks (never hand-maintained independently of the recipes)
- **notes** — optional context ("salmon was great, repeat"; "prep Sunday")

### Meal

A planned eating occasion. Fields: recipe reference, day(s) it covers, and a
**style**:

- `meal-prep` — batch-cooked ahead, portioned for multiple days. The default;
  the plan optimizes for this.
- `fresh` — made day-of in under ~20 minutes (salad, smoothie, simple
  skillet). Every week includes some of these so the plan doesn't collapse
  into pure logistics.

### Recipe

Original instructions for one dish. Fields: title, servings, prep/cook time,
style (`meal-prep` | `fresh` | `snack`), ingredient list (structured — see
`Ingredient`), steps, storage/reheating notes for meal-prep recipes, and
golden-rule callouts (e.g. "use certified-GF tamari").

Recipes are **original content**. Adapting general techniques is fine;
republishing a copyrighted recipe's text (NYT Cooking or anywhere else) is
not. See `docs/agents/governance.md`.

### Ingredient

A structured line item: name, quantity, unit, store section (produce, protein,
pantry, frozen, dairy…), and optional safety note ("check label: no
cashew/pistachio cross-contact"). Structured ingredients are what make the
shopping-list aggregation and the forbidden-ingredient linter possible —
**never bury ingredients in prose**.

### Snack

A lightweight recipe (or a buy-this product with a safety note) intended for
between-meal eating. Same golden rules, same structured ingredients.

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

## Open questions (tracked as issues, not settled here)

- **Storage**: settled — see
  `docs/decisions/006-content-storage-files-in-repo.md`. Content files live
  in-repo as Zod-validated JSON (`content/weeks/<ISO-week>.json` +
  `content/recipes/<slug>.json`, weeks referencing recipes by slug);
  Neon/Drizzle stays reserved for later features (search, tagging).
- Week boundaries and generation day (generate Thu/Fri for weekend shopping?).
- Household serving sizes and portion math.
