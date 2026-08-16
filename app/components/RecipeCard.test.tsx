import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Recipe } from "~/content/schema";
import { RecipeCard } from "./RecipeCard";

// Sample food data follows the golden rules (docs/agents/dietary-safety.md).

const CROSS_CONTACT_NOTE =
  "check label: processed in a facility free of cashew/pistachio cross-contact";

const salmonBowl: Recipe = {
  slug: "salmon-quinoa-bowl",
  title: "Salmon Quinoa Bowl",
  servings: 4,
  prepMinutes: 15,
  cookMinutes: 25,
  style: "meal-prep",
  ingredients: [
    { name: "salmon fillet", quantity: 1.5, unit: "lb", section: "protein" },
    { name: "quinoa", quantity: 1.5, unit: "cup", section: "pantry" },
    {
      name: "sliced almonds",
      quantity: 0.5,
      unit: "cup",
      section: "pantry",
      safetyNote: CROSS_CONTACT_NOTE,
    },
  ],
  steps: ["Roast the salmon at 400F until it flakes.", "Simmer the quinoa until tender."],
  storageNotes: "Refrigerate up to 3 days; reheat covered at low heat.",
  goldenRuleCallouts: ["Use certified-GF tamari, never soy sauce."],
};

const spinachSalad: Recipe = {
  slug: "spinach-berry-salad",
  title: "Spinach and Berry Salad",
  servings: 2,
  prepMinutes: 10,
  cookMinutes: 0,
  style: "fresh",
  ingredients: [
    { name: "baby spinach", quantity: 5, unit: "oz", section: "produce" },
    { name: "blueberries", quantity: 1, unit: "cup", section: "produce" },
  ],
  steps: ["Toss everything together and serve."],
};

describe("RecipeCard", () => {
  it("renders title, style badge, and meta", () => {
    render(<RecipeCard recipe={salmonBowl} />);
    expect(screen.getByText("Salmon Quinoa Bowl")).toBeInTheDocument();
    expect(screen.getByText("Meal prep")).toBeInTheDocument();
    expect(screen.getByText("Serves 4 · 15 min prep · 25 min cook")).toBeInTheDocument();
  });

  it("collects golden-rule callouts and ingredient safety notes into the callout box", () => {
    render(<RecipeCard recipe={salmonBowl} />);
    const callouts = screen.getByRole("complementary", { name: "Golden rule notes" });
    expect(
      within(callouts).getByText("Use certified-GF tamari, never soy sauce.")
    ).toBeInTheDocument();
    expect(
      within(callouts).getByText(`sliced almonds — ${CROSS_CONTACT_NOTE}`)
    ).toBeInTheDocument();
  });

  it("repeats the safety note inline next to its ingredient", () => {
    render(<RecipeCard recipe={salmonBowl} />);
    // Exact match hits only the inline note span (the callout-box copy is
    // prefixed with the ingredient name, covered by the test above).
    expect(screen.getByText(CROSS_CONTACT_NOTE)).toBeInTheDocument();
  });

  it("renders structured ingredients with quantities and all steps", () => {
    render(<RecipeCard recipe={salmonBowl} />);
    const quantity = screen.getByText("1.5 lb");
    expect(quantity.parentElement).toHaveTextContent("salmon fillet");
    expect(screen.getByText("Simmer the quinoa until tender.")).toBeInTheDocument();
  });

  it("shows storage notes for meal-prep recipes", () => {
    render(<RecipeCard recipe={salmonBowl} />);
    expect(screen.getByText("Storage & reheating")).toBeInTheDocument();
    expect(
      screen.getByText("Refrigerate up to 3 days; reheat covered at low heat.")
    ).toBeInTheDocument();
  });

  it("omits the callout box and storage section when a recipe has neither", () => {
    render(<RecipeCard recipe={spinachSalad} />);
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
    expect(screen.queryByText("Storage & reheating")).not.toBeInTheDocument();
  });
});
