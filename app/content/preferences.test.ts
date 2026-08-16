import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { loadPreferences, validatePreferences } from "./preferences";

// All sample food data below follows the golden rules in
// docs/agents/dietary-safety.md. Sample content is written to os.tmpdir()
// (never to a fixtures/ directory) per repo convention.

const tempDirs: string[] = [];
afterAll(() => {
  for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true });
});

/** Create a temp content dir, optionally writing preferences.json text. */
function makeContentDir(preferencesText?: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "content-preferences-"));
  tempDirs.push(dir);
  if (preferencesText !== undefined) {
    fs.writeFileSync(path.join(dir, "preferences.json"), preferencesText);
  }
  return dir;
}

function preferences(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    servingsPerMeal: 4,
    freshMealsPerWeekMin: 2,
    snacksPerWeekTarget: 3,
    fattyFishMealsPerWeekMin: 2,
    distinctFoodsPerWeekTarget: 30,
    pantryStaples: ["extra-virgin olive oil", "quinoa", "brown rice"],
    avoidIngredients: [],
    ...overrides,
  };
}

describe("validatePreferences", () => {
  it("returns the typed config on success", () => {
    const result = validatePreferences(preferences());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.servingsPerMeal).toBe(4);
      expect(result.data.pantryStaples).toContain("quinoa");
      expect(result.data.avoidIngredients).toEqual([]);
    }
  });

  it("accepts zero for the non-negative fields", () => {
    const result = validatePreferences(
      preferences({ freshMealsPerWeekMin: 0, snacksPerWeekTarget: 0, fattyFishMealsPerWeekMin: 0 })
    );
    expect(result.ok).toBe(true);
  });

  it.each([
    ["servingsPerMeal", 0],
    ["servingsPerMeal", 1.5],
    ["freshMealsPerWeekMin", -1],
    ["snacksPerWeekTarget", -1],
    ["fattyFishMealsPerWeekMin", 2.5],
    ["distinctFoodsPerWeekTarget", 0],
    ["pantryStaples", ["quinoa", ""]],
    ["pantryStaples", "quinoa"],
    ["avoidIngredients", [42]],
  ] as const)("rejects invalid %s = %j with the field path", (field, value) => {
    const result = validatePreferences(preferences({ [field]: value }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.map((error) => error.path.split(".")[0])).toContain(field);
    }
  });

  it.each([
    "servingsPerMeal",
    "freshMealsPerWeekMin",
    "snacksPerWeekTarget",
    "fattyFishMealsPerWeekMin",
    "distinctFoodsPerWeekTarget",
    "pantryStaples",
    "avoidIngredients",
  ] as const)("rejects a config missing %s", (field) => {
    const input = preferences();
    delete input[field];
    const result = validatePreferences(input);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.map((error) => error.path)).toContain(field);
    }
  });

  it("rejects unknown keys (strict schema), naming the key", () => {
    // Hand-edited config: a typo'd or smuggled key (e.g. a "forbidden
    // ingredients" knob — the golden rules are NOT configurable) must fail
    // loudly, never be silently stripped. Zod reports unrecognized keys at
    // the object root with the key name in the message.
    const result = validatePreferences(preferences({ forbiddenIngredients: ["anything"] }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((error) => error.message.includes("forbiddenIngredients"))).toBe(
        true
      );
    }
  });

  it("rejects non-object input without throwing", () => {
    expect(validatePreferences("not a config").ok).toBe(false);
    expect(validatePreferences(null).ok).toBe(false);
  });
});

describe("loadPreferences", () => {
  it("treats an absent file as a defined non-error state (ok, data null)", () => {
    const dir = makeContentDir();
    expect(loadPreferences(dir)).toEqual({ ok: true, data: null });
  });

  it("treats an absent directory the same as an absent file", () => {
    const dir = makeContentDir();
    expect(loadPreferences(path.join(dir, "does-not-exist"))).toEqual({ ok: true, data: null });
  });

  it("loads and validates a well-formed file", () => {
    const dir = makeContentDir(JSON.stringify(preferences()));
    const result = loadPreferences(dir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data?.distinctFoodsPerWeekTarget).toBe(30);
    }
  });

  it("reports malformed JSON with the file name, without throwing", () => {
    const dir = makeContentDir("{ not json");
    const result = loadPreferences(dir);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.file).toBe("preferences.json");
      expect(result.errors[0]?.message).toMatch(/malformed JSON/);
    }
  });

  it("reports schema violations with file and field path", () => {
    const dir = makeContentDir(JSON.stringify(preferences({ servingsPerMeal: -4 })));
    const result = loadPreferences(dir);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]?.file).toBe("preferences.json");
      expect(result.errors[0]?.path).toBe("servingsPerMeal");
    }
  });
});
