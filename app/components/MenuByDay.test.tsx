import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Meal, Recipe } from "~/content/schema";
import { MenuByDay } from "./MenuByDay";

// Sample food data follows the golden rules (docs/agents/dietary-safety.md).

const recipesBySlug: Record<string, Recipe> = {
  "salmon-quinoa-bowl": {
    slug: "salmon-quinoa-bowl",
    title: "Salmon Quinoa Bowl",
    servings: 4,
    prepMinutes: 15,
    cookMinutes: 25,
    style: "meal-prep",
    ingredients: [{ name: "salmon fillet", quantity: 1.5, unit: "lb", section: "protein" }],
    steps: ["Roast the salmon and portion with quinoa."],
    storageNotes: "Refrigerate up to 3 days.",
  },
  "spinach-berry-salad": {
    slug: "spinach-berry-salad",
    title: "Spinach and Berry Salad",
    servings: 2,
    prepMinutes: 10,
    cookMinutes: 0,
    style: "fresh",
    ingredients: [{ name: "baby spinach", quantity: 5, unit: "oz", section: "produce" }],
    steps: ["Toss and serve."],
  },
};

const menu: Meal[] = [
  {
    recipeSlug: "salmon-quinoa-bowl",
    days: ["monday", "wednesday"],
    note: "Batch-cook Sunday evening.",
  },
  { recipeSlug: "spinach-berry-salad", days: ["tuesday"] },
];

describe("MenuByDay", () => {
  it("groups meals under each day they cover, in week order", () => {
    render(<MenuByDay menu={menu} recipesBySlug={recipesBySlug} />);
    const headings = screen.getAllByRole("heading", { level: 3 });
    expect(headings.map((h) => h.textContent)).toEqual(["Monday", "Tuesday", "Wednesday"]);
  });

  it("repeats a multi-day batch meal under every covered day", () => {
    render(<MenuByDay menu={menu} recipesBySlug={recipesBySlug} />);
    expect(screen.getAllByRole("link", { name: "Salmon Quinoa Bowl" })).toHaveLength(2);
  });

  it("omits days with nothing planned", () => {
    render(<MenuByDay menu={menu} recipesBySlug={recipesBySlug} />);
    expect(screen.queryByRole("heading", { name: "Sunday" })).not.toBeInTheDocument();
  });

  it("badges each meal with its recipe style", () => {
    render(<MenuByDay menu={menu} recipesBySlug={recipesBySlug} />);
    expect(screen.getAllByText("Meal prep")).toHaveLength(2);
    expect(screen.getAllByText("Fresh")).toHaveLength(1);
  });

  it("links each meal to its inline recipe card", () => {
    render(<MenuByDay menu={menu} recipesBySlug={recipesBySlug} />);
    const link = screen.getByRole("link", { name: "Spinach and Berry Salad" });
    expect(link).toHaveAttribute("href", "#recipe-spinach-berry-salad");
  });

  it("shows the meal note under its entry", () => {
    render(<MenuByDay menu={menu} recipesBySlug={recipesBySlug} />);
    const monday = screen.getByRole("heading", { name: "Monday" }).closest("div");
    expect(monday).not.toBeNull();
    if (monday === null) return;
    expect(within(monday).getByText("Batch-cook Sunday evening.")).toBeInTheDocument();
  });
});
