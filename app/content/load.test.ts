import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { getLatestWeekDigest, getWeekDigest, listWeekSummaries, loadContent } from "./load";

// All sample food data below follows the golden rules in
// docs/agents/dietary-safety.md (gluten-free, no cashews/pistachios,
// anti-inflammatory staples). Sample content is written to os.tmpdir() —
// never to a content/ or fixtures/ directory in the repo.

const tempDirs: string[] = [];
afterAll(() => {
  for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true });
});

function makeContentDir(files: Record<string, string> = {}): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "content-load-"));
  tempDirs.push(dir);
  for (const [relative, text] of Object.entries(files)) {
    const absolute = path.join(dir, relative);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, text);
  }
  return dir;
}

const salmonRecipe = {
  slug: "sheet-pan-salmon-quinoa",
  title: "Sheet-Pan Salmon with Quinoa",
  servings: 4,
  prepMinutes: 15,
  cookMinutes: 25,
  style: "meal-prep",
  ingredients: [
    { name: "salmon fillet", quantity: 1.5, unit: "lb", section: "protein" },
    { name: "quinoa", quantity: 1.5, unit: "cup", section: "pantry" },
    { name: "extra-virgin olive oil", quantity: 2, unit: "tbsp", section: "pantry" },
  ],
  steps: [
    "Roast the salmon with olive oil at 400F until it flakes, about 15 minutes.",
    "Simmer the quinoa in water until tender, about 15 minutes, then portion.",
  ],
  storageNotes: "Refrigerate portions up to 3 days; reheat covered at low heat.",
};

const spinachSaladRecipe = {
  slug: "spinach-berry-salad",
  title: "Spinach and Berry Salad",
  servings: 2,
  prepMinutes: 10,
  cookMinutes: 0,
  style: "fresh",
  ingredients: [
    { name: "baby spinach", quantity: 5, unit: "oz", section: "produce" },
    { name: "blueberries", quantity: 1, unit: "cup", section: "produce" },
    { name: "extra-virgin olive oil", quantity: 1, unit: "tbsp", section: "pantry" },
  ],
  steps: ["Toss the spinach and blueberries with the olive oil and serve."],
};

const almondSnackRecipe = {
  slug: "roasted-almonds",
  title: "Roasted Almonds",
  servings: 4,
  prepMinutes: 2,
  cookMinutes: 10,
  style: "snack",
  ingredients: [
    {
      name: "raw almonds",
      quantity: 2,
      unit: "cup",
      section: "pantry",
      safetyNote: "check label: processed in a facility free of cashew/pistachio cross-contact",
    },
  ],
  steps: ["Roast the almonds at 325F for 10 minutes, stirring once."],
};

function weekDoc(isoWeek: string, overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    isoWeek,
    menu: [
      { recipeSlug: "sheet-pan-salmon-quinoa", days: ["monday", "wednesday"] },
      { recipeSlug: "spinach-berry-salad", days: ["tuesday"] },
    ],
    snacks: ["roasted-almonds"],
    notes: "Prep the salmon and quinoa on Sunday.",
    ...overrides,
  });
}

function fullContentDir(): string {
  return makeContentDir({
    "recipes/sheet-pan-salmon-quinoa.json": JSON.stringify(salmonRecipe),
    "recipes/spinach-berry-salad.json": JSON.stringify(spinachSaladRecipe),
    "recipes/roasted-almonds.json": JSON.stringify(almondSnackRecipe),
    "weeks/2026-W32.json": weekDoc("2026-W32"),
    "weeks/2026-W33.json": weekDoc("2026-W33"),
  });
}

describe("loadContent", () => {
  it("returns empty content for an absent directory", () => {
    const dir = path.join(makeContentDir(), "does-not-exist");
    const { weeks, recipesBySlug } = loadContent(dir);
    expect(weeks).toEqual([]);
    expect(recipesBySlug).toEqual({});
  });

  it("sorts weeks newest first", () => {
    const { weeks } = loadContent(fullContentDir());
    expect(weeks.map((week) => week.isoWeek)).toEqual(["2026-W33", "2026-W32"]);
  });

  it("omits weeks with dangling recipe references instead of crashing", () => {
    const dir = makeContentDir({
      "recipes/sheet-pan-salmon-quinoa.json": JSON.stringify(salmonRecipe),
      "weeks/2026-W32.json": JSON.stringify({
        isoWeek: "2026-W32",
        menu: [{ recipeSlug: "sheet-pan-salmon-quinoa", days: ["monday"] }],
        snacks: [],
      }),
      "weeks/2026-W33.json": JSON.stringify({
        isoWeek: "2026-W33",
        menu: [{ recipeSlug: "missing-recipe", days: ["monday"] }],
        snacks: [],
      }),
    });
    const { weeks } = loadContent(dir);
    expect(weeks.map((week) => week.isoWeek)).toEqual(["2026-W32"]);
  });
});

describe("getLatestWeekDigest", () => {
  it("returns null before the first week is published", () => {
    expect(getLatestWeekDigest(makeContentDir())).toBeNull();
  });

  it("returns the newest week with its recipes and derived shopping list", () => {
    const digest = getLatestWeekDigest(fullContentDir());
    expect(digest).not.toBeNull();
    if (digest === null) return;
    expect(digest.week.isoWeek).toBe("2026-W33");
    expect(Object.keys(digest.recipesBySlug).sort()).toEqual([
      "roasted-almonds",
      "sheet-pan-salmon-quinoa",
      "spinach-berry-salad",
    ]);
    // Shopping list is derived: olive oil merges across both meal recipes.
    const pantry = digest.shoppingList.find((section) => section.section === "pantry");
    expect(pantry).toBeDefined();
    const oliveOil = pantry?.items.find((item) => item.name === "extra-virgin olive oil");
    expect(oliveOil?.quantity).toBe(3);
    // Safety notes survive into the derived list.
    const almonds = pantry?.items.find((item) => item.name === "raw almonds");
    expect(almonds?.safetyNotes).toHaveLength(1);
  });
});

describe("getWeekDigest", () => {
  it("returns the requested week", () => {
    const digest = getWeekDigest("2026-W32", fullContentDir());
    expect(digest?.week.isoWeek).toBe("2026-W32");
  });

  it("returns null for an unpublished week", () => {
    expect(getWeekDigest("2026-W40", fullContentDir())).toBeNull();
  });
});

describe("listWeekSummaries", () => {
  it("returns empty for no content", () => {
    expect(listWeekSummaries(makeContentDir())).toEqual([]);
  });

  it("returns newest-first rows with counts", () => {
    expect(listWeekSummaries(fullContentDir())).toEqual([
      { isoWeek: "2026-W33", mealCount: 2, snackCount: 1 },
      { isoWeek: "2026-W32", mealCount: 2, snackCount: 1 },
    ]);
  });
});
