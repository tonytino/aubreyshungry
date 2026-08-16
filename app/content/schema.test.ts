import { describe, expect, it } from "vitest";
import {
  DAYS,
  type Ingredient,
  IngredientSchema,
  type Meal,
  MealSchema,
  type Recipe,
  RecipeSchema,
  type Week,
  WeekSchema,
  WeekStartSchema,
} from "./schema";

// All sample food data below follows the golden rules in
// docs/agents/dietary-safety.md: gluten-free, no cashews/pistachios,
// anti-inflammatory staples. Invalid cases are invalid by SHAPE (missing
// fields, bad types) — never by forbidden ingredients.

const validIngredient: Ingredient = {
  name: "salmon fillet",
  quantity: 2,
  unit: "lb",
  section: "protein",
};

const validRecipe: Recipe = {
  slug: "baked-salmon-quinoa-bowls",
  title: "Baked Salmon Quinoa Bowls",
  servings: 4,
  prepMinutes: 15,
  cookMinutes: 25,
  style: "meal-prep",
  ingredients: [
    validIngredient,
    { name: "quinoa", quantity: 1.5, unit: "cup", section: "pantry" },
    { name: "spinach", quantity: 1, unit: "bunch", section: "produce" },
    { name: "extra-virgin olive oil", quantity: 2, unit: "tbsp", section: "pantry" },
    {
      name: "tamari (certified GF)",
      quantity: 3,
      unit: "tbsp",
      section: "pantry",
      safetyNote: "must be certified gluten-free",
    },
  ],
  steps: [
    "Cook the quinoa and let it cool slightly.",
    "Roast the salmon at 400F until it flakes, about 12 minutes.",
    "Assemble bowls with quinoa, spinach, and salmon; dress with olive oil and tamari.",
  ],
  storageNotes: "Refrigerate up to 4 days; reheat gently or eat cold over fresh spinach.",
  goldenRuleCallouts: ["use certified-GF tamari"],
};

const validMeal: Meal = {
  recipeSlug: "baked-salmon-quinoa-bowls",
  days: ["monday", "tuesday"],
};

const validWeek: Week = {
  weekStart: "2026-08-16",
  menu: [validMeal],
  snacks: ["rosemary-almonds"],
};

describe("IngredientSchema", () => {
  it("accepts a valid ingredient", () => {
    expect(IngredientSchema.safeParse(validIngredient).success).toBe(true);
  });

  it("accepts an optional safetyNote", () => {
    const result = IngredientSchema.safeParse({
      name: "almonds",
      quantity: 1,
      unit: "cup",
      section: "pantry",
      safetyNote: "check label: processed in a facility free of cashew/pistachio cross-contact",
    });
    expect(result.success).toBe(true);
  });

  it('accepts unit "" for countable items', () => {
    const result = IngredientSchema.safeParse({
      name: "avocado",
      quantity: 2,
      unit: "",
      section: "produce",
    });
    expect(result.success).toBe(true);
  });

  it.each([
    ["empty name", { ...validIngredient, name: "" }],
    ["whitespace-only name", { ...validIngredient, name: "   " }],
    ["zero quantity", { ...validIngredient, quantity: 0 }],
    ["negative quantity", { ...validIngredient, quantity: -1 }],
    ["string quantity", { ...validIngredient, quantity: "2" }],
    ["unit outside the enum", { ...validIngredient, unit: "Tablespoon" }],
    ["section outside the enum", { ...validIngredient, section: "bakery" }],
    ["empty safetyNote", { ...validIngredient, safetyNote: "" }],
    ["missing name", { quantity: 1, unit: "cup", section: "pantry" }],
  ])("rejects %s", (_label, input) => {
    expect(IngredientSchema.safeParse(input).success).toBe(false);
  });
});

