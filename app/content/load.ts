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
import { denverToday } from "~/utils/denver-today";
import { weekContains } from "~/utils/week-dates";
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

/** What the home page renders: one week, plus a pointer to a newer one. */
export type HomeDigest = {
  digest: WeekDigestData;
  /**
   * `weekStart` of the next published week after the displayed one, or
   * `null` when the displayed week is the newest on disk.
   */
  newerWeekStart: string | null;
};

/**
 * The week the home page should lead with: the published week whose
 * Sunday→Saturday span contains TODAY in America/Denver.
 *
 * Why not simply the newest week on disk: the Thursday reminder makes
 * "publish next week" the happy path, so from Thursday until Sunday the
 * newest file is a week nobody is cooking yet. Leading with it would show
 * next week's menu and shopping list while the household is still working
 * through the current one.
 *
 * Fallback: when no published week contains today — a skipped week, or only
 * older (or only future) weeks on disk — fall back to the newest week on
 * disk rather than rendering nothing. A gap in publishing must degrade to a
 * stale-but-real digest, never to an empty front page.
 *
 * `now` is injectable for tests. It is read here, in server-only code called
 * from a loader, and never during component render — see the warning in
 * `app/utils/denver-today.ts`.
 */
export function getHomeDigest(
  dir: string = defaultContentDir(),
  now: Date = new Date()
): HomeDigest | null {
  const { weeks, recipesBySlug } = loadContent(dir);
  if (weeks.length === 0) return null;

  const today = denverToday(now);
  // `weeks` is newest-first, so the first containing match is the only one
  // (weeks cannot overlap — the identifier is unique and every span is
  // exactly 7 days).
  const index = weeks.findIndex((week) => weekContains(week.weekStart, today));
  // -1 → no week covers today; fall back to the newest on disk (index 0).
  const chosenIndex = index === -1 ? 0 : index;
  const chosen = weeks[chosenIndex];
  if (chosen === undefined) return null;

  // Newest-first ordering means the NEXT published week sits one slot
  // earlier. Absent when the displayed week is already the newest.
  const newer = weeks[chosenIndex - 1];
  return {
    digest: toDigest(chosen, recipesBySlug),
    newerWeekStart: newer === undefined ? null : newer.weekStart,
  };
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
