import { Link } from "@tanstack/react-router";
import { formatWeekRange } from "~/utils/week-dates";

/**
 * Forward link from the displayed week to a newer published one.
 *
 * "Next PUBLISHED week", not "next week": the home page falls back to the
 * newest week that has already begun when today sits in a publishing gap
 * (see `getHomeDigest` in `app/content/load.ts`), so the week this points at
 * is often not the next calendar week. In the gap case the page leads with
 * e.g. 2026-08-30 and this links 2026-09-13 — two weeks later — and a label
 * reading "Next week" would simply be false. The published wording is
 * accurate in the normal case and the gap case alike.
 *
 * Lives as its own component rather than inline in the route so the label is
 * unit-testable; route components are excluded from coverage by design
 * (see `vitest.config.ts`) and this string is user-facing.
 *
 * `formatWeekRange` is pure, so this renders identically on server and
 * client — no hydration risk.
 */
export function NewerWeekLink({ weekStart }: { weekStart: string }) {
  return (
    <p className="mb-6 text-sm print:hidden">
      <Link to="/week/$weekStart" params={{ weekStart }} className="underline underline-offset-4">
        Next published week: {formatWeekRange(weekStart)}
      </Link>
    </p>
  );
}
