/**
 * Content schemas — the domain model for weeks, meals, recipes, and
 * ingredients as Zod schemas with inferred TypeScript types.
 *
 * This file is the source of truth for content shapes (see
 * `docs/agents/domain.md` and ADR-006). Every content boundary — generation
 * output, CI validation, and the site build — validates against these
 * schemas. Content lives in-repo as JSON: `content/weeks/<weekStart>.json`
 * and `content/recipes/<slug>.json`.
 *
 * Design decisions recorded here so they aren't re-litigated:
 *
 * - **A week runs Sunday→Saturday and is identified by its starting
 *   Sunday's date (`weekStart`, `YYYY-MM-DD`).** The household shops and
 *   batch-cooks on the weekend, so the plan's natural boundary is Sunday
 *   morning, not the ISO Monday. A plain calendar date also reads
 *   unambiguously in a URL and a filename, which `2026-W34` does not.
 *
 * - **Units are a closed enum (plus `""` for countable items), not free
 *   text.** The shopping list (issue #6) merges ingredients by exact
 *   (name, unit) pairs; free-text units ("Tbsp" vs "tablespoon") silently
 *   split merge groups and produce a wrong list. A closed enum turns a unit
 *   typo into a validation error instead. The escape hatch is deliberate
 *   friction: extend `UNITS` via PR when a genuinely new unit is needed.
 *
 * - **`storageNotes` is required for `meal-prep` recipes** (enforced by
 *   refinement). Batch-cooked food eaten over several days makes storage
 *   and reheating instructions load-bearing, not optional. For `fresh` and
 *   `snack` styles it stays optional.
 *
 * - **Week has NO `status` field.** ADR-006 defines published as "merged to
 *   main": a draft is an open PR, and supersession is git history
 *   (`git log -- content/weeks/<week>.json`). A stored status could only
 *   drift from that reality, so it is dropped entirely.
 */

import { z } from "zod";

/**
 * Canonical measurement units. `""` means a bare count of the named item
 * (e.g. quantity 2, unit "", name "avocado"). Extend via PR — see the
 * design note above before reaching for free text.
 */
export const UNITS = [
  "",
  "g",
  "kg",
  "ml",
  "l",
  "tsp",
  "tbsp",
  "cup",
  "oz",
  "lb",
  "bunch",
  "can",
  "clove",
  "head",
  "jar",
  "package",
  "piece",
  "pinch",
  "slice",
  "sprig",
  "stalk",
] as const;

export const UnitSchema = z.enum(UNITS);

/** Store sections used to group the shopping list. */
export const STORE_SECTIONS = [
  "produce",
  "protein",
  "dairy",
  "pantry",
  "spices",
  "frozen",
  "other",
] as const;

export const StoreSectionSchema = z.enum(STORE_SECTIONS);

/**
 * Days a meal can cover, in week order. Sunday-first because a planning
 * week runs Sunday→Saturday (see the `weekStart` note above) — this array's
 * order IS the display order for the menu-by-day view, so it must match the
 * week the identifier names or Sunday's meal-prep batch would render last.
 */
export const DAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

export const DaySchema = z.enum(DAYS);

/** Recipe styles — see `docs/agents/domain.md` for what each means. */
export const RECIPE_STYLES = ["meal-prep", "fresh", "snack"] as const;

export const RecipeStyleSchema = z.enum(RECIPE_STYLES);

/**
 * Recipe slugs are stable identifiers and file basenames
 * (`content/recipes/<slug>.json`), so they are strict kebab-case.
 */
const KEBAB_CASE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const RecipeSlugSchema = z
  .string()
  .regex(KEBAB_CASE, "must be kebab-case (lowercase letters, digits, single hyphens)");

/**
 * A structured ingredient line item. Structured ingredients are load-bearing:
 * the forbidden-ingredient linter and the shopping-list aggregation both
 * consume them — never bury ingredients in prose (`docs/agents/domain.md`).
 */
export const IngredientSchema = z.object({
  /** e.g. "salmon fillet", "quinoa", "tamari (certified GF)". */
  name: z.string().trim().min(1, "ingredient name must be non-empty"),
  quantity: z.number().positive("quantity must be a positive number"),
  unit: UnitSchema,
  section: StoreSectionSchema,
  /**
   * Optional safety note, e.g. the tree-nut note mandated by
   * `docs/agents/dietary-safety.md`: "check label: processed in a facility
   * free of cashew/pistachio cross-contact".
   *
   * ⚠️ KNOWN CONFLICT (issue #16): that doc-mandated phrasing itself
   * contains the words "cashew"/"pistachio", so the live forbidden-term
   * linter (`pnpm lint:dietary`) currently FLAGS it when it appears in
   * `content/**` JSON — the mandated note cannot yet ship in real content
   * files. The reconciliation (allowlisting the exact safety-note phrase in
   * `scripts/dietary-safety/terms.mjs`) is OWNER-GATED and tracked as
   * issue #16. Until it lands, expect `lint:dietary` to fail on content
   * carrying this note. NEVER "fix" that failure by deleting, truncating,
   * or weakening the safety note — the note is the safety mechanism; the
   * linter allowlist is what must change, and only via #16's owner review.
   */
  safetyNote: z.string().trim().min(1).optional(),
});

export type Ingredient = z.infer<typeof IngredientSchema>;

