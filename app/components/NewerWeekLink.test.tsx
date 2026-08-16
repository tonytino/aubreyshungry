import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NewerWeekLink } from "./NewerWeekLink";

/**
 * Minimal memory router so a TanStack `Link` can render outside the app.
 * Only the routes the link targets need to exist; nothing is navigated.
 */
function renderInRouter(ui: React.ReactNode) {
  const rootRoute = createRootRoute({ component: () => <>{ui}</> });
  const weekRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/week/$weekStart",
    component: () => null,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([weekRoute]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  // The harness router is structurally different from the app's registered
  // one; the cast keeps that local to this file.
  return render(<RouterProvider router={router as never} />);
}

describe("NewerWeekLink", () => {
  it('labels the link "Next published week", never "Next week"', () => {
    // Exact-string assertion, not a substring match: "Next week: …" would
    // satisfy a loose /Next.*week/ regex, and that wording is a factual
    // error whenever the home page is showing a gap fallback.
    renderInRouter(<NewerWeekLink weekStart="2026-09-13" />);
    expect(
      screen.getByRole("link", { name: "Next published week: Sep 13–19, 2026" })
    ).toBeInTheDocument();
    expect(screen.queryByText(/^Next week:/)).not.toBeInTheDocument();
  });

  it("points at the week's archive page", () => {
    renderInRouter(<NewerWeekLink weekStart="2026-09-13" />);
    expect(screen.getByRole("link")).toHaveAttribute("href", "/week/2026-09-13");
  });

  it("stays accurate when the target is two weeks out (the gap case)", () => {
    // Home leads with 2026-08-30 and links 2026-09-13 when 2026-09-06 was
    // never published. The label must not claim this is next week.
    renderInRouter(<NewerWeekLink weekStart="2026-09-13" />);
    const link = screen.getByRole("link");
    expect(link.textContent).toBe("Next published week: Sep 13–19, 2026");
  });

  it("renders the Sunday–Saturday span, including across a month boundary", () => {
    renderInRouter(<NewerWeekLink weekStart="2026-08-30" />);
    expect(screen.getByRole("link").textContent).toBe("Next published week: Aug 30 – Sep 5, 2026");
  });
});

// Note: the non-Sunday case is covered directly in app/utils/week-dates.test.ts
// ("throws on a real date that is not a Sunday"). Asserting it through this
// component would only exercise the router's error boundary, which swallows
// the throw — that is framework behavior, not this component's contract.
