import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SiteFooter } from "./SiteFooter";

describe("SiteFooter", () => {
  it("carries the disclaimer verbatim", () => {
    render(<SiteFooter />);
    expect(
      screen.getByText(
        "This site documents one household's meal plan. It is not medical or nutritional advice."
      )
    ).toBeInTheDocument();
  });

  it("states the golden rules for visitors", () => {
    render(<SiteFooter />);
    expect(screen.getByText(/gluten-free, free of cashews and pistachios/)).toBeInTheDocument();
  });
});
