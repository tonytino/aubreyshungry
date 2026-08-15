import type { Recipe } from "~/content/schema";

type RecipeStyle = Recipe["style"];

const STYLE_LABELS: Record<RecipeStyle, string> = {
  "meal-prep": "Meal prep",
  fresh: "Fresh",
  snack: "Snack",
};

const STYLE_CLASSES: Record<RecipeStyle, string> = {
  "meal-prep": "bg-sky-100 text-sky-800",
  fresh: "bg-emerald-100 text-emerald-800",
  snack: "bg-violet-100 text-violet-800",
};

/**
 * Small pill distinguishing meal-prep, fresh, and snack recipes at a glance
 * (`docs/agents/domain.md` — the menu deliberately mixes the styles).
 */
export function StyleBadge({ style }: { style: RecipeStyle }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium ${STYLE_CLASSES[style]} print:hidden`}
    >
      {STYLE_LABELS[style]}
    </span>
  );
}
