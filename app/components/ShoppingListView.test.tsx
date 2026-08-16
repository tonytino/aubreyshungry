import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { ShoppingList } from "~/content/shopping-list";
import { ShoppingListView } from "./ShoppingListView";

// Sample food data follows the golden rules (docs/agents/dietary-safety.md).

const list: ShoppingList = [
  {
    section: "produce",
    items: [
      { name: "baby spinach", quantity: 5, unit: "oz", safetyNotes: [] },
      { name: "blueberries", quantity: 2, unit: "cup", safetyNotes: [] },
    ],
  },
  {
    section: "pantry",
    items: [
      {
        name: "raw almonds",
        quantity: 2,
        unit: "cup",
        safetyNotes: [
          "check label: processed in a facility free of cashew/pistachio cross-contact",
        ],
      },
    ],
  },
];

describe("ShoppingListView", () => {
  it("renders sections with their items and quantities", () => {
    render(<ShoppingListView list={list} />);
    const produce = screen.getByRole("region", { name: "Produce" });
    expect(within(produce).getByText("baby spinach")).toBeInTheDocument();
    expect(within(produce).getByText("5 oz")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Pantry" })).toBeInTheDocument();
  });

  it("renders every item as an unchecked checkbox initially", () => {
    render(<ShoppingListView list={list} />);
    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes).toHaveLength(3);
    for (const checkbox of checkboxes) {
      expect(checkbox).not.toBeChecked();
    }
  });

  it("toggles an item checked and back", async () => {
    const user = userEvent.setup();
    render(<ShoppingListView list={list} />);
    const spinach = screen.getByRole("checkbox", { name: /baby spinach/ });
    await user.click(spinach);
    expect(spinach).toBeChecked();
    // Other items are untouched.
    expect(screen.getByRole("checkbox", { name: /blueberries/ })).not.toBeChecked();
    await user.click(spinach);
    expect(spinach).not.toBeChecked();
  });

  it("shows safety notes prominently on their item", () => {
    render(<ShoppingListView list={list} />);
    expect(
      screen.getByText(
        "check label: processed in a facility free of cashew/pistachio cross-contact"
      )
    ).toBeInTheDocument();
  });

  it("renders a friendly message for an empty list", () => {
    render(<ShoppingListView list={[]} />);
    expect(screen.getByText(/Nothing to buy/)).toBeInTheDocument();
  });
});
