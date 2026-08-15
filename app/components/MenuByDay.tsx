import { DAYS, type Meal, type Recipe } from "~/content/schema";
import { withKeys } from "~/utils/keys";
import { StyleBadge } from "./StyleBadge";

type Day = (typeof DAYS)[number];

const DAY_LABELS: Record<Day, string> = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday",
};

type MenuByDayProps = {
  menu: Meal[];
  recipesBySlug: Record<string, Recipe>;
};

/**
 * The week's menu grouped by day (a multi-day meal-prep batch appears under
 * each day it covers — the question this view answers is "what do we eat
 * today?"). Days with nothing planned are omitted. Each entry links to its
 * inline recipe card and carries the recipe's style badge so meal-prep vs
 * fresh is visible at a glance.
 */
export function MenuByDay({ menu, recipesBySlug }: MenuByDayProps) {
  const plannedDays = DAYS.filter((day) => menu.some((meal) => meal.days.includes(day)));

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {plannedDays.map((day) => (
        <div key={day} className="rounded-lg border border-zinc-200 p-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            {DAY_LABELS[day]}
          </h3>
          <ul className="mt-2 space-y-2">
            {withKeys(
              menu.filter((meal) => meal.days.includes(day)),
              (meal) => meal.recipeSlug
            ).map(({ item: meal, key }) => {
              const recipe = recipesBySlug[meal.recipeSlug];
              return (
                <li key={key} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <a
                    href={`#recipe-${meal.recipeSlug}`}
                    className="font-medium underline-offset-4 hover:underline"
                  >
                    {recipe?.title ?? meal.recipeSlug}
                  </a>
                  {recipe !== undefined && <StyleBadge style={recipe.style} />}
                  {meal.note !== undefined && (
                    <span className="text-muted-foreground w-full text-sm">{meal.note}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
