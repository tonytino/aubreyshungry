/**
 * Content access for the digest site (issue #5) — the read side of the
 * ADR-006 storage seam. Server-only: this module touches the filesystem via
 * `validateContentDir`; never import it from client code (routes may import
 * it because the server-function compiler strips handler-only imports from
 * the client bundle).
 *
 * All reads flow through `validateContentDir` (`./validate.ts`), never raw
 * `fs`, so a future database-backed adapter can swap in behind the same
 * functions.
 *
 * Degradation policy (deliberate): the site renders only weeks that are
 * individually valid AND whose every menu/snack slug resolves to a valid
 * recipe. CI's content gates make broken content on `main` a bug; if it
 * ever happens anyway, omitting the broken week beats crashing the whole
 * site or rendering a menu with holes. An absent `content/` directory is
 * valid-and-empty — the site launches before the first week is published.
 */

import * as path from "node:path";
import type { Recipe, Week } from "./schema";
import { type ShoppingList, buildShoppingList } from "./shopping-list";
import { validateContentDir } from "./validate";

/** Everything a digest page needs to render one week. */
export type WeekDigestData = {
  week: Week;
  /** Only the recipes this week references (menu + snacks). */
  recipesBySlug: Record<string, Recipe>;
  shoppingList: ShoppingList;
};

/** One archive-index row. */
export type WeekSummary = {
  weekStart: string;
  mealCount: number;
  snackCount: number;
};

function defaultContentDir(): string {
  return path.resolve(process.cwd(), "content");
}

export type LoadedContent = {
  /**
   * Renderable weeks, newest first. `weekStart` is zero-padded `YYYY-MM-DD`,
   * so a plain string sort is still date order — no parsing needed.
   */
  weeks: Week[];
  recipesBySlug: Record<string, Recipe>;
};

function referencedSlugs(week: Week): string[] {
  return [...week.menu.map((meal) => meal.recipeSlug), ...week.snacks];
}

/** Load and validate the whole content directory. See the module header for the degradation policy. */
export function loadContent(dir: string = defaultContentDir()): LoadedContent {
  const result = validateContentDir(dir);
  const recipesBySlug: Record<string, Recipe> = {};
  for (const recipe of result.recipes) {
    recipesBySlug[recipe.slug] = recipe;
  }
  const weeks = result.weeks
    .filter((week) => referencedSlugs(week).every((slug) => recipesBySlug[slug] !== undefined))
    .sort((a, b) => (a.weekStart < b.weekStart ? 1 : a.weekStart > b.weekStart ? -1 : 0));
  return { weeks, recipesBySlug };
}

function toDigest(week: Week, recipesBySlug: Record<string, Recipe>): WeekDigestData {
  const subset: Record<string, Recipe> = {};
  for (const slug of referencedSlugs(week)) {
    const recipe = recipesBySlug[slug];
    if (recipe !== undefined) {
      subset[slug] = recipe;
    }
  }
  return {
    week,
    recipesBySlug: subset,
    shoppingList: buildShoppingList(week, recipesBySlug),
  };
}

/** The most recent published week, or `null` before the first publish. */
export function getLatestWeekDigest(dir: string = defaultContentDir()): WeekDigestData | null {
  const { weeks, recipesBySlug } = loadContent(dir);
  const latest = weeks[0];
  return latest === undefined ? null : toDigest(latest, recipesBySlug);
}

/** A specific week's digest, or `null` when that week isn't published. */
export function getWeekDigest(
  weekStart: string,
  dir: string = defaultContentDir()
): WeekDigestData | null {
  const { weeks, recipesBySlug } = loadContent(dir);
  const week = weeks.find((candidate) => candidate.weekStart === weekStart);
  return week === undefined ? null : toDigest(week, recipesBySlug);
}

/** Archive index rows, newest first. */
export function listWeekSummaries(dir: string = defaultContentDir()): WeekSummary[] {
  return loadContent(dir).weeks.map((week) => ({
    weekStart: week.weekStart,
    mealCount: week.menu.length,
    snackCount: week.snacks.length,
  }));
}
