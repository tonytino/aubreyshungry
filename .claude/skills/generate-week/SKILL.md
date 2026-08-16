---
name: generate-week
description: Owner-run weekly meal-plan generation — agree the target week and what is on hand about to spoil with the owner, draft content/weeks/<YYYY-MM-DD>.json plus any new recipes in a local Claude Code session, run the deterministic gates, one adversarial dietary-safety review round, and open the safe:human plan PR. Use when the owner invokes /generate-week to create (or regenerate) a Sunday→Saturday week's plan. Never runs in CI; no metered LLM spend (ADR-007, amended by ADR-008).
---

# Generate Week (Owner-Run, Local Only)

You are drafting one week of published food content. **This is the highest-
stakes content in the repo** — a single golden-rule miss is treated like
shipping a security vulnerability. Work at the most capable model tier
(`docs/agents/orchestration.md`), never delegate food drafting to a smaller
tier, and never run this from CI (ADR-007: generation is covered by the
owner's local subscription — zero metered spend).

Invocation: **bare `/generate-week`** — there is no week argument. You agree
the target week with the owner in step 2 (ADR-008 replaced the old
`[YYYY-Www]` parameter with an interactive prompt).

## 0. The week model — read this before you touch any date

- **A planning week runs Sunday → Saturday.** Not Monday–Sunday, not ISO.
  The household shops and batch-cooks on the weekend, so Sunday morning is
  the real boundary.
- **A week is identified by the calendar date of its starting Sunday**, in
  `YYYY-MM-DD` form: `content/weeks/2026-08-16.json`, whose `weekStart`
  field is `"2026-08-16"`. There is no `isoWeek` field and no `YYYY-Www`
  identifier anywhere — `WeekStartSchema` in `app/content/schema.ts`
  replaced `IsoWeekSchema` and **rejects any date that is not a real
  Sunday**.
- **"Today" always resolves in `America/Denver` (Mountain Time)**, both in
  this skill and in the reminder workflow. This is not cosmetic: the owner
  shops and cooks on Mountain Time, and a UTC "today" silently rolls the
  date forward in the evening (UTC midnight is 5–6 PM in Denver), so a
  Saturday-evening run would compute next week's Sunday and quietly plan
  the wrong week.
- **Never hand-roll a week boundary, and never do date math in the shell.**
  Use the helper script — it is portable, tested, and does the arithmetic
  **and** the Sunday assertion in one call:

  ```bash
  TZ=America/Denver date +%F                   # today, Mountain Time (portable: no date math)
  node scripts/plan-reminder/current-week.mjs  # the Sunday starting the current MT week
  node scripts/plan-reminder/current-week.mjs --next                      # the UPCOMING week — what the reminder checks
  node scripts/plan-reminder/current-week.mjs --from 2026-08-16 --plus 7  # → 2026-08-23
  node scripts/plan-reminder/current-week.mjs --from 2026-08-16 --plus 0  # ⚠️ Sunday assertion
  ```

  `--from <YYYY-MM-DD> --plus <days>` prints the resulting date and **exits
  non-zero, naming the actual weekday, when `--from` is not a Sunday** — so
  `--plus 0` is the confirm-it-is-a-Sunday check and `--plus 7` is the next
  week, both through the tested implementation. ⚠️ **Do NOT use
  `date -d "… +7 days"` or `date -d "…" +%A`.** `-d` as relative-date parsing
  is GNU coreutils only; on BSD/macOS `date`, `-d` means "set daylight saving
  time", the argument is swallowed, and the command **silently prints today**
  — a Sunday check that confirms nothing on the owner's own laptop.

  `app/utils/week-dates.ts` is the TypeScript reference implementation
  (`weekStartDate()`, `formatWeekRange()`, `weekLabel()`).
- **Verify every date you assert is genuinely a Sunday** before you write it
  into a filename, a field, a PR title, or a message to the owner. A
  non-Sunday fails `pnpm validate:content`, but catching it after drafting
  wastes a whole run.

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

**Standing rule — never ask whether a food group is acceptable.** Those three
inputs are the complete answer to "may we serve this?". Assume **every** food
group is fine unless it is already captured as a dietary concern — either the
golden rules forbid it (`docs/agents/dietary-safety.md`) or it appears in
`avoidIngredients` in `content/preferences.json`. Dairy, soy, eggs, nightshades,
fermented foods, red meat, grains, legumes: all in scope by default. Do **not**
open an AskUserQuestion round to confirm one, and do **not** hedge a dish in
prose ("plain yogurt if dairy sits well," "swap the tofu if soy is an issue") —
a hedge is the same question in a different costume, and it pushes the decision
onto the owner at read time. If you genuinely think a food should be off the
menu, the fix is the owner adding it to `avoidIngredients` (soft dislike) or to
the golden rules (hard constraint) — not a question at generation time. The
only questions this skill asks the owner are the two in §2.

Distinguish this from a **label check**, which always stays: "tempeh only if
certified GF" and "kimchi/kombucha labels need a GF check" are Golden Rule 1
checks on a *product*, not permission checks on a *food group*. Never drop
those.

## 2. Ask the owner — the target week, and what needs using up

There is no default and no argument. Work out the candidate weeks (steps 1–4),
then **ask both questions in one AskUserQuestion exchange** (steps 5–6): which
week, and what fresh food is already on hand and about to spoil. One exchange,
two questions — the owner answers once. The week is blocking; the on-hand
question is not.

1. **Find the latest generated week.** List `content/weeks/*.json`; each
   basename is a `weekStart` date, so the **lexicographically highest
   basename is the latest week** (`YYYY-MM-DD` sorts chronologically).
2. **Compute the two base choices** with the helper — one call per date does
   the arithmetic and asserts the Sunday:
   - **Regenerate the last generated week** — `<latest weekStart>`
     (`node scripts/plan-reminder/current-week.mjs --from <latest> --plus 0`).
   - **Generate the next week** — `<latest weekStart + 7 days>`
     (`node scripts/plan-reminder/current-week.mjs --from <latest> --plus 7`).
3. **`content/weeks/` is empty or has no week files** (the state today —
   nothing has been published yet): there is nothing to regenerate, so offer
   instead:
   - **The current Mountain-Time week** — the Sunday on or before today in
     `America/Denver`, i.e. exactly what
     `node scripts/plan-reminder/current-week.mjs` prints, and
   - **The week after it** — that date `--plus 7`.
4. **If a `Plan missing for <date>` reminder issue prompted this run, make
   sure that date is on the menu.** The Thursday reminder
   (`.github/workflows/plan-reminder.yml`) deliberately checks the
   **upcoming** week — the one the owner is about to shop for — and it
   anchors on **today**, not on what is on disk: it computes
   `currentWeekStart() + 7 days` — which is exactly what
   `node scripts/plan-reminder/current-week.mjs --next` prints, so compute it
   rather than trusting a pasted issue title. It usually equals the *generate
   the next week* choice, but **not when a cycle was missed**: with
   `2026-08-09` the latest on disk and the reminder firing for `2026-08-23`,
   the nagged week is in neither base choice. Whenever that date is not
   already among the candidates, **add it as a third option** (assert it is a
   Sunday the same way) and say in the option label that it is the week the
   reminder asked for.
5. **Prompt the owner with the AskUserQuestion tool** — not a question buried
   in prose. The owner runs many parallel sessions and misses inline
   questions (`CLAUDE.md`). Offer the candidates from steps 2–4 — the two
   base choices, plus the reminder's week when step 4 added it — and **no
   invented extras**. Label each with its **literal date and the Sun–Sat
   span** it covers, e.g. "Regenerate 2026-08-16 (Sun Aug 16 – Sat Aug 22)"
   vs "Generate 2026-08-23 (Sun Aug 23 – Sat Aug 29)". If the owner does not
   answer, **re-ask** — an unresponsive owner is busy, not an answer. Never
   guess the target week: generating the wrong week wastes a full
   high-stakes run and pollutes the archive.
   **Put the on-hand question (step 6) in this same AskUserQuestion call** —
   one exchange, two questions, so the owner answers once instead of twice.
6. **Ask what fresh food is already on hand and about to spoil.** The plan
   should eat it. Produce bought before this plan existed gets composted
   otherwise, and waste reduction is the whole point of the question.
   - **Wording**: ask *"What fresh ingredients do you already have that will
     spoil during this week?"* The real answer is a free-form list, so offer
     only a short option set and let the free-text ("Other") path carry the
     substance: **"Nothing on hand / skip"** first, plus one or two common
     cases such as *"Berries or soft fruit"* and *"Leafy greens or fresh
     herbs"*. Say in the question that a typed list beats the presets, and
     that skipping is a fine answer.
   - **A non-answer means SKIP, not guess.** Unlike the week choice, this
     question never blocks generation: if the owner does not answer, draft as
     though nothing is on hand and say so in the PR body. Do not re-ask, do
     not stall the run, and never invent an on-hand list.
   - ⚠️ **The golden rules still win — always.** On-hand input is a soft
     preference and **NEVER** overrides `docs/agents/dietary-safety.md`. This
     is a new channel for owner-supplied ingredients to enter the plan, so
     check it like any other: if the owner names something that breaks
     Rule 1 (gluten) or Rule 2 (cashews/pistachios), or something you cannot
     verify is clear of them, **exclude it and say so in the PR body** —
     name the item and the rule. Never silently drop it, and never work it in
     "just this once because they already bought it".
   - **An `avoidIngredients` match gets confirmed, not assumed.** If an
     on-hand item appears in `avoidIngredients`, do **not** treat merely
     having it as permission to cook it — "I have X" is not "please cook X".
     Ask once, explicitly, naming the item: *"you have X on hand but it is
     listed in avoidIngredients — use it this week anyway?"* This does not
     breach the standing rule in §1: that rule forbids permission checks on a
     whole **food group**, and this is a check on one specific item the owner
     already asked to avoid. Without an answer, leave it out. If the owner
     does say to use it, **name it in the PR body** alongside any Rule 1/2
     exclusions, so the override is visible rather than buried in a diff.
     (`avoidIngredients` holds soft dislikes only — `app/content/preferences.ts`
     is authoritative and says so — but a silent reinstatement is still the
     kind of thing the owner should see.)
   - **Schedule by perishability, most perishable first.** This is the part
     that gets missed. The week runs Sunday→Saturday, and a berry bought
     before the Sunday shop does not survive to Saturday. Rank the on-hand
     items by how fast they turn and place them in that order: berries, soft
     fruit, fresh herbs, leafy greens, mushrooms, cut vegetables, fresh
     fish → **Sunday–Tuesday**; hardier produce (apples, citrus, carrots,
     cabbage, roots, winter squash) can carry the back half. Anything with
     roughly 48 hours left belongs in a Sunday or Monday slot, full stop.
     Placing a use-it-up item late in the week is the same as not using it.
   - **Where they land naturally**: snacks, anything sweet, yogurt-style
     dishes, and finishing touches on meals (a handful scattered over a bowl,
     herbs over a traybake) absorb odd, unknown amounts most easily — but
     they may go anywhere they fit. Do not distort the week around them: the
     preferences targets (fresh-meal floor, fatty fish, ~30 distinct foods)
     and the nutrition-guidelines shape still govern.
   - **Quantities are unknown — never invent a precise amount.** The owner
     said "some blueberries," not "1.5 cups." The schema still needs a
     positive `quantity` and a closed-enum `unit`, so pick a **modest** amount
     that a reasonable on-hand stash satisfies, and put the flexibility in
     prose — a step or the meal `note`: e.g. `1 cup blueberries` with the step
     *"scatter the blueberries over the bowls — use what you have; more or
     less is fine."* Never write a quantity you are guessing at as though it
     were measured.
   - **The shopping list will still list it — tell the owner why.** The
     shopping list is **derived** from recipe ingredients and nothing filters
     it (not even `pantryStaples`), so an on-hand item shows up in the aisle
     list regardless. **Do not shrink a quantity or omit an ingredient to keep
     it off the list** — that silently under-buys for anyone cooking the
     recipe on its own and makes the recipe wrong; the recipe must stand by
     itself. Disclose instead: **name the on-hand items in the week's `notes`
     field** (e.g. *"Planned around the blueberries and spinach you already
     have. They still appear on the shopping list — it is derived from the
     recipes — so cross off whichever you already have enough of."* Say it
     that way rather than "cross these off": you do not know how much the
     owner has left, and a blanket instruction to skip a line can leave the
     week short — the mirror image of the failure this rule guards against.)
     Repeat it in the PR body. The list
     stays honest and the owner is told, in writing, which lines to skip.
7. **If `content/weeks/<weekStart>.json` already exists, you are
   regenerating.** Say so explicitly in the PR body and follow
   `docs/agents/generation.md` → Regeneration. Regeneration replaces that
   file in place (ADR-006: the file always holds the currently-published
   version; superseded versions live in git history).

## 3. Draft the week

Write `content/weeks/<weekStart>.json` and any new
`content/recipes/<slug>.json` files, conforming to `app/content/schema.ts`:

- **Menu**: `Meal` entries (`recipeSlug`, `days`, optional `note`) meeting
  the preferences targets — meal-prep as the backbone, at least
  `freshMealsPerWeekMin` fresh meals, at least `fattyFishMealsPerWeekMin`
  fatty-fish meals. **Reuse existing recipe files** where a dish repeats
  (same slug — that is what makes variety tracking work). Do **not** edit an
  existing recipe as part of generation — per ADR-006 that regenerates every
  published week referencing it; if the dish should change going forward,
  create a new recipe under a new slug.
- **Days are Sunday-first**: `days` values come from the closed `DAYS` enum
  in `app/content/schema.ts`, ordered `sunday` → `saturday`. That order is
  the display order of the menu-by-day view. Plan with the real rhythm:
  Sunday is the shop-and-batch-cook day that opens the week, so meal-prep
  dishes are cooked Sunday and cover the days that follow, and the fresh
  meals carry the back half of the week.
- **Use-it-up items go early.** Every on-hand ingredient the owner named in
  §2 step 6 is placed by perishability, most perishable first — a Saturday
  slot for berries that were already a few days old on Sunday is a wasted
  plan. Snacks, sweet things, yogurt-style dishes, and finishing touches are
  the easiest homes for an unknown amount. The golden rules still filter this
  list first, and the quantity/shopping-list rules in §2 step 6 apply.
- **Snacks**: `snacksPerWeekTarget` slugs referencing `style: "snack"`
  recipes, drawn from the nutrition-guidelines prioritize list.
- **Every recipe**: structured `ingredients` only (name, positive quantity,
  unit from the **closed `UNITS` enum**, `section` from `STORE_SECTIONS`) —
  never bury an ingredient in prose; numbered `steps`; `storageNotes`
  (required for `meal-prep` style: storage + reheating); `goldenRuleCallouts`
  naming the safety-relevant choices (e.g. "use certified-GF tamari").
- **Filenames are identity**: `<weekStart>.json` / `<slug>.json` must match
  the `weekStart` / `slug` field — `content/weeks/2026-08-16.json` must
  contain `"weekStart": "2026-08-16"`, and that date must be a Sunday. Menu
  refs must be `meal-prep`/`fresh` recipes, snack refs must be `snack`
  recipes; every slug must resolve.
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
- **Prose fields are linted too**: the linter scans EVERY string value and
  key in content JSON (`goldenRuleCallouts`, `notes`, `steps`, `safetyNote`,
  titles, ingredient names — all of it), so all prose must itself be
  linter-clean — name the safe substitute ("use certified-GF tamari"),
  never the forbidden ingredient ("no soy sauce" would trip the linter
  even as a warning).
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

`content/weeks/2026-08-16.json` — **2026-08-16 is a Sunday**; the file name
and the `weekStart` field are the same date, and the week it names runs
Sun 16 Aug through Sat 22 Aug:

```json
{
  "weekStart": "2026-08-16",
  "menu": [
    {
      "recipeSlug": "salmon-quinoa-power-bowls",
      "days": ["sunday", "wednesday"],
      "note": "Batch-cooked Sunday; covers Sunday dinner and Wednesday lunch."
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
round below, not deterministically. It DOES check that the file name matches
`weekStart` and that `weekStart` is a real Sunday. If `lint:dietary` flags
something you believe is safe, the fix is the owner-gated allowlist
(`scripts/dietary-safety/terms.mjs`, `safe:human`) — never rewording safety
text to dodge the scanner, and never shipping red.

## 5. Adversarial dietary-safety review (mandatory — never skip-review)

Run **one review round** per `docs/agents/orchestration.md`: dispatch a
**fresh subagent** at the **most capable tier** with an adversarial mandate
against the full diff. The **Dietary safety** dimension is mandatory (any
finding is automatically a `blocker`); also probe correctness (targets met,
slugs resolve, the week identifier is the right Sunday), copyright, and
variety. Fix confirmed findings and re-run the gates; record the reviewer's
verdict (the JSON schema in orchestration.md) for the PR body. Food content
**never** uses `skip-review`.

## 6. Ship — the session opens the PR; the owner merges

1. **Branch: stay on the branch this session is already on.** There is no
   mandated branch name (ADR-008 dropped the old `plan-<isoweek>`
   requirement — it created friction and bought nothing). The one exception:
   if the session is sitting on `main`, create a branch first, named
   sensibly — `plan-<weekStart>` (e.g. `plan-2026-08-16`), or
   `issue-<NUMBER>-plan-<weekStart>` when a reminder issue covers this week.
2. **PR title: `feat(plan): week of <weekStart>`** — e.g.
   `feat(plan): week of 2026-08-16`; for a regeneration,
   `feat(plan): regenerate week of 2026-08-16`. Both satisfy the pr-title
   gate in `.github/workflows/pr-conventions.yml`, whose regex is
   `^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\([a-z0-9./-]+\))?!?: .+`
   — `feat` is an allowed type, `(plan)` is a legal lowercase scope, and
   everything after `: ` is free text (the date's digits and hyphens are
   fine). ⚠️ A bare `plan: 2026-08-16` fails the gate (`plan` is not a
   type), and so does a title whose scope carries the date
   (`feat(plan/2026-08-16):` is legal by the regex but pointlessly
   duplicates it — keep the date in the description).
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
   - **On-hand items** (§2 step 6): which ones the plan uses and on which
     days, and — when the owner named something the golden rules forbid —
     **which items were excluded and which rule they broke**. Never let an
     excluded item vanish silently; the owner bought it and needs to know it
     is not in the plan and why. Note that on-hand items still appear on the
     derived shopping list so the owner can cross them off. If the owner
     skipped the question, say the plan assumed nothing on hand.
   - If this is a **regeneration**, say so and name what changed and why
     (`docs/agents/generation.md` → Regeneration).
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
