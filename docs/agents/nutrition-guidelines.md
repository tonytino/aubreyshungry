# Nutrition Guidelines — Anti-Inflammatory Eating

The evidence-based guidance that feeds weekly plan generation
(`docs/agents/generation.md`). This doc operationalizes **Golden Rule 3**
(anti-inflammatory optimization) from `docs/agents/dietary-safety.md` — read
that first; Rules 1–2 (gluten-free, no cashews/pistachios) always override
anything here.

Primary source: *"The Foods That Fight Inflammation"*, The New York Times,
Sept. 18, 2024 (Jillian Pretzel) — guidance distilled with the experts'
consensus points; no article text is republished. Additional sources may be
added over time; keep the source list current.

---

## Core principles

1. **Variety is the mechanism.** Different nutrients fight inflammation
   through different pathways (fiber → gut microbiome → immune signaling;
   antioxidants → reduced oxidation; omega-3s → resolvins/protectins). There
   is no magic-bullet food. **Target: ~30 different foods per week** — the
   generator should track distinct-food count across the week's plan and
   favor rotation across weeks.
2. **Fiber feeds the gut microbiome**, which signals the immune system to
   keep inflammation down. Vegetables, fruits, and legumes in most meals.
3. **Displace, don't just add.** Diets high in highly processed and sugary
   foods are associated with chronic inflammation — the plan's job is to
   crowd those out, not to sprinkle superfoods on top of them.

## Build meals around (the prioritize list)

**Every group below is in scope by default — never ask whether one is
acceptable.** A food is off the menu for exactly two reasons: the golden rules
forbid it (`docs/agents/dietary-safety.md`) or it is listed in
`avoidIngredients` in `content/preferences.json`. Nothing here is conditional
on checking with the household, and generated content must not hedge in prose
either ("… if dairy sits well," "swap the tofu if soy is an issue") — a hedge
is the same question moved to read time. The **golden-rule notes** column is a
different thing and always applies: those are **label checks on a product**
("is this brand of tempeh gluten-free?"), not permission checks on a food
group.

| Group | Specifics for our plans | Golden-rule notes |
| --- | --- | --- |
| **Vegetables, esp. leafy greens** | Spinach, kale, collards, broccoli, Swiss chard, arugula; also apigenin-rich celery, carrots, parsley. Work greens into sauces, eggs, soups — not just salads. | — |
| **Fruits, esp. berries** | Blueberries, tart cherries, mixed berries; citrus for vitamin C. Great snack backbone. | — |
| **Legumes** | Beans, lentils, chickpeas, edamame, tofu; hummus/bean spreads with veg; roasted chickpeas as a snack. | **Tempeh only if certified GF** — some brands include barley or other gluten grains. Check canned/spread labels. |
| **Omega-3 sources** | Fatty fish (salmon, herring, mackerel, sardines, trout; tuna occasionally), eggs, walnuts, flax, hemp, chia. Nut butter on apple slices; ground flax into yogurt or GF oatmeal. | Nut butters: almond, peanut, or sunflower **only** — never cashew butter (Golden Rule 2); prefer brands free of cashew/pistachio cross-contact. Oats: certified GF only. |
| **Spices & aromatics** | Turmeric (curcumin; pair with black pepper), ginger, garlic, cardamom, cinnamon — use generously and routinely, not decoratively. | Buy single-ingredient spices; spice *blends* need a GF label check. |
| **Fermented foods** | Plain yogurt, kimchi, sauerkraut, kombucha — evidence is promising (reduced inflammatory markers in a small 2021 study) though still maturing; treat as a nice-to-include, not a pillar. | No added-sugar varieties. Kimchi/kombucha labels need a GF check (soy sauce, barley malt appear in some brands). |
| **Coffee & tea** | Fine in moderation; antioxidant-rich. | Unsweetened — no added sugar. |

## Minimize (the displace list)

- Highly processed foods — **including gluten-free junk food**; GF processed
  snacks are still processed snacks
- Added sugar in all forms: sugary drinks, sweetened yogurts/kombuchas,
  desserts as routine
- Refined-flour products (refined GF flours included)
- Fried and heavily processed preparations; processed meats

## How the generator should apply this

1. Golden Rules 1–2 filter first; this doc shapes what remains.
2. Every day of the plan includes vegetables + at least one other prioritize
   group; fatty fish appears 2+ times per week.
3. Count distinct whole foods across the week; push toward ~30 and rotate
   choices week over week (also keeps the plan from getting boring).
4. Snacks come from the prioritize list too (berries, roasted chickpeas,
   allowed-nut butters on fruit, veg + hummus) — snacks are where processed
   food sneaks in.
5. Spices are a cheap win: default recipes toward turmeric/ginger/garlic-
   forward flavors.

## Changing this doc

Dietary-safety adjacent → **`safe:human`**, owner reviews changes. When
adding a new source, distill principles and food lists only; never republish
copyrighted recipe or article text (`docs/agents/governance.md`).
