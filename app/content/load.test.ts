import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { getHomeDigest, getWeekDigest, listWeekSummaries, loadContent } from "./load";

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

function weekDoc(weekStart: string, overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    weekStart,
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
    "weeks/2026-08-09.json": weekDoc("2026-08-09"),
    "weeks/2026-08-16.json": weekDoc("2026-08-16"),
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
    expect(weeks.map((week) => week.weekStart)).toEqual(["2026-08-16", "2026-08-09"]);
  });

  it("sorts by date across month and year boundaries (zero-padded string sort)", () => {
    // The sort compares weekStart as plain strings. That is only correct
    // because YYYY-MM-DD is zero-padded and big-endian — this pins it, so a
    // future identifier format can't quietly break archive ordering.
    const dir = makeContentDir({
      "recipes/sheet-pan-salmon-quinoa.json": JSON.stringify(salmonRecipe),
      "recipes/spinach-berry-salad.json": JSON.stringify(spinachSaladRecipe),
      "recipes/roasted-almonds.json": JSON.stringify(almondSnackRecipe),
      "weeks/2025-12-28.json": weekDoc("2025-12-28"),
      "weeks/2026-01-04.json": weekDoc("2026-01-04"),
      "weeks/2026-09-06.json": weekDoc("2026-09-06"),
      "weeks/2026-08-30.json": weekDoc("2026-08-30"),
    });
    expect(loadContent(dir).weeks.map((week) => week.weekStart)).toEqual([
      "2026-09-06",
      "2026-08-30",
      "2026-01-04",
      "2025-12-28",
    ]);
  });

  it("omits weeks with dangling recipe references instead of crashing", () => {
    const dir = makeContentDir({
      "recipes/sheet-pan-salmon-quinoa.json": JSON.stringify(salmonRecipe),
      "weeks/2026-08-09.json": JSON.stringify({
        weekStart: "2026-08-09",
        menu: [{ recipeSlug: "sheet-pan-salmon-quinoa", days: ["monday"] }],
        snacks: [],
      }),
      "weeks/2026-08-16.json": JSON.stringify({
        weekStart: "2026-08-16",
        menu: [{ recipeSlug: "missing-recipe", days: ["monday"] }],
        snacks: [],
      }),
    });
    const { weeks } = loadContent(dir);
    expect(weeks.map((week) => week.weekStart)).toEqual(["2026-08-09"]);
  });
});

describe("getWeekDigest", () => {
  it("returns the requested week", () => {
    const digest = getWeekDigest("2026-08-09", fullContentDir());
    expect(digest?.week.weekStart).toBe("2026-08-09");
  });

  it("returns null for an unpublished week", () => {
    expect(getWeekDigest("2026-10-04", fullContentDir())).toBeNull();
  });
});

describe("listWeekSummaries", () => {
  it("returns empty for no content", () => {
    expect(listWeekSummaries(makeContentDir())).toEqual([]);
  });

  it("returns newest-first rows with counts", () => {
    expect(listWeekSummaries(fullContentDir())).toEqual([
      { weekStart: "2026-08-16", mealCount: 2, snackCount: 1 },
      { weekStart: "2026-08-09", mealCount: 2, snackCount: 1 },
    ]);
  });
});

