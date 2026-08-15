/**
 * Shopping-list aggregation — the derived view over a week's recipes
 * (issue #6). Pure logic, no I/O, no UI: the site (issue #5) renders the
 * structure this module returns.
 *
 * The shopping list is DERIVED, never stored: recipes are the source of
 * truth, and this module recomputes the list from them on every call
 * (`docs/agents/domain.md` → Invariants).
 *
 * ## Aggregation semantics
 *
 * - **Inputs counted:** the ingredients of every menu entry's recipe and
 *   every snack's recipe. Each menu entry counts exactly once at 1x — there
 *   is no batch multiplier (`docs/agents/domain.md`), and a duplicate menu
 *   slug therefore counts twice by design ("cook it twice"). Snacks are
 *   unique by schema, so each snack recipe counts once.
 *
 * - **Merging:** occurrences merge by (normalized name, unit). Name
 *   normalization is trim + lowercase + collapse inner whitespace; the
 *   displayed name is the first-seen original casing. Quantities sum.
 *
 * - **No unit conversion — deliberately.** The same normalized name with
 *   different units yields separate items, never a converted merge. Silent
 *   bad conversions (density-dependent cup↔gram, package sizes, rounding)
 *   would produce a confidently wrong list; two lines the shopper can
 *   reconcile in the aisle are strictly safer. Count-ish units (`can`,
 *   `jar`, `package`) carry their size in the ingredient name by
 *   convention, so exact-name matching is what keeps them merging
 *   correctly (`docs/agents/domain.md`).
 *
 * - **Safety notes:** a merged item's `safetyNotes` is the union of the
 *   distinct `safetyNote`s across its occurrences, in first-seen order.
 *   Safety notes are load-bearing (dietary-safety golden rules) — they are
 *   never dropped in a merge.
 *
 * - **Sections:** an item lands in its ingredient's `section`. If merged
 *   occurrences disagree on section, the first-seen section wins — the
 *   schema's closed section enum plus consistent recipe authoring makes
 *   this unlikely, and a wrong aisle is a nuisance, not an error worth
 *   failing the build over.
 *
 * - **Ordering is deterministic:** sections appear in `STORE_SECTIONS` enum
 *   order (empty sections omitted); items within a section sort
 *   alphabetically by normalized name (code-point order, locale
 *   independent), tie-broken by unit. Same input always yields deep-equal
 *   output.
 *
 * ## ⚠️ Referential integrity is validateContentDir's job, not ours
 *
 * A menu/snack slug missing from `recipesBySlug` is silently and
 * deterministically SKIPPED — this function never throws on content
 * problems. Callers MUST run `validateContentDir` (`./validate.ts`) first;
 * it reports dangling references precisely. By the time content reaches
 * this module it has passed that gate, so a skip here can only happen on a
 * caller bug — and a shopping list missing one recipe beats a crashed
 * build of the whole site.
 */

import { type Ingredient, type Recipe, STORE_SECTIONS, type UNITS, type Week } from "./schema";

/** A canonical unit (see `UNITS` in `./schema.ts`; `""` = bare count). */
export type Unit = (typeof UNITS)[number];

/** A store section (see `STORE_SECTIONS` in `./schema.ts`). */
export type StoreSection = (typeof STORE_SECTIONS)[number];

/** One line on the list: a merged ingredient with its summed quantity. */
export type ShoppingListItem = {
  name: string;
  quantity: number;
  unit: Unit;
  safetyNotes: string[];
};

/** All items for one store section, in stable alphabetical order. */
export type ShoppingListSection = {
  section: StoreSection;
  items: ShoppingListItem[];
};

/** The full list: non-empty sections in `STORE_SECTIONS` enum order. */
export type ShoppingList = ShoppingListSection[];

/** trim + lowercase + collapse inner whitespace. */
function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Internal merge bucket, keyed by (normalized name, unit). */
type MergeBucket = {
  normalizedName: string;
  displayName: string;
  quantity: number;
  unit: Unit;
  section: StoreSection;
  safetyNotes: string[];
};

/**
 * Build the derived shopping list for a week. Pure and deterministic —
 * see the module header for the full semantics, including the loud
 * warning that dangling `recipeSlug`s are skipped, not thrown:
 * run `validateContentDir` before calling this.
 */
export function buildShoppingList(week: Week, recipesBySlug: Record<string, Recipe>): ShoppingList {
  // Menu entries first (each counts once — duplicates intentionally count
  // twice), then snacks (unique by schema).
  const slugs: string[] = [...week.menu.map((meal) => meal.recipeSlug), ...week.snacks];

  const buckets = new Map<string, MergeBucket>();

  for (const slug of slugs) {
    const recipe = recipesBySlug[slug];
    if (recipe === undefined) continue; // See module header: validateContentDir owns this.
    for (const ingredient of recipe.ingredients) {
      mergeIngredient(buckets, ingredient);
    }
  }

  // Group buckets by section (first-seen section per bucket).
  const itemsBySection = new Map<StoreSection, MergeBucket[]>();
  for (const bucket of buckets.values()) {
    const group = itemsBySection.get(bucket.section);
    if (group === undefined) {
      itemsBySection.set(bucket.section, [bucket]);
    } else {
      group.push(bucket);
    }
  }

  // Deterministic output: STORE_SECTIONS order, items alphabetical by
  // normalized name (code-point order), unit as tie-break.
  const list: ShoppingList = [];
  for (const section of STORE_SECTIONS) {
    const group = itemsBySection.get(section);
    if (group === undefined) continue;
    group.sort((a, b) => {
      if (a.normalizedName !== b.normalizedName) {
        return a.normalizedName < b.normalizedName ? -1 : 1;
      }
      return a.unit < b.unit ? -1 : a.unit > b.unit ? 1 : 0;
    });
    list.push({
      section,
      items: group.map((bucket) => ({
        name: bucket.displayName,
        quantity: bucket.quantity,
        unit: bucket.unit,
        safetyNotes: [...bucket.safetyNotes],
      })),
    });
  }
  return list;
}

/** Merge one ingredient occurrence into its (normalized name, unit) bucket. */
function mergeIngredient(buckets: Map<string, MergeBucket>, ingredient: Ingredient): void {
  const normalizedName = normalizeName(ingredient.name);
  // JSON-encoding the pair makes the key collision-free by construction.
  const key = JSON.stringify([normalizedName, ingredient.unit]);
  const existing = buckets.get(key);
  if (existing === undefined) {
    buckets.set(key, {
      normalizedName,
      displayName: ingredient.name,
      quantity: ingredient.quantity,
      unit: ingredient.unit,
      section: ingredient.section,
      safetyNotes: ingredient.safetyNote === undefined ? [] : [ingredient.safetyNote],
    });
    return;
  }
  existing.quantity += ingredient.quantity;
  if (
    ingredient.safetyNote !== undefined &&
    !existing.safetyNotes.includes(ingredient.safetyNote)
  ) {
    existing.safetyNotes.push(ingredient.safetyNote);
  }
}
