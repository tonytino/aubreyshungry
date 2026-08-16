import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EmptyState } from "./EmptyState";

describe("EmptyState", () => {
  it("renders the title as the page heading with the message", () => {
    render(<EmptyState title="No weeks published yet" message="Check back soon." />);
    expect(
      screen.getByRole("heading", { level: 1, name: "No weeks published yet" })
    ).toBeInTheDocument();
    expect(screen.getByText("Check back soon.")).toBeInTheDocument();
  });
});
