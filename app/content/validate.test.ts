import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { validateContentDir, validateRecipe, validateWeek } from "./validate";

// All sample food data below follows the golden rules in
// docs/agents/dietary-safety.md. Sample content is written to os.tmpdir()
// (never to a fixtures/ directory) per repo convention.

const tempDirs: string[] = [];
afterAll(() => {
  for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true });
});

/** Create a temp content dir and populate weeks/ and recipes/ with JSON strings. */
function makeContentDir(files: Record<string, string> = {}): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "content-validate-"));
  tempDirs.push(dir);
  for (const [relative, text] of Object.entries(files)) {
    const absolute = path.join(dir, relative);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, text);
  }
  return dir;
}

function recipeJson(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    slug: "turmeric-ginger-trout",
    title: "Turmeric Ginger Trout",
    servings: 4,
    prepMinutes: 10,
    cookMinutes: 20,
    style: "meal-prep",
    ingredients: [
      { name: "trout fillet", quantity: 1.5, unit: "lb", section: "protein" },
      { name: "ground turmeric", quantity: 1, unit: "tsp", section: "spices" },
      { name: "fresh ginger", quantity: 1, unit: "piece", section: "produce" },
      { name: "extra-virgin olive oil", quantity: 2, unit: "tbsp", section: "pantry" },
    ],
    steps: [
      "Rub the trout with turmeric, grated ginger, and olive oil.",
      "Bake at 400F until the fish flakes, about 15 minutes.",
    ],
    storageNotes: "Refrigerate up to 3 days; reheat covered at low heat.",
    ...overrides,
  });
}

function weekJson(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    isoWeek: "2026-W33",
    menu: [{ recipeSlug: "turmeric-ginger-trout", days: ["monday", "wednesday"] }],
    snacks: [],
    ...overrides,
  });
}

describe("validateWeek", () => {
  it("returns the typed week on success", () => {
    const result = validateWeek(JSON.parse(weekJson()));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.isoWeek).toBe("2026-W33");
      expect(result.data.menu[0].recipeSlug).toBe("turmeric-ginger-trout");
    }
  });

  it("returns typed errors with paths on failure", () => {
    const result = validateWeek({ isoWeek: "2026-W54", menu: [], snacks: [] });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const paths = result.errors.map((error) => error.path);
      expect(paths).toContain("isoWeek");
      expect(paths).toContain("menu");
    }
  });

  it("rejects non-object input without throwing", () => {
    expect(validateWeek("not a week").ok).toBe(false);
    expect(validateWeek(null).ok).toBe(false);
  });
});

describe("validateRecipe", () => {
  it("returns the typed recipe on success", () => {
    const result = validateRecipe(JSON.parse(recipeJson()));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.slug).toBe("turmeric-ginger-trout");
      expect(result.data.ingredients).toHaveLength(4);
    }
  });

  it("returns typed errors with paths on failure", () => {
    const result = validateRecipe(JSON.parse(recipeJson({ servings: 0, ingredients: [] })));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const paths = result.errors.map((error) => error.path);
      expect(paths).toContain("servings");
      expect(paths).toContain("ingredients");
    }
  });
});

