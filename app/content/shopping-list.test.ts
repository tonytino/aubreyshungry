import { describe, expect, it } from "vitest";
import type { Ingredient, Meal, Recipe, Week } from "./schema";
import { type StoreSection, type Unit, buildShoppingList } from "./shopping-list";

/**
 * The tree-nut note mandated by `docs/agents/dietary-safety.md`. The exact
 * phrase is safe in this .ts test (it is not food content scanned by the
 * dietary linter) — never write it into `content/` or fixtures.
 */
const CROSS_CONTACT_NOTE =
  "check label: processed in a facility free of cashew/pistachio cross-contact";

// -- Inline test-data factories (golden-rule-safe foods only) --------------

function ing(
  name: string,
  quantity: number,
  unit: Unit,
  section: StoreSection,
  safetyNote?: string
): Ingredient {
  return safetyNote === undefined
    ? { name, quantity, unit, section }
    : { name, quantity, unit, section, safetyNote };
}

function recipe(
  slug: string,
  ingredients: [Ingredient, ...Ingredient[]],
  style: Recipe["style"] = "fresh"
): Recipe {
  return {
    slug,
    title: slug,
    servings: 4,
    prepMinutes: 10,
    cookMinutes: 20,
    style,
    ingredients,
    steps: ["combine everything and cook"],
    ...(style === "meal-prep" ? { storageNotes: "refrigerate up to 4 days" } : {}),
  };
}

function meal(recipeSlug: string, days: Meal["days"] = ["monday"]): Meal {
  return { recipeSlug, days };
}

function week(menu: Week["menu"], snacks: string[] = []): Week {
  return { isoWeek: "2026-W33", menu, snacks };
}

function byIndex(recipes: Recipe[]): Record<string, Recipe> {
  return Object.fromEntries(recipes.map((r) => [r.slug, r]));
}

// -- Tests -----------------------------------------------------------------

