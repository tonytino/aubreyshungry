import type { WeekDigestData } from "~/content/load";
import type { Recipe } from "~/content/schema";
import { formatIsoWeekRange, isoWeekLabel } from "~/utils/iso-week";
import { MenuByDay } from "./MenuByDay";
import { RecipeCard } from "./RecipeCard";
import { ShoppingListView } from "./ShoppingListView";
import { StyleBadge } from "./StyleBadge";

/**
 * The full digest for one week — the same layout serves the home page
 * (latest week) and the archive's `/week/$isoWeek` pages: week header,
 * notes, menu by day, snacks, derived shopping list, and every referenced
 * recipe inline as an expandable card.
 */
export function WeekDigest({ digest }: { digest: WeekDigestData }) {
  const { week, recipesBySlug, shoppingList } = digest;

  // Unique recipes in first-use order: menu first, then snacks.
  const orderedRecipes: Recipe[] = [];
  const seen = new Set<string>();
  for (const slug of [...week.menu.map((meal) => meal.recipeSlug), ...week.snacks]) {
    const recipe = recipesBySlug[slug];
    if (recipe !== undefined && !seen.has(slug)) {
      seen.add(slug);
      orderedRecipes.push(recipe);
    }
  }

  const snackRecipes = week.snacks
    .map((slug) => recipesBySlug[slug])
    .filter((recipe): recipe is Recipe => recipe !== undefined);

  return (
    <article className="flex flex-col gap-10">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">{isoWeekLabel(week.isoWeek)}</h1>
        <p className="text-muted-foreground mt-1">
          {formatIsoWeekRange(week.isoWeek)} · {week.isoWeek}
        </p>
      </header>

      {week.notes !== undefined && (
        <section aria-label="Week notes" className="print:hidden">
          <h2 className="text-xl font-semibold">Notes</h2>
          <p className="text-muted-foreground mt-2">{week.notes}</p>
        </section>
      )}

      <section aria-label="Menu" className="print:hidden">
        <h2 className="text-xl font-semibold">Menu</h2>
        <div className="mt-3">
          <MenuByDay menu={week.menu} recipesBySlug={recipesBySlug} />
        </div>
      </section>

      <section aria-label="Snacks" className="print:hidden">
        <h2 className="text-xl font-semibold">Snacks</h2>
        {snackRecipes.length === 0 ? (
          <p className="text-muted-foreground mt-2">No snacks planned this week.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {snackRecipes.map((recipe) => (
              <li key={recipe.slug} className="flex flex-wrap items-baseline gap-x-2">
                <a
                  href={`#recipe-${recipe.slug}`}
                  className="font-medium underline-offset-4 hover:underline"
                >
                  {recipe.title}
                </a>
                <StyleBadge style={recipe.style} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Shopping list">
        <h2 className="text-xl font-semibold print:text-black">Shopping list</h2>
        <div className="mt-3">
          <ShoppingListView list={shoppingList} />
        </div>
      </section>

      <section aria-label="Recipes" className="print:hidden">
        <h2 className="text-xl font-semibold">Recipes</h2>
        <div className="mt-3 flex flex-col gap-4">
          {orderedRecipes.map((recipe) => (
            <RecipeCard key={recipe.slug} recipe={recipe} />
          ))}
        </div>
      </section>
    </article>
  );
}
