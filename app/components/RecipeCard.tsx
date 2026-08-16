import type { Recipe } from "~/content/schema";
import { withKeys } from "~/utils/keys";
import { formatQuantity } from "~/utils/quantity";
import { StyleBadge } from "./StyleBadge";

/**
 * One recipe, rendered inline in a week's digest as an expandable
 * `<details>` card (works without JavaScript, keeps the page scannable).
 * Golden-rule callouts — the recipe's own callouts plus every ingredient
 * `safetyNote` — are collected into one prominent amber box at the top of
 * the card; safety notes additionally repeat inline next to their
 * ingredient so they can't be missed mid-cooking.
 */
export function RecipeCard({ recipe }: { recipe: Recipe }) {
  const ingredientSafetyLines = recipe.ingredients
    .filter((ingredient) => ingredient.safetyNote !== undefined)
    .map((ingredient) => `${ingredient.name} — ${ingredient.safetyNote}`);
  const callouts = [...(recipe.goldenRuleCallouts ?? []), ...ingredientSafetyLines];

  return (
    <details
      id={`recipe-${recipe.slug}`}
      className="group scroll-mt-4 rounded-lg border border-zinc-200 bg-white"
    >
      <summary className="flex cursor-pointer flex-wrap items-baseline gap-x-3 gap-y-1 rounded-lg p-4 hover:bg-zinc-50">
        <span className="text-lg font-semibold">{recipe.title}</span>
        <StyleBadge style={recipe.style} />
        <span className="text-muted-foreground text-sm">
          Serves {recipe.servings} · {recipe.prepMinutes} min prep · {recipe.cookMinutes} min cook
        </span>
      </summary>

      <div className="flex flex-col gap-4 px-4 pb-4">
        {callouts.length > 0 && (
          <aside
            aria-label="Golden rule notes"
            className="rounded-md border-l-4 border-amber-500 bg-amber-50 p-3"
          >
            <p className="text-sm font-semibold text-amber-900">Golden rules for this recipe</p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-amber-900">
              {withKeys(callouts, (callout) => callout).map(({ item, key }) => (
                <li key={key}>{item}</li>
              ))}
            </ul>
          </aside>
        )}

        <section>
          <h4 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Ingredients
          </h4>
          <ul className="mt-2 space-y-1 text-sm">
            {withKeys(recipe.ingredients, (i) => `${i.name}|${i.unit}|${i.quantity}`).map(
              ({ item: ingredient, key }) => (
                <li key={key}>
                  <span className="text-muted-foreground">
                    {formatQuantity(ingredient.quantity, ingredient.unit)}
                  </span>{" "}
                  {ingredient.name}
                  {ingredient.safetyNote !== undefined && (
                    <span className="block pl-4 text-amber-700">{ingredient.safetyNote}</span>
                  )}
                </li>
              )
            )}
          </ul>
        </section>

        <section>
          <h4 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Steps</h4>
          <ol className="mt-2 list-decimal space-y-2 pl-5 text-sm">
            {withKeys(recipe.steps, (step) => step).map(({ item: step, key }) => (
              <li key={key}>{step}</li>
            ))}
          </ol>
        </section>

        {recipe.storageNotes !== undefined && (
          <section>
            <h4 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
              Storage &amp; reheating
            </h4>
            <p className="mt-2 text-sm">{recipe.storageNotes}</p>
          </section>
        )}
      </div>
    </details>
  );
}
