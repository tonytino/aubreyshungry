import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SiteHeader } from "./SiteHeader";

describe("SiteHeader", () => {
  it("renders the site name linking home", () => {
    render(<SiteHeader />);
    expect(screen.getByRole("link", { name: "Aubrey's Hungry" })).toHaveAttribute("href", "/");
  });

  it("renders nav links to the current week and the archive", () => {
    render(<SiteHeader />);
    const nav = screen.getByRole("navigation", { name: "Site" });
    expect(screen.getByRole("link", { name: "This week" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "Archive" })).toHaveAttribute("href", "/weeks");
    expect(nav).toBeInTheDocument();
  });
});