describe("RecipeSchema", () => {
  it("accepts a valid meal-prep recipe", () => {
    expect(RecipeSchema.safeParse(validRecipe).success).toBe(true);
  });

  it("requires storageNotes for meal-prep recipes", () => {
    const { storageNotes: _dropped, ...withoutStorage } = validRecipe;
    const result = RecipeSchema.safeParse(withoutStorage);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["storageNotes"]);
    }
  });

  it("allows fresh recipes without storageNotes", () => {
    const { storageNotes: _dropped, ...rest } = validRecipe;
    const fresh = {
      ...rest,
      slug: "lemony-spinach-salad",
      style: "fresh",
      cookMinutes: 0,
    };
    expect(RecipeSchema.safeParse(fresh).success).toBe(true);
  });

  it("allows snack recipes without storageNotes", () => {
    const { storageNotes: _dropped, ...rest } = validRecipe;
    const snack = { ...rest, slug: "rosemary-almonds", style: "snack" };
    expect(RecipeSchema.safeParse(snack).success).toBe(true);
  });

  it("allows omitting goldenRuleCallouts", () => {
    const { goldenRuleCallouts: _dropped, ...rest } = validRecipe;
    expect(RecipeSchema.safeParse(rest).success).toBe(true);
  });

  it.each([
    ["uppercase slug", { ...validRecipe, slug: "Baked-Salmon" }],
    ["slug with spaces", { ...validRecipe, slug: "baked salmon" }],
    ["slug with trailing hyphen", { ...validRecipe, slug: "baked-salmon-" }],
    ["slug with double hyphen", { ...validRecipe, slug: "baked--salmon" }],
    ["empty title", { ...validRecipe, title: "" }],
    ["zero servings", { ...validRecipe, servings: 0 }],
    ["fractional servings", { ...validRecipe, servings: 2.5 }],
    ["negative prepMinutes", { ...validRecipe, prepMinutes: -5 }],
    ["fractional cookMinutes", { ...validRecipe, cookMinutes: 12.5 }],
    ["unknown style", { ...validRecipe, style: "grab-and-go" }],
    ["empty ingredients", { ...validRecipe, ingredients: [] }],
    ["empty steps", { ...validRecipe, steps: [] }],
    ["blank step", { ...validRecipe, steps: [""] }],
    ["empty goldenRuleCallouts entry", { ...validRecipe, goldenRuleCallouts: [""] }],
  ])("rejects %s", (_label, input) => {
    expect(RecipeSchema.safeParse(input).success).toBe(false);
  });
});

describe("MealSchema", () => {
  it("accepts a valid meal", () => {
    expect(MealSchema.safeParse(validMeal).success).toBe(true);
  });

  it("accepts an optional note", () => {
    const result = MealSchema.safeParse({ ...validMeal, note: "double the spinach" });
    expect(result.success).toBe(true);
  });

  it.each([
    ["empty days", { ...validMeal, days: [] }],
    ["unknown day", { ...validMeal, days: ["funday"] }],
    ["duplicate days", { ...validMeal, days: ["monday", "monday"] }],
    ["bad recipeSlug", { ...validMeal, recipeSlug: "Not A Slug" }],
  ])("rejects %s", (_label, input) => {
    expect(MealSchema.safeParse(input).success).toBe(false);
  });
});

describe("DAYS", () => {
  // This order is load-bearing, not cosmetic: MenuByDay renders days by
  // filtering DAYS, so a wrong order silently mis-sorts the whole menu.
  it("is Sunday-first, matching the Sunday→Saturday planning week", () => {
    expect(DAYS).toEqual([
      "sunday",
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
    ]);
  });

  it("lines up with Date.getUTCDay() indices (0 = Sunday)", () => {
    // Anchored on a known Sunday so the alignment is asserted, not assumed.
    const sunday = Date.UTC(2026, 7, 16);
    for (const [index, day] of DAYS.entries()) {
      const date = new Date(sunday + index * 86_400_000);
      expect(date.getUTCDay(), day).toBe(index);
    }
  });
});