describe("validateContentDir", () => {
  it("treats an absent directory as valid and empty", () => {
    const dir = makeContentDir();
    const result = validateContentDir(path.join(dir, "does-not-exist"));
    expect(result).toEqual({ ok: true, errors: [], weeks: [], recipes: [] });
  });

  it("treats absent weeks/ and recipes/ subdirectories as empty", () => {
    const dir = makeContentDir();
    const result = validateContentDir(dir);
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("validates a consistent content dir", () => {
    const dir = makeContentDir({
      "recipes/turmeric-ginger-trout.json": recipeJson(),
      "recipes/rosemary-almonds.json": recipeJson({
        slug: "rosemary-almonds",
        title: "Rosemary Almonds",
        style: "snack",
        storageNotes: undefined,
        ingredients: [
          {
            name: "almonds",
            quantity: 2,
            unit: "cup",
            section: "pantry",
            safetyNote:
              "check label: processed in a facility free of cashew/pistachio cross-contact",
          },
          { name: "fresh rosemary", quantity: 2, unit: "sprig", section: "produce" },
        ],
      }),
      "weeks/2026-W33.json": weekJson({ snacks: ["rosemary-almonds"] }),
    });
    const result = validateContentDir(dir);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.weeks).toHaveLength(1);
    expect(result.recipes).toHaveLength(2);
  });

  it("reports malformed JSON with the file name, without throwing", () => {
    const dir = makeContentDir({
      "recipes/turmeric-ginger-trout.json": "{ not json",
    });
    const result = validateContentDir(dir);
    expect(result.ok).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.file).toBe(path.join("recipes", "turmeric-ginger-trout.json"));
    expect(result.errors[0]?.message).toMatch(/malformed JSON/);
  });

  it("reports schema violations with file and path", () => {
    const dir = makeContentDir({
      "weeks/2026-W33.json": weekJson({ menu: [] }),
    });
    const result = validateContentDir(dir);
    expect(result.ok).toBe(false);
    expect(result.errors[0]?.file).toBe(path.join("weeks", "2026-W33.json"));
    expect(result.errors[0]?.path).toBe("menu");
  });

  it("reports a dangling menu reference naming the week and slug", () => {
    const dir = makeContentDir({
      "weeks/2026-W33.json": weekJson(),
    });
    const result = validateContentDir(dir);
    expect(result.ok).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.message).toContain("2026-W33");
    expect(result.errors[0]?.message).toContain("turmeric-ginger-trout");
    expect(result.errors[0]?.path).toBe("menu.0.recipeSlug");
  });

  it("reports a dangling snack reference naming the week and slug", () => {
    const dir = makeContentDir({
      "recipes/turmeric-ginger-trout.json": recipeJson(),
      "weeks/2026-W33.json": weekJson({ snacks: ["rosemary-almonds"] }),
    });
    const result = validateContentDir(dir);
    expect(result.ok).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.message).toContain("2026-W33");
    expect(result.errors[0]?.message).toContain("rosemary-almonds");
    expect(result.errors[0]?.path).toBe("snacks.0");
  });

  it("reports duplicate recipe slugs across files", () => {
    const dir = makeContentDir({
      "recipes/turmeric-ginger-trout.json": recipeJson(),
      // Same declared slug under a different filename.
      "recipes/zz-duplicate.json": recipeJson(),
      "weeks/2026-W33.json": weekJson(),
    });
    const result = validateContentDir(dir);
    expect(result.ok).toBe(false);
    expect(result.errors.some((error) => error.message.includes("duplicate recipe slug"))).toBe(
      true
    );
  });

  it("reports a slug that does not match its filename", () => {
    const dir = makeContentDir({
      "recipes/misnamed.json": recipeJson(),
    });
    const result = validateContentDir(dir);
    expect(result.ok).toBe(false);
    expect(result.errors[0]?.message).toContain("does not match its filename");
  });

  it("reports an isoWeek that does not match its filename", () => {
    const dir = makeContentDir({
      "recipes/turmeric-ginger-trout.json": recipeJson(),
      "weeks/2026-W34.json": weekJson(),
    });
    const result = validateContentDir(dir);
    expect(result.ok).toBe(false);
    expect(result.errors[0]?.message).toContain("does not match its filename");
  });

  it("collects errors across many files instead of stopping at the first", () => {
    const dir = makeContentDir({
      "recipes/broken.json": "[not json",
      "weeks/2026-W33.json": weekJson(),
      "weeks/2026-W34.json": weekJson({
        isoWeek: "2026-W34",
        menu: [{ recipeSlug: "missing-dish", days: ["friday"] }],
      }),
    });
    const result = validateContentDir(dir);
    expect(result.ok).toBe(false);
    // Malformed recipe file + two dangling references (one per week).
    expect(result.errors.length).toBeGreaterThanOrEqual(3);
  });
});
