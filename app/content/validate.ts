/**
 * Content validation — the storage-adapter seam from ADR-006.
 *
 * All content access should flow through this module (parse a week, parse a
 * recipe, validate the whole content directory) rather than scattered `fs`
 * calls, so a database-backed implementation can later swap in behind the
 * same interface with the JSON files as seed data.
 *
 * Server/CI-only: this module touches the filesystem. Never import it from
 * client-side code.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { z } from "zod";
import { type Recipe, RecipeSchema, type Week, WeekSchema } from "./schema";

/** One content problem, precise enough to fix without re-running anything. */
export type ContentError = {
  /** Path of the offending file relative to the content dir, or "" for non-file errors. */
  file: string;
  /** Dotted path into the JSON document (e.g. "menu.0.recipeSlug"), or "" for file-level errors. */
  path: string;
  message: string;
};

export type ValidateResult<T> = { ok: true; data: T } | { ok: false; errors: ContentError[] };

/** Convert a ZodError into ContentErrors, tagging each with the source file. */
function zodErrorToContentErrors(error: z.ZodError, file = ""): ContentError[] {
  return error.issues.map((issue) => ({
    file,
    path: issue.path.join("."),
    message: issue.message,
  }));
}

/** Parse + validate one week document (already-parsed JSON, unknown shape). */
export function validateWeek(input: unknown): ValidateResult<Week> {
  const result = WeekSchema.safeParse(input);
  return result.success
    ? { ok: true, data: result.data }
    : { ok: false, errors: zodErrorToContentErrors(result.error) };
}

/** Parse + validate one recipe document (already-parsed JSON, unknown shape). */
export function validateRecipe(input: unknown): ValidateResult<Recipe> {
  const result = RecipeSchema.safeParse(input);
  return result.success
    ? { ok: true, data: result.data }
    : { ok: false, errors: zodErrorToContentErrors(result.error) };
}

export type ContentDirResult = {
  /** True iff `errors` is empty. */
  ok: boolean;
  errors: ContentError[];
  /** Weeks that individually parsed and validated (even when `ok` is false). */
  weeks: Week[];
  /** Recipes that individually parsed and validated (even when `ok` is false). */
  recipes: Recipe[];
};

/** Read and JSON-parse one file, reporting malformed JSON as a ContentError. */
function readJsonFile(
  absolute: string,
  relative: string
): { data: unknown } | { error: ContentError } {
  const text = fs.readFileSync(absolute, "utf-8");
  try {
    return { data: JSON.parse(text) as unknown };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    return { error: { file: relative, path: "", message: `malformed JSON: ${message}` } };
  }
}

/** List the .json files in `dir` (absent dir = empty), sorted for stable output. */
function listJsonFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .sort();
}

/**
 * Validate an entire content directory (`content/` in the repo):
 *
 * - every `weeks/*.json` file parses and matches `WeekSchema`;
 * - every `recipes/*.json` file parses and matches `RecipeSchema`;
 * - each file's basename matches its identifier (`<isoWeek>.json`,
 *   `<slug>.json`) — the filename IS the identity per ADR-006;
 * - no duplicate recipe slugs or week identifiers;
 * - referential integrity: every recipeSlug referenced by any week
 *   (menu + snacks) resolves to a recipe file. A dangling reference names
 *   the week and the slug.
 *
 * Content problems are collected into `errors`, never thrown. An absent
 * `dir` (or absent subdirectories) is valid-and-empty: absence of content
 * is not an error.
 */
export function validateContentDir(dir: string): ContentDirResult {
  const errors: ContentError[] = [];
  const weeks: Week[] = [];
  const recipes: Recipe[] = [];

  const recipesDir = path.join(dir, "recipes");
  const weeksDir = path.join(dir, "weeks");

  // -- Recipes ------------------------------------------------------------
  const recipeSlugs = new Set<string>();
  for (const name of listJsonFiles(recipesDir)) {
    const relative = path.join("recipes", name);
    const parsed = readJsonFile(path.join(recipesDir, name), relative);
    if ("error" in parsed) {
      errors.push(parsed.error);
      continue;
    }
    const result = RecipeSchema.safeParse(parsed.data);
    if (!result.success) {
      errors.push(...zodErrorToContentErrors(result.error, relative));
      continue;
    }
    const recipe = result.data;
    if (recipeSlugs.has(recipe.slug)) {
      errors.push({
        file: relative,
        path: "slug",
        message: `duplicate recipe slug "${recipe.slug}"`,
      });
      continue;
    }
    recipeSlugs.add(recipe.slug);
    if (recipe.slug !== path.basename(name, ".json")) {
      errors.push({
        file: relative,
        path: "slug",
        message: `slug "${recipe.slug}" does not match its filename (expected ${recipe.slug}.json)`,
      });
    }
    recipes.push(recipe);
  }

  // -- Weeks --------------------------------------------------------------
  const weekIds = new Set<string>();
  for (const name of listJsonFiles(weeksDir)) {
    const relative = path.join("weeks", name);
    const parsed = readJsonFile(path.join(weeksDir, name), relative);
    if ("error" in parsed) {
      errors.push(parsed.error);
      continue;
    }
    const result = WeekSchema.safeParse(parsed.data);
    if (!result.success) {
      errors.push(...zodErrorToContentErrors(result.error, relative));
      continue;
    }
    const week = result.data;
    if (weekIds.has(week.isoWeek)) {
      errors.push({
        file: relative,
        path: "isoWeek",
        message: `duplicate week "${week.isoWeek}"`,
      });
      continue;
    }
    weekIds.add(week.isoWeek);
    if (week.isoWeek !== path.basename(name, ".json")) {
      errors.push({
        file: relative,
        path: "isoWeek",
        message: `isoWeek "${week.isoWeek}" does not match its filename (expected ${week.isoWeek}.json)`,
      });
    }
    weeks.push(week);

    // Referential integrity: menu + snacks must resolve to recipe files.
    for (const [index, meal] of week.menu.entries()) {
      if (!recipeSlugs.has(meal.recipeSlug)) {
        errors.push({
          file: relative,
          path: `menu.${index}.recipeSlug`,
          message: `week "${week.isoWeek}" references missing recipe "${meal.recipeSlug}"`,
        });
      }
    }
    for (const [index, slug] of week.snacks.entries()) {
      if (!recipeSlugs.has(slug)) {
        errors.push({
          file: relative,
          path: `snacks.${index}`,
          message: `week "${week.isoWeek}" references missing recipe "${slug}"`,
        });
      }
    }
  }

  return { ok: errors.length === 0, errors, weeks, recipes };
}