export const RecipeSchema = z
  .object({
    slug: RecipeSlugSchema,
    title: z.string().trim().min(1, "title must be non-empty"),
    servings: z.number().int().positive("servings must be a positive integer"),
    prepMinutes: z.number().int().nonnegative("prepMinutes must be a non-negative integer"),
    cookMinutes: z.number().int().nonnegative("cookMinutes must be a non-negative integer"),
    style: RecipeStyleSchema,
    ingredients: z.array(IngredientSchema).nonempty("a recipe needs at least one ingredient"),
    steps: z
      .array(z.string().trim().min(1, "steps must be non-empty strings"))
      .nonempty("a recipe needs at least one step"),
    /** Storage/reheating notes. Required when style is "meal-prep" — see refinement. */
    storageNotes: z.string().trim().min(1).optional(),
    /** Golden-rule callouts, e.g. "use certified-GF tamari". */
    goldenRuleCallouts: z.array(z.string().trim().min(1)).optional(),
  })
  .superRefine((recipe, ctx) => {
    if (recipe.style === "meal-prep" && recipe.storageNotes === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["storageNotes"],
        message:
          'storageNotes is required for "meal-prep" recipes (batch-cooked food needs storage/reheating instructions)',
      });
    }
  });

export type Recipe = z.infer<typeof RecipeSchema>;

/** A planned eating occasion within a week's menu. */
export const MealSchema = z.object({
  /** References `content/recipes/<recipeSlug>.json`. */
  recipeSlug: RecipeSlugSchema,
  days: z
    .array(DaySchema)
    .nonempty("a meal must cover at least one day")
    .refine((days) => new Set(days).size === days.length, {
      message: "days must not contain duplicates",
    }),
  note: z.string().trim().min(1).optional(),
});

export type Meal = z.infer<typeof MealSchema>;

/** `2026-08-16` — the calendar date of a week's starting Sunday. */
const WEEK_START = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Reject dates the regex accepts but the calendar doesn't (2026-02-30,
 * 2026-13-01). `Date.UTC` silently rolls those over — Feb 30 becomes Mar 2 —
 * so round-tripping the parts back out is the only reliable check.
 * Returns the UTC-midnight Date when the input is a real date, else null.
 */
function realUtcDate(year: number, month: number, day: number): Date | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  const roundTripped =
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  return roundTripped ? date : null;
}

/**
 * Weekday abbreviation ("Sun", "Wed", …) for a UTC date. `toUTCString()` is
 * spec-fixed to English abbreviations in a fixed layout, so this stays
 * deterministic across locales and runtimes — unlike `toLocaleDateString`,
 * which would make a validation message vary by machine.
 */
function utcWeekdayName(date: Date): string {
  return date.toUTCString().slice(0, 3);
}

/**
 * A week identifier: the `YYYY-MM-DD` date of the Sunday that starts the
 * Sunday→Saturday planning window.
 *
 * The Sunday constraint is enforced here rather than left to convention
 * because this string IS the file identity per ADR-006
 * (`content/weeks/<weekStart>.json`) and the archive URL. A week filed under
 * a Wednesday would misname its own window forever: the digest would render
 * a Sun–Sat span that doesn't start on the named day, and — since published
 * means merged to main — renaming it later rewrites a public URL. Catching
 * it at the validation boundary is the only cheap moment.
 *
 * Each failure gets its own message so a generation run knows which of the
 * three rules it broke.
 */
export const WeekStartSchema = z
  .string()
  .regex(WEEK_START, "must be a date in YYYY-MM-DD form (e.g. 2026-08-16)")
  .superRefine((value, ctx) => {
    // Zod still runs superRefine after a failed `.regex()`, and slicing a
    // non-date ("2026-W33") yields NaN parts that would add a bogus second
    // "not a real calendar date" issue on top of the real shape error. Bail
    // out so each input reports exactly the one rule it actually broke.
    if (!WEEK_START.test(value)) return;
    const year = Number(value.slice(0, 4));
    const month = Number(value.slice(5, 7));
    const day = Number(value.slice(8, 10));
    const date = realUtcDate(year, month, day);
    if (date === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `"${value}" is not a real calendar date`,
      });
      return;
    }
    if (date.getUTCDay() !== 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `a week must start on a Sunday, but ${value} is a ${utcWeekdayName(date)}`,
      });
    }
  });

/**
 * One published weekly plan — the unit of publication, stored at
 * `content/weeks/<weekStart>.json`. Note there is no `status` and no stored
 * shopping list: published = merged to main (ADR-006), and the shopping
 * list is always derived from the referenced recipes at build time.
 *
 * Deliberate allowances (decided, not oversights):
 *
 * - **Duplicate menu recipeSlugs are allowed.** Planning the same dish
 *   twice in one week ("cook it twice", e.g. a fresh salad made Monday and
 *   again Thursday) is legitimate; the shopping-list aggregation (#6) must
 *   count each meal entry.
 * - **Two meals may overlap on the same day.** Lunch and dinner are
 *   different meals on one day, so cross-meal day overlap is not an error.
 * - **Duplicate snack slugs are NOT allowed** (refinement below): snacks
 *   are a set of "have these on hand this week" references, so a repeat
 *   carries no meaning and would silently double the snack's ingredients
 *   in the aggregation.
 */
export const WeekSchema = z.object({
  /** The starting Sunday's date — this week's identity and its filename. */
  weekStart: WeekStartSchema,
  menu: z.array(MealSchema).nonempty("a week needs at least one meal"),
  /** Snack recipe references (`content/recipes/<slug>.json`). May be empty. */
  snacks: z.array(RecipeSlugSchema).refine((snacks) => new Set(snacks).size === snacks.length, {
    message: "snacks must not contain duplicate slugs",
  }),
  notes: z.string().trim().min(1).optional(),
});

export type Week = z.infer<typeof WeekSchema>;