describe("buildShoppingList", () => {
  it("merges the same (name, unit) across menu recipes and snack recipes", () => {
    const recipes = byIndex([
      recipe("salmon-spinach-skillet", [
        ing("spinach", 100, "g", "produce"),
        ing("salmon fillet", 2, "piece", "protein"),
      ]),
      recipe("spinach-snack-cups", [ing("spinach", 50, "g", "produce")], "snack"),
    ]);
    const list = buildShoppingList(
      week([meal("salmon-spinach-skillet")], ["spinach-snack-cups"]),
      recipes
    );

    expect(list).toEqual([
      {
        section: "produce",
        items: [{ name: "spinach", quantity: 150, unit: "g", safetyNotes: [] }],
      },
      {
        section: "protein",
        items: [{ name: "salmon fillet", quantity: 2, unit: "piece", safetyNotes: [] }],
      },
    ]);
  });

  it("does NOT merge (and does not convert) the same name with different units", () => {
    const recipes = byIndex([
      recipe("quinoa-bowl", [ing("quinoa", 1, "cup", "pantry")]),
      recipe("quinoa-salad", [ing("quinoa", 200, "g", "pantry")]),
    ]);
    const list = buildShoppingList(week([meal("quinoa-bowl"), meal("quinoa-salad")]), recipes);

    expect(list).toEqual([
      {
        section: "pantry",
        items: [
          { name: "quinoa", quantity: 1, unit: "cup", safetyNotes: [] },
          { name: "quinoa", quantity: 200, unit: "g", safetyNotes: [] },
        ],
      },
    ]);
  });

  it("normalizes names (case, outer and inner whitespace) and keeps first-seen casing", () => {
    const recipes = byIndex([
      recipe("roast-veg", [ing("Olive Oil", 2, "tbsp", "pantry")]),
      recipe("dressing", [ing("  olive   oil ", 1, "tbsp", "pantry")]),
    ]);
    const list = buildShoppingList(week([meal("roast-veg"), meal("dressing")]), recipes);

    expect(list).toEqual([
      {
        section: "pantry",
        items: [{ name: "Olive Oil", quantity: 3, unit: "tbsp", safetyNotes: [] }],
      },
    ]);
  });

  it("counts a duplicated menu slug twice (cook it twice)", () => {
    const recipes = byIndex([
      recipe("salmon-quinoa-prep", [ing("salmon fillet", 2, "piece", "protein")], "meal-prep"),
    ]);
    const list = buildShoppingList(
      week([meal("salmon-quinoa-prep", ["monday"]), meal("salmon-quinoa-prep", ["thursday"])]),
      recipes
    );

    expect(list).toEqual([
      {
        section: "protein",
        items: [{ name: "salmon fillet", quantity: 4, unit: "piece", safetyNotes: [] }],
      },
    ]);
  });

  it("unions distinct safetyNotes across merged occurrences, deduplicated, first-seen order", () => {
    const recipes = byIndex([
      recipe("almond-crusted-trout", [ing("almonds", 50, "g", "pantry", CROSS_CONTACT_NOTE)]),
      recipe("berry-almond-parfait", [ing("almonds", 30, "g", "pantry", CROSS_CONTACT_NOTE)]),
      recipe(
        "trail-free-mix",
        [ing("almonds", 20, "g", "pantry", "choose unsalted, dry-roasted")],
        "snack"
      ),
    ]);
    const list = buildShoppingList(
      week([meal("almond-crusted-trout"), meal("berry-almond-parfait")], ["trail-free-mix"]),
      recipes
    );

    expect(list).toEqual([
      {
        section: "pantry",
        items: [
          {
            name: "almonds",
            quantity: 100,
            unit: "g",
            safetyNotes: [CROSS_CONTACT_NOTE, "choose unsalted, dry-roasted"],
          },
        ],
      },
    ]);
  });

  it("groups by section and orders sections in STORE_SECTIONS enum order, omitting empty ones", () => {
    // Authored deliberately out of enum order.
    const recipes = byIndex([
      recipe("golden-salmon-bake", [
        ing("frozen berries", 300, "g", "frozen"),
        ing("turmeric", 1, "tsp", "spices"),
        ing("salmon fillet", 2, "piece", "protein"),
        ing("spinach", 100, "g", "produce"),
      ]),
    ]);
    const list = buildShoppingList(week([meal("golden-salmon-bake")]), recipes);

    expect(list.map((s) => s.section)).toEqual(["produce", "protein", "spices", "frozen"]);
  });

  it("sorts items within a section alphabetically by name, case-insensitively", () => {
    const recipes = byIndex([
      recipe("green-plate", [
        ing("Spinach", 100, "g", "produce"),
        ing("garlic", 2, "clove", "produce"),
        ing("Lemon", 1, "", "produce"),
      ]),
    ]);
    const list = buildShoppingList(week([meal("green-plate")]), recipes);

    expect(list).toHaveLength(1);
    expect(list[0]?.items.map((item) => item.name)).toEqual(["garlic", "Lemon", "Spinach"]);
  });

  it("handles the minimal week: one meal, no snacks", () => {
    const recipes = byIndex([recipe("simple-quinoa", [ing("quinoa", 1, "cup", "pantry")])]);
    const list = buildShoppingList(week([meal("simple-quinoa")]), recipes);

    expect(list).toEqual([
      {
        section: "pantry",
        items: [{ name: "quinoa", quantity: 1, unit: "cup", safetyNotes: [] }],
      },
    ]);
  });

  it("skips dangling recipe slugs silently instead of throwing (validateContentDir owns integrity)", () => {
    const recipes = byIndex([recipe("real-salad", [ing("spinach", 100, "g", "produce")])]);
    const wk = week([meal("real-salad"), meal("ghost-recipe")], ["ghost-snack"]);

    expect(() => buildShoppingList(wk, recipes)).not.toThrow();
    expect(buildShoppingList(wk, recipes)).toEqual([
      {
        section: "produce",
        items: [{ name: "spinach", quantity: 100, unit: "g", safetyNotes: [] }],
      },
    ]);
  });

  it("returns an empty list when no referenced recipe resolves", () => {
    expect(buildShoppingList(week([meal("ghost-recipe")]), {})).toEqual([]);
  });

  it("keeps the first-seen section when merged occurrences disagree on section", () => {
    const recipes = byIndex([
      recipe("lemon-dressing", [ing("lemon", 1, "", "produce")]),
      recipe("lemon-water", [ing("lemon", 2, "", "other")], "snack"),
    ]);
    const list = buildShoppingList(week([meal("lemon-dressing")], ["lemon-water"]), recipes);

    expect(list).toEqual([
      {
        section: "produce",
        items: [{ name: "lemon", quantity: 3, unit: "", safetyNotes: [] }],
      },
    ]);
  });

  it("is deterministic: the same input yields deep-equal output on every call", () => {
    const recipes = byIndex([
      recipe("salmon-spinach-skillet", [
        ing("spinach", 100, "g", "produce"),
        ing("salmon fillet", 2, "piece", "protein"),
        ing("olive oil", 2, "tbsp", "pantry"),
      ]),
      recipe("quinoa-salad", [
        ing("quinoa", 200, "g", "pantry"),
        ing("olive oil", 1, "tbsp", "pantry"),
        ing("lemon", 1, "", "produce"),
      ]),
      recipe("almond-snack", [ing("almonds", 50, "g", "pantry", CROSS_CONTACT_NOTE)], "snack"),
    ]);
    const wk = week(
      [meal("salmon-spinach-skillet"), meal("quinoa-salad"), meal("salmon-spinach-skillet")],
      ["almond-snack"]
    );

    const first = buildShoppingList(wk, recipes);
    const second = buildShoppingList(wk, recipes);
    expect(second).toStrictEqual(first);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });
});
