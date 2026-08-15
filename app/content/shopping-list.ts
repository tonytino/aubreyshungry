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
 *   normalization is Unicode NFC + trim + lowercase + collapse inner
 *   whitespace. The displayed name is chosen deterministically and
 *   order-independently: the lexicographically-first (code-point order)
 *   NFC + whitespace-collapsed original spelling among the merged
 *   occurrences. Quantities sum, rounded to 6 decimal places at the
 *   emission boundary so float noise (0.1 + 0.2) never reaches the
 *   printed list.
 *
 * - **Unicode: NFC yes, diacritic folding no.** NFC normalization merges
 *   byte-different encodings of the SAME glyphs (composed vs decomposed
 *   "jalapeño"). Diacritic folding is deliberately out: "jalapeño" and
 *   "jalapeno" stay two lines. The authoring convention is to spell an
 *   ingredient consistently — with its diacritics — across recipes.
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
 *   `safetyNote`s across its occurrences, deduplicated case-insensitively
 *   (first-seen original text kept), in first-seen order. Safety notes are
 *   load-bearing (dietary-safety golden rules) — they are never dropped in
 *   a merge; a duplicated note is acceptable, a missing one is not.
 *
 * - **Sections:** an item lands in the EARLIEST section (in
 *   `STORE_SECTIONS` enum order) among its merged occurrences, so the
 *   choice does not depend on menu order. The schema's closed section enum
 *   plus consistent recipe authoring makes disagreement unlikely, and a
 *   wrong aisle is a nuisance, not an error worth failing the build over.
 *
 * - **Ordering is deterministic AND order-independent:** sections appear in
 *   `STORE_SECTIONS` enum order (empty sections omitted); items within a
 *   section sort alphabetically by normalized name (code-point order,
 *   locale independent), tie-broken by unit. Reordering a week's menu or
 *   snacks never changes the resulting list: same ingredient multiset in,
 *   deep-equal shopping list out.
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

/**
 * Display form: Unicode NFC + trim + collapse inner whitespace, original
 * casing kept. Raw inner whitespace must never leak onto the printed list.
 */
function collapseName(name: string): string {
  return name.normalize("NFC").trim().replace(/\s+/g, " ");
}

/** Merge key form: the display form, lowercased. No diacritic folding — see header. */
function normalizeName(name: string): string {
  return collapseName(name).toLowerCase();
}

/**
 * Round a summed quantity at the emission boundary so binary-float noise
 * (0.1 + 0.2 = 0.30000000000000004) never reaches the printed store list.
 * Six decimal places is far below any real-world measurement resolution.
 */
function roundQuantity(quantity: number): number {
  return Math.round(quantity * 1e6) / 1e6;
}

/** STORE_SECTIONS enum position, for order-independent section choice. */
const SECTION_RANK = new Map<StoreSection, number>(
  STORE_SECTIONS.map((section, index) => [section, index])
);

function sectionRank(section: StoreSection): number {
  return SECTION_RANK.get(section) ?? STORE_SECTIONS.length;
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

  // Group buckets by section (earliest enum-order section per bucket).
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
        quantity: roundQuantity(bucket.quantity),
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
  const displayCandidate = collapseName(ingredient.name);
  // JSON-encoding the pair makes the key collision-free by construction.
  const key = JSON.stringify([normalizedName, ingredient.unit]);
  const existing = buckets.get(key);
  if (existing === undefined) {
    buckets.set(key, {
      normalizedName,
      displayName: displayCandidate,
      quantity: ingredient.quantity,
      unit: ingredient.unit,
      section: ingredient.section,
      safetyNotes: ingredient.safetyNote === undefined ? [] : [ingredient.safetyNote],
    });
    return;
  }
  existing.quantity += ingredient.quantity;
  // Order-independent display name: lexicographically-first (code-point
  // order) collapsed spelling among the merged occurrences.
  if (displayCandidate < existing.displayName) {
    existing.displayName = displayCandidate;
  }
  // Order-independent section: earliest in STORE_SECTIONS enum order.
  if (sectionRank(ingredient.section) < sectionRank(existing.section)) {
    existing.section = ingredient.section;
  }
  mergeSafetyNote(existing.safetyNotes, ingredient.safetyNote);
}

/**
 * Union a safety note into a bucket's notes, deduplicating
 * case-insensitively and keeping the first-seen original text.
 *
 * ⚠️ Never tighten this dedupe toward dropping notes: safety notes are the
 * dietary-safety mechanism (golden rules). A duplicated note on the list is
 * acceptable; a missing one is not.
 */
function mergeSafetyNote(notes: string[], note: string | undefined): void {
  if (note === undefined) return;
  const lowered = note.toLowerCase();
  if (notes.some((existing) => existing.toLowerCase() === lowered)) return;
  notes.push(note);
}