describe("WeekStartSchema", () => {
  it.each([
    "2026-08-16", // a plain mid-year Sunday
    "2026-01-04", // first Sunday of a year
    "2026-12-27", // last Sunday of a year — its week spills into 2027
    "2024-02-25", // leap-year February
    "2026-03-08", // the US spring-forward Sunday (a 23-hour day locally)
    "2026-11-01", // the US fall-back Sunday (a 25-hour day locally)
  ])("accepts %s", (value) => {
    expect(WeekStartSchema.safeParse(value).success).toBe(true);
  });

  it.each([
    // Shape failures.
    ["ISO week identifier", "2026-W33"],
    ["unpadded month", "2026-8-16"],
    ["unpadded day", "2026-08-6"],
    ["two-digit year", "26-08-16"],
    ["slashes", "2026/08/16"],
    ["trailing time", "2026-08-16T00:00:00Z"],
    ["trailing text", "2026-08-16x"],
    ["empty string", ""],
    // Shape-valid but not real calendar dates.
    ["February 30", "2026-02-30"],
    ["month 13", "2026-13-01"],
    ["month 00", "2026-00-05"],
    ["day 00", "2026-08-00"],
    ["Feb 29 in a non-leap year", "2025-02-29"],
    // Real dates that are not Sundays — the whole point of the constraint.
    ["a Monday", "2026-08-17"],
    ["a Saturday", "2026-08-22"],
    ["a Wednesday", "2026-08-19"],
  ])("rejects %s", (_label, value) => {
    expect(WeekStartSchema.safeParse(value).success).toBe(false);
  });

  it("names the offending weekday when a real date is not a Sunday", () => {
    const result = WeekStartSchema.safeParse("2026-08-17");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(
        "a week must start on a Sunday, but 2026-08-17 is a Mon"
      );
    }
  });

  it("distinguishes an impossible date from a non-Sunday", () => {
    const impossible = WeekStartSchema.safeParse("2026-02-30");
    expect(impossible.success).toBe(false);
    if (!impossible.success) {
      // Must NOT be reported as a weekday problem: Date.UTC would have
      // rolled Feb 30 over to Mar 2 (a Monday) and blamed the wrong rule.
      expect(impossible.error.issues[0]?.message).toBe('"2026-02-30" is not a real calendar date');
    }
  });

  it("reports a shape failure without also guessing at the date", () => {
    const result = WeekStartSchema.safeParse("2026-W33");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toHaveLength(1);
      expect(result.error.issues[0]?.message).toContain("YYYY-MM-DD");
    }
  });
});

describe("WeekSchema", () => {
  it("accepts a valid week", () => {
    expect(WeekSchema.safeParse(validWeek).success).toBe(true);
  });

  it("accepts empty snacks and optional notes", () => {
    const result = WeekSchema.safeParse({
      ...validWeek,
      snacks: [],
      notes: "prep everything Sunday afternoon",
    });
    expect(result.success).toBe(true);
  });

  it("has no status field — published means merged to main (ADR-006)", () => {
    const parsed = WeekSchema.parse({ ...validWeek, status: "draft" });
    expect(parsed).not.toHaveProperty("status");
  });

  it("allows duplicate menu recipeSlugs and same-day meal overlap (cook it twice)", () => {
    const result = WeekSchema.safeParse({
      ...validWeek,
      menu: [
        { recipeSlug: "baked-salmon-quinoa-bowls", days: ["monday"] },
        { recipeSlug: "baked-salmon-quinoa-bowls", days: ["monday", "thursday"] },
      ],
    });
    expect(result.success).toBe(true);
  });

  it.each([
    ["empty menu", { ...validWeek, menu: [] }],
    ["bad snack slug", { ...validWeek, snacks: ["Rosemary Almonds"] }],
    ["duplicate snack slugs", { ...validWeek, snacks: ["rosemary-almonds", "rosemary-almonds"] }],
    ["non-Sunday weekStart", { ...validWeek, weekStart: "2026-08-17" }],
    ["ISO-week-shaped weekStart", { ...validWeek, weekStart: "2026-W33" }],
    ["missing snacks", { weekStart: "2026-08-16", menu: [validMeal] }],
    ["empty notes", { ...validWeek, notes: "" }],
  ])("rejects %s", (_label, input) => {
    expect(WeekSchema.safeParse(input).success).toBe(false);
  });
});
