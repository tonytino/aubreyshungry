/**
 * Content schemas — the domain model for weeks, meals, recipes, and
 * ingredients as Zod schemas with inferred TypeScript types.
 *
 * This file is the source of truth for content shapes (see
 * `docs/agents/domain.md` and ADR-006). Every content boundary — generation
 * output, CI validation, and the site build — validates against these
 * schemas. Content lives in-repo as JSON: `content/weeks/<ISO-week>.json`
 * and `content/recipes/<slug>.json`.
 *
 * Design decisions recorded here so they aren't re-litigated:
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

/** Days a meal can cover. */
export const DAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
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
  /** e.g. "check label: processed in a facility free of cashew/pistachio cross-contact". */
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

/** `2026-W03` — ISO 8601 week identifier. Week number range checked by refinement. */
const ISO_WEEK = /^\d{4}-W\d{2}$/;

export const IsoWeekSchema = z
  .string()
  .regex(ISO_WEEK, "must match YYYY-Www (e.g. 2026-W03)")
  .refine(
    (value) => {
      const week = Number(value.slice(-2));
      return week >= 1 && week <= 53;
    },
    { message: "ISO week number must be between 01 and 53" }
  );

/**
 * One published weekly plan — the unit of publication, stored at
 * `content/weeks/<isoWeek>.json`. Note there is no `status` and no stored
 * shopping list: published = merged to main (ADR-006), and the shopping
 * list is always derived from the referenced recipes at build time.
 */
export const WeekSchema = z.object({
  isoWeek: IsoWeekSchema,
  menu: z.array(MealSchema).nonempty("a week needs at least one meal"),
  /** Snack recipe references (`content/recipes/<slug>.json`). May be empty. */
  snacks: z.array(RecipeSlugSchema),
  notes: z.string().trim().min(1).optional(),
});

export type Week = z.infer<typeof WeekSchema>;
