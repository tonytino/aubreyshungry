import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StyleBadge } from "./StyleBadge";

describe("StyleBadge", () => {
  it("labels meal-prep recipes", () => {
    render(<StyleBadge style="meal-prep" />);
    expect(screen.getByText("Meal prep")).toBeInTheDocument();
  });

  it("labels fresh recipes", () => {
    render(<StyleBadge style="fresh" />);
    expect(screen.getByText("Fresh")).toBeInTheDocument();
  });

  it("labels snack recipes", () => {
    render(<StyleBadge style="snack" />);
    expect(screen.getByText("Snack")).toBeInTheDocument();
  });

  it("visually distinguishes meal-prep from fresh", () => {
    const { container: prep } = render(<StyleBadge style="meal-prep" />);
    const { container: fresh } = render(<StyleBadge style="fresh" />);
    expect(prep.querySelector("span")?.className).not.toBe(fresh.querySelector("span")?.className);
  });
});
