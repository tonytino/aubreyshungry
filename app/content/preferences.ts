/**
 * Household preferences config — the neutral tuning knobs the weekly plan
 * generator reads (`docs/agents/generation.md`), stored at
 * `content/preferences.json` and validated here.
 *
 * Server/CI-only: this module touches the filesystem. Never import it from
 * client-side code.
 *
 * Scope boundary (do not blur it): everything in this file is a PREFERENCE —
 * batch sizes, targets, soft dislikes. The golden rules
 * (`docs/agents/dietary-safety.md`) are NOT preferences and have no
 * representation here; see the loud note on `avoidIngredients` below.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { z } from "zod";
import type { ContentError, ValidateResult } from "./validate";

export const PreferencesSchema = z.object({
  /** Batch target for meal-prep recipes: how many servings one cook produces. */
  servingsPerMeal: z.number().int().positive("servingsPerMeal must be a positive integer"),
  /**
   * Minimum number of fresh (made day-of, ~20 min) meals per week — the
   * fresh-vs-meal-prep floor. Every week includes some fresh meals so the
   * plan doesn't collapse into pure logistics (`docs/agents/domain.md`).
   */
  freshMealsPerWeekMin: z
    .number()
    .int()
    .nonnegative("freshMealsPerWeekMin must be a non-negative integer"),
  /** How many snack recipes a week should carry. */
  snacksPerWeekTarget: z
    .number()
    .int()
    .nonnegative("snacksPerWeekTarget must be a non-negative integer"),
  /**
   * Minimum fatty-fish meals per week. The nutrition guidance
   * (`docs/agents/nutrition-guidelines.md`) says 2+ servings/week.
   */
  fattyFishMealsPerWeekMin: z
    .number()
    .int()
    .nonnegative("fattyFishMealsPerWeekMin must be a non-negative integer"),
  /**
   * Distinct-foods-per-week variety target (~30 per
   * `docs/agents/nutrition-guidelines.md` — variety is the mechanism).
   */
  distinctFoodsPerWeekTarget: z
    .number()
    .int()
    .positive("distinctFoodsPerWeekTarget must be a positive integer"),
  /**
   * Items assumed already on hand (oils, staple grains, everyday spices).
   * GENERATOR CONTEXT ONLY: this list nudges the generator toward recipes
   * that lean on the staples. It MUST NOT change shopping-list derivation —
   * the shopping list is always the full aggregation of the week's recipe
   * ingredients (`docs/agents/domain.md`), never filtered by this list, so
   * a shopper who is out of a staple still sees it.
   */
  pantryStaples: z.array(z.string().trim().min(1, "pantry staples must be non-empty strings")),
  /**
   * Soft dislikes/preferences ONLY — "prefer not to plan around these"
   * ingredients the generator steers away from when alternatives exist.
   *
   * ⚠️ THE GOLDEN RULES ARE NOT PREFERENCES. They are NOT configurable here
   * and NEVER belong in this list. `docs/agents/dietary-safety.md` is the
   * only source of safety constraints (gluten-free, no cashews/pistachios,
   * anti-inflammatory), enforced by schema review + `pnpm lint:dietary` —
   * an empty `avoidIngredients` weakens nothing, and adding a forbidden
   * ingredient here would neither strengthen nor replace those gates.
   */
  avoidIngredients: z
    .array(z.string().trim().min(1, "avoided ingredients must be non-empty strings"))
    .describe("soft dislikes only — never safety constraints"),
});

export type Preferences = z.infer<typeof PreferencesSchema>;

/** Convert a ZodError into ContentErrors, tagging each with the source file. */
function zodErrorToContentErrors(error: z.ZodError, file = ""): ContentError[] {
  return error.issues.map((issue) => ({
    file,
    path: issue.path.join("."),
    message: issue.message,
  }));
}

/** Parse + validate a preferences document (already-parsed JSON, unknown shape). */
export function validatePreferences(input: unknown): ValidateResult<Preferences> {
  const result = PreferencesSchema.safeParse(input);
  return result.success
    ? { ok: true, data: result.data }
    : { ok: false, errors: zodErrorToContentErrors(result.error) };
}

/** Path of the preferences file relative to the content dir. */
export const PREFERENCES_FILE = "preferences.json";

function defaultContentDir(): string {
  return path.resolve(process.cwd(), "content");
}

/**
 * Load `content/preferences.json` from `dir` (default: `content/` under the
 * working directory), following the never-throws contract of
 * `validateContentDir`:
 *
 * - Absent file (or absent dir) → `{ ok: true, data: null }`. Absence is a
 *   defined, non-error state: the generator falls back to asking the owner,
 *   and CI stays green before the config lands (mirrors "absence of content
 *   is not an error" in `./validate.ts`).
 * - Unreadable or malformed JSON → `{ ok: false, errors }` naming the file.
 * - Schema violations → `{ ok: false, errors }` with dotted field paths.
 */
export function loadPreferences(
  dir: string = defaultContentDir()
): ValidateResult<Preferences | null> {
  const absolute = path.join(dir, PREFERENCES_FILE);
  if (!fs.existsSync(absolute)) {
    return { ok: true, data: null };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(absolute, "utf-8")) as unknown;
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    const label = cause instanceof SyntaxError ? "malformed JSON" : "unreadable file";
    return {
      ok: false,
      errors: [{ file: PREFERENCES_FILE, path: "", message: `${label}: ${message}` }],
    };
  }
  const result = PreferencesSchema.safeParse(parsed);
  return result.success
    ? { ok: true, data: result.data }
    : { ok: false, errors: zodErrorToContentErrors(result.error, PREFERENCES_FILE) };
}
