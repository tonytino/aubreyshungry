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

  it("normalizes names (case, outer and inner whitespace) and picks the lexicographically-first collapsed spelling as display name", () => {
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

  it("collapses inner whitespace in the display name even for a single occurrence", () => {
    const recipes = byIndex([recipe("dressing", [ing("olive   oil", 1, "tbsp", "pantry")])]);
    const list = buildShoppingList(week([meal("dressing")]), recipes);

    expect(list[0]?.items[0]?.name).toBe("olive oil");
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

  it("picks the earliest enum-order section when merged occurrences disagree, regardless of encounter order", () => {
    const recipes = byIndex([
      recipe("lemon-dressing", [ing("lemon", 1, "", "produce")]),
      recipe("lemon-water", [ing("lemon", 2, "", "other")], "snack"),
    ]);
    const expected = [
      {
        section: "produce",
        items: [{ name: "lemon", quantity: 3, unit: "", safetyNotes: [] }],
      },
    ];

    // "produce" precedes "other" in STORE_SECTIONS, so it wins from either
    // encounter order: produce-first (menu before snacks) ...
    expect(buildShoppingList(week([meal("lemon-dressing")], ["lemon-water"]), recipes)).toEqual(
      expected
    );
    // ... and other-first (the "other" occurrence is seen before "produce").
    const reversedRecipes = byIndex([
      recipe("lemon-water-meal", [ing("lemon", 2, "", "other")]),
      recipe("lemon-dressing-snack", [ing("lemon", 1, "", "produce")], "snack"),
    ]);
    expect(
      buildShoppingList(week([meal("lemon-water-meal")], ["lemon-dressing-snack"]), reversedRecipes)
    ).toEqual(expected);
  });

  it("rounds summed quantities at the emission boundary so float noise never reaches the list", () => {
    const recipes = byIndex([
      recipe("ginger-tea", [ing("ground ginger", 0.1, "tsp", "spices")]),
      recipe("golden-milk", [ing("ground ginger", 0.2, "tsp", "spices")]),
    ]);

    const pair = buildShoppingList(week([meal("ginger-tea"), meal("golden-milk")]), recipes);
    expect(pair[0]?.items[0]?.quantity).toBe(0.3);

    const tenMeals: Week["menu"] = [
      meal("ginger-tea"),
      ...Array.from({ length: 9 }, () => meal("ginger-tea")),
    ];
    const ten = buildShoppingList(week(tenMeals), recipes);
    expect(ten[0]?.items[0]?.quantity).toBe(1);
  });

  it("produces deep-equal lists for two weeks identical except menu/snack order", () => {
    const recipes = byIndex([
      recipe("salmon-skillet", [
        ing("Extra-Virgin Olive Oil", 2, "tbsp", "pantry"),
        ing("salmon fillet", 2, "piece", "protein"),
        ing("lemon", 1, "", "produce"),
      ]),
      recipe("quinoa-salad", [
        ing("extra-virgin olive oil", 1, "tbsp", "other"),
        ing("quinoa", 200, "g", "pantry"),
        ing("lemon", 2, "", "produce"),
      ]),
      recipe("almond-snack", [ing("almonds", 50, "g", "pantry", CROSS_CONTACT_NOTE)], "snack"),
      recipe("berry-snack", [ing("frozen berries", 200, "g", "frozen")], "snack"),
    ]);

    const forward = buildShoppingList(
      week(
        [meal("salmon-skillet"), meal("salmon-skillet"), meal("quinoa-salad")],
        ["almond-snack", "berry-snack"]
      ),
      recipes
    );
    const reordered = buildShoppingList(
      week(
        [meal("quinoa-salad"), meal("salmon-skillet"), meal("salmon-skillet")],
        ["berry-snack", "almond-snack"]
      ),
      recipes
    );

    expect(reordered).toStrictEqual(forward);
    // And the shared, casing/section-divergent ingredient resolved order-independently:
    const pantry = forward.find((s) => s.section === "pantry");
    expect(pantry?.items.map((item) => item.name)).toContain("Extra-Virgin Olive Oil");
  });

  it("merges NFC and NFD encodings of the same glyphs, without folding diacritics", () => {
    const nfc = "jalape\u00f1o"; // composed ñ
    const nfd = "jalapen\u0303o"; // n + combining tilde — same glyphs, different bytes
    expect(nfd).not.toBe(nfc);
    expect(nfd.normalize("NFC")).toBe(nfc);
    const recipes = byIndex([
      recipe("salsa-verde", [ing(nfc, 2, "", "produce")]),
      recipe("salsa-roja", [ing(nfd, 1, "", "produce")]),
      recipe("mild-salsa", [ing("jalapeno", 1, "", "produce")]),
    ]);
    const list = buildShoppingList(
      week([meal("salsa-verde"), meal("salsa-roja"), meal("mild-salsa")]),
      recipes
    );

    expect(list).toEqual([
      {
        section: "produce",
        items: [
          // Diacritic folding is deliberately out: plain "jalapeno" stays its own line.
          { name: "jalapeno", quantity: 1, unit: "", safetyNotes: [] },
          { name: nfc, quantity: 3, unit: "", safetyNotes: [] },
        ],
      },
    ]);
  });

  it("dedupes safetyNotes case-insensitively, keeping the first-seen original text", () => {
    const capitalized = `Check ${CROSS_CONTACT_NOTE.slice("check ".length)}`;
    const recipes = byIndex([
      recipe("almond-crusted-trout", [ing("almonds", 50, "g", "pantry", capitalized)]),
      recipe("almond-parfait", [ing("almonds", 30, "g", "pantry", CROSS_CONTACT_NOTE)]),
    ]);
    const list = buildShoppingList(
      week([meal("almond-crusted-trout"), meal("almond-parfait")]),
      recipes
    );

    expect(list[0]?.items[0]?.safetyNotes).toEqual([capitalized]);
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
