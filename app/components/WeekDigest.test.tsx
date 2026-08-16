import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { WeekDigestData } from "~/content/load";
import type { Recipe } from "~/content/schema";
import { WeekDigest } from "./WeekDigest";

// Sample food data follows the golden rules (docs/agents/dietary-safety.md).

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
  ],
  steps: ["Roast the salmon and portion with quinoa."],
  storageNotes: "Refrigerate up to 3 days.",
  goldenRuleCallouts: ["Use certified-GF tamari, never soy sauce."],
};

const spinachSalad: Recipe = {
  slug: "spinach-berry-salad",
  title: "Spinach and Berry Salad",
  servings: 2,
  prepMinutes: 10,
  cookMinutes: 0,
  style: "fresh",
  ingredients: [{ name: "baby spinach", quantity: 5, unit: "oz", section: "produce" }],
  steps: ["Toss and serve."],
};

const roastedAlmonds: Recipe = {
  slug: "roasted-almonds",
  title: "Roasted Almonds",
  servings: 4,
  prepMinutes: 2,
  cookMinutes: 10,
  style: "snack",
  ingredients: [
    {
      name: "raw almonds",
      quantity: 2,
      unit: "cup",
      section: "pantry",
      safetyNote: "check label: processed in a facility free of cashew/pistachio cross-contact",
    },
  ],
  steps: ["Roast at 325F for 10 minutes."],
};

const digest: WeekDigestData = {
  week: {
    weekStart: "2026-08-16",
    menu: [
      { recipeSlug: "salmon-quinoa-bowl", days: ["monday", "wednesday"] },
      { recipeSlug: "spinach-berry-salad", days: ["tuesday"] },
    ],
    snacks: ["roasted-almonds"],
    notes: "Prep the salmon Sunday evening.",
  },
  recipesBySlug: {
    "salmon-quinoa-bowl": salmonBowl,
    "spinach-berry-salad": spinachSalad,
    "roasted-almonds": roastedAlmonds,
  },
  shoppingList: [
    {
      section: "produce",
      items: [{ name: "baby spinach", quantity: 5, unit: "oz", safetyNotes: [] }],
    },
  ],
};

describe("WeekDigest", () => {
  it("renders the week title and human date range", () => {
    render(<WeekDigest digest={digest} />);
    expect(
      screen.getByRole("heading", { level: 1, name: "Week of Aug 16, 2026" })
    ).toBeInTheDocument();
    expect(screen.getByText("Aug 16–22, 2026")).toBeInTheDocument();
  });

  it("does not repeat the raw identifier — the label and range already state it", () => {
    render(<WeekDigest digest={digest} />);
    expect(screen.queryByText(/2026-08-16/)).not.toBeInTheDocument();
  });

  it("renders the week notes", () => {
    render(<WeekDigest digest={digest} />);
    expect(screen.getByText("Prep the salmon Sunday evening.")).toBeInTheDocument();
  });

  it("renders the menu grouped by day", () => {
    render(<WeekDigest digest={digest} />);
    const menu = screen.getByRole("region", { name: "Menu" });
    expect(within(menu).getByRole("heading", { name: "Monday" })).toBeInTheDocument();
    expect(within(menu).getAllByRole("link", { name: "Salmon Quinoa Bowl" })).toHaveLength(2);
  });

  it("lists snacks with their badge", () => {
    render(<WeekDigest digest={digest} />);
    const snacks = screen.getByRole("region", { name: "Snacks" });
    expect(within(snacks).getByRole("link", { name: "Roasted Almonds" })).toBeInTheDocument();
    expect(within(snacks).getByText("Snack")).toBeInTheDocument();
  });

  it("renders the derived shopping list", () => {
    render(<WeekDigest digest={digest} />);
    const shopping = screen.getByRole("region", { name: "Shopping list" });
    expect(within(shopping).getByRole("checkbox", { name: /baby spinach/ })).toBeInTheDocument();
  });

  it("renders every referenced recipe inline exactly once, menu first", () => {
    render(<WeekDigest digest={digest} />);
    const recipes = screen.getByRole("region", { name: "Recipes" });
    const cards = within(recipes).getAllByRole("group");
    expect(cards.map((card) => card.id)).toEqual([
      "recipe-salmon-quinoa-bowl",
      "recipe-spinach-berry-salad",
      "recipe-roasted-almonds",
    ]);
  });

  it("shows an empty-snacks message when the week has no snacks", () => {
    const noSnacks: WeekDigestData = {
      ...digest,
      week: { ...digest.week, snacks: [] },
    };
    render(<WeekDigest digest={noSnacks} />);
    expect(screen.getByText("No snacks planned this week.")).toBeInTheDocument();
  });
});