describe("getHomeDigest", () => {
  // Three consecutive published weeks, plus a fourth after a one-week gap.
  // Aug 16, Aug 23 and Aug 30 are consecutive Sundays; Sep 13 leaves Sep 6
  // unpublished, which is the "skipped week" case.
  function archive(): string {
    return makeContentDir({
      "recipes/sheet-pan-salmon-quinoa.json": JSON.stringify(salmonRecipe),
      "recipes/spinach-berry-salad.json": JSON.stringify(spinachSaladRecipe),
      "recipes/roasted-almonds.json": JSON.stringify(almondSnackRecipe),
      "weeks/2026-08-16.json": weekDoc("2026-08-16"),
      "weeks/2026-08-23.json": weekDoc("2026-08-23"),
      "weeks/2026-08-30.json": weekDoc("2026-08-30"),
      "weeks/2026-09-13.json": weekDoc("2026-09-13"),
    });
  }

  /** Noon in Denver on the given calendar date — safely mid-day. */
  function denverNoon(date: string): Date {
    return new Date(`${date}T18:00:00Z`);
  }

  it("returns null before the first week is published", () => {
    expect(getHomeDigest(makeContentDir(), denverNoon("2026-08-18"))).toBeNull();
  });

  it("leads with the week containing today, not the newest on disk", () => {
    // The regression this guards: publishing next week early must not take
    // over the front page while the household is still cooking this week.
    const home = getHomeDigest(archive(), denverNoon("2026-08-19"));
    expect(home?.digest.week.weekStart).toBe("2026-08-16");
  });

  it("selects the containing week from every day of its span", () => {
    for (const day of ["2026-08-23", "2026-08-24", "2026-08-26", "2026-08-28", "2026-08-29"]) {
      expect(getHomeDigest(archive(), denverNoon(day))?.digest.week.weekStart, day).toBe(
        "2026-08-23"
      );
    }
  });

  it("falls back to the newest week on disk when today sits in a gap", () => {
    // Sep 6 was never published. The page must not go empty.
    const home = getHomeDigest(archive(), denverNoon("2026-09-09"));
    expect(home).not.toBeNull();
    expect(home?.digest.week.weekStart).toBe("2026-09-13");
  });

  it("falls back when today is after every published week", () => {
    const home = getHomeDigest(archive(), denverNoon("2026-12-02"));
    expect(home?.digest.week.weekStart).toBe("2026-09-13");
  });

  it("falls back when today is before the earliest published week", () => {
    const home = getHomeDigest(archive(), denverNoon("2026-01-07"));
    expect(home?.digest.week.weekStart).toBe("2026-09-13");
    expect(home?.newerWeekStart).toBeNull();
  });

  it("falls back to the latest when only future weeks exist", () => {
    const dir = makeContentDir({
      "recipes/sheet-pan-salmon-quinoa.json": JSON.stringify(salmonRecipe),
      "recipes/spinach-berry-salad.json": JSON.stringify(spinachSaladRecipe),
      "recipes/roasted-almonds.json": JSON.stringify(almondSnackRecipe),
      "weeks/2026-11-08.json": weekDoc("2026-11-08"),
      "weeks/2026-11-15.json": weekDoc("2026-11-15"),
    });
    const home = getHomeDigest(dir, denverNoon("2026-08-19"));
    expect(home?.digest.week.weekStart).toBe("2026-11-15");
    expect(home?.newerWeekStart).toBeNull();
  });

  it("carries the displayed week's recipes and derived shopping list", () => {
    const home = getHomeDigest(archive(), denverNoon("2026-08-19"));
    expect(home).not.toBeNull();
    if (home === null) return;
    expect(Object.keys(home.digest.recipesBySlug).sort()).toEqual([
      "roasted-almonds",
      "sheet-pan-salmon-quinoa",
      "spinach-berry-salad",
    ]);
    // Shopping list is derived: olive oil merges across both meal recipes.
    const pantry = home.digest.shoppingList.find((section) => section.section === "pantry");
    expect(pantry).toBeDefined();
    const oliveOil = pantry?.items.find((item) => item.name === "extra-virgin olive oil");
    expect(oliveOil?.quantity).toBe(3);
    // Safety notes survive into the derived list — dietary-safety critical.
    const almonds = pantry?.items.find((item) => item.name === "raw almonds");
    expect(almonds?.safetyNotes).toHaveLength(1);
  });

  describe("newerWeekStart", () => {
    it("points at the next published week when one exists", () => {
      expect(getHomeDigest(archive(), denverNoon("2026-08-19"))?.newerWeekStart).toBe("2026-08-23");
      expect(getHomeDigest(archive(), denverNoon("2026-08-26"))?.newerWeekStart).toBe("2026-08-30");
    });

    it("skips over an unpublished week to the next one that exists", () => {
      // Displaying Aug 30; Sep 6 is missing, so the pointer is Sep 13.
      expect(getHomeDigest(archive(), denverNoon("2026-09-02"))?.newerWeekStart).toBe("2026-09-13");
    });

    it("is null when the displayed week is the newest on disk", () => {
      expect(getHomeDigest(archive(), denverNoon("2026-09-16"))?.newerWeekStart).toBeNull();
    });
  });

  describe("resolves today in America/Denver, not UTC", () => {
    it("stays on the current week when UTC has already rolled into the next", () => {
      // 05:00Z on Sun Aug 23 is 23:00 Sat Aug 22 in Denver (MDT, UTC-6).
      // A UTC-based implementation would jump to the Aug 23 week while the
      // household is still finishing Saturday dinner.
      const instant = new Date("2026-08-23T05:00:00Z");
      expect(instant.toISOString().slice(0, 10)).toBe("2026-08-23");
      const home = getHomeDigest(archive(), instant);
      expect(home?.digest.week.weekStart).toBe("2026-08-16");
      expect(home?.digest.week.weekStart).not.toBe("2026-08-23");
    });

    it("rolls to the next week exactly at Denver midnight", () => {
      expect(
        getHomeDigest(archive(), new Date("2026-08-23T05:59:59Z"))?.digest.week.weekStart
      ).toBe("2026-08-16");
      expect(
        getHomeDigest(archive(), new Date("2026-08-23T06:00:00Z"))?.digest.week.weekStart
      ).toBe("2026-08-23");
    });
  });

  describe("DST transitions", () => {
    function dstArchive(): string {
      return makeContentDir({
        "recipes/sheet-pan-salmon-quinoa.json": JSON.stringify(salmonRecipe),
        "recipes/spinach-berry-salad.json": JSON.stringify(spinachSaladRecipe),
        "recipes/roasted-almonds.json": JSON.stringify(almondSnackRecipe),
        "weeks/2026-03-01.json": weekDoc("2026-03-01"),
        "weeks/2026-03-08.json": weekDoc("2026-03-08"),
        "weeks/2026-10-25.json": weekDoc("2026-10-25"),
        "weeks/2026-11-01.json": weekDoc("2026-11-01"),
      });
    }

    it("rolls over at Denver midnight on the spring-forward Sunday (MST → MDT)", () => {
      // Midnight is 07:00Z because Denver is still on MST at that moment;
      // the skipped hour comes later that morning.
      const dir = dstArchive();
      expect(getHomeDigest(dir, new Date("2026-03-08T06:59:59Z"))?.digest.week.weekStart).toBe(
        "2026-03-01"
      );
      expect(getHomeDigest(dir, new Date("2026-03-08T07:00:00Z"))?.digest.week.weekStart).toBe(
        "2026-03-08"
      );
      // After the clocks jump, still the same week.
      expect(getHomeDigest(dir, new Date("2026-03-08T09:00:00Z"))?.digest.week.weekStart).toBe(
        "2026-03-08"
      );
      expect(getHomeDigest(dir, new Date("2026-03-14T18:00:00Z"))?.digest.week.weekStart).toBe(
        "2026-03-08"
      );
    });

    it("rolls over at Denver midnight on the fall-back Sunday (MDT → MST)", () => {
      // Midnight is 06:00Z (still MDT); 01:30 local then happens twice.
      const dir = dstArchive();
      expect(getHomeDigest(dir, new Date("2026-11-01T05:59:59Z"))?.digest.week.weekStart).toBe(
        "2026-10-25"
      );
      expect(getHomeDigest(dir, new Date("2026-11-01T06:00:00Z"))?.digest.week.weekStart).toBe(
        "2026-11-01"
      );
      // Both passes through the repeated hour stay in the new week.
      expect(getHomeDigest(dir, new Date("2026-11-01T07:30:00Z"))?.digest.week.weekStart).toBe(
        "2026-11-01"
      );
      expect(getHomeDigest(dir, new Date("2026-11-01T08:30:00Z"))?.digest.week.weekStart).toBe(
        "2026-11-01"
      );
      expect(getHomeDigest(dir, new Date("2026-11-07T18:00:00Z"))?.digest.week.weekStart).toBe(
        "2026-11-01"
      );
    });
  });
});
