# Dietary Safety — The Golden Rules

**Read this before writing, generating, or reviewing ANY food content** — meal
plans, recipes, snacks, shopping lists, seed data, tests, or copy. These rules
are the reason this project exists. They are absolute.

**This doc is owner-gated.** Any change to this file is `safe:human` and
requires @tonytino's explicit review — no exceptions, no bypass label. See
`docs/agents/governance.md`.

---

## The three golden rules

1. **100% gluten-free.** Every meal, snack, ingredient, and recipe. No
   exceptions, no "small amounts," no "optional" gluten ingredients.
2. **Absolutely NO cashews or pistachios.** A household member has a
   **life-threatening allergy**. This includes every derived product and any
   product with plausible cross-contact. When in doubt, exclude.
3. **Optimize for anti-inflammatory nutrition.** Prefer ingredients and
   preparations with anti-inflammatory profiles; minimize pro-inflammatory
   ones. This is an optimization target, not a binary — but it is the point of
   the plan, not a nice-to-have.

Rules 1 and 2 are **hard constraints** (a single violation is a critical bug —
treat it like shipping a security vulnerability). Rule 3 is the **objective
function**.

---

## Rule 1: Gluten-free in practice

Forbidden grains and derivatives — never include, in any form:

- Wheat (including whole wheat, wheat berries, wheat germ, wheat bran)
- Barley, rye, triticale
- Spelt, farro, einkorn, emmer, kamut, durum, semolina, couscous, bulgur, freekeh
- Malt in all forms (malt extract, malt vinegar, malted barley, malt syrup)
- Brewer's yeast; beer (unless certified GF, prefer avoiding entirely)

Common hidden-gluten traps — always specify the safe variant:

- **Soy sauce** → use **tamari (certified GF)** or coconut aminos
- **Oats** → only **certified gluten-free oats** (standard oats are
  cross-contaminated)
- Broths/stocks, spice blends, miso, condiments, salad dressings, processed
  meats, "crispy" coatings → specify certified GF products or from-scratch
  versions
- Anything fried in a shared fryer (restaurant guidance) — not applicable to
  home cooking but relevant to any dining-out content

When a recipe calls for flour, pasta, bread, or tortillas, always name the GF
substitute explicitly (e.g. "GF 1:1 flour blend," "brown-rice pasta," "corn
tortillas (certified GF)").

## Rule 2: Cashew & pistachio exclusion in practice

Cashews and pistachios are botanically related (Anacardiaceae) and the allergy
is to both. Never include:

- Cashews, pistachios, in any form: whole, pieces, butters, flours, milks
- **Cashew-based "creams," vegan cheeses, and sauces** — extremely common in
  anti-inflammatory / plant-based recipes; this is the single most likely
  failure mode for generated content. Substitute: sunflower-seed cream,
  coconut cream, or white-bean purée
- Pistachio pastes, pestos with pistachios, baklava-style desserts
- **Mixed nuts or trail mixes** (cross-contact) — only single-nut products
  from dedicated processing when tree nuts are used at all
- Curry pastes/sauces thickened with cashew (common in korma, some Thai
  dishes) — call this out when adapting such cuisines
- **Pink peppercorns** (same plant family — recognized cross-reactivity risk)

Allowed nuts/seeds (when from sources without cashew/pistachio cross-contact):
almonds, walnuts, pecans, macadamia, hazelnuts, peanuts, and all seeds
(pumpkin, sunflower, chia, flax, hemp, sesame). Shopping-list entries for any
tree-nut product must carry the note *"check label: processed in a facility
free of cashew/pistachio cross-contact."*

**The default is exclusion.** If you cannot verify an ingredient or product is
free of cashew/pistachio, do not include it.

## Rule 3: Anti-inflammatory optimization

Prioritize (build meals around these):

- Fatty fish (salmon, sardines, mackerel, trout) — aim for 2+ servings/week
- Extra-virgin olive oil as the default fat
- Leafy greens and cruciferous vegetables; wide variety of colorful vegetables
- Berries and whole fruit
- Legumes and GF whole grains (quinoa, brown rice, buckwheat, millet,
  certified-GF oats)
- Allowed nuts and seeds (per Rule 2)
- Herbs and spices with anti-inflammatory profiles: turmeric (with black
  pepper), ginger, garlic, cinnamon
- Fermented foods (plain yogurt if dairy is tolerated, kimchi, sauerkraut —
  check GF)

Minimize (use sparingly, never as the base of a plan):

- Added sugar and refined sweeteners; sugary drinks
- Refined/ultra-processed foods and refined GF flour products (GF junk food is
  still junk food)
- Fried foods; industrial seed-oil-heavy preparations
- Processed meats; keep red meat occasional
- Alcohol

> The full, generator-facing version of this guidance — distilled from the
> owner's sources (starting with a 2024 NYT article on anti-inflammatory
> eating) — lives in `docs/agents/nutrition-guidelines.md`. Principles and
> food lists only; never republish copyrighted recipe text
> (`docs/agents/governance.md`).

---

## Enforcement

- **Every PR containing food content** must state in its body how the three
  golden rules were checked.
- A deterministic **forbidden-ingredient linter** (CI gate scanning all plan
  and recipe content for gluten and cashew/pistachio terms and their aliases)
  is a planned foundational feature — until it exists, human review of food
  content is mandatory: label food-content PRs `safe:human`.
- The adversarial review loop (`docs/agents/orchestration.md`) includes
  **Dietary safety** as a mandatory review dimension.
