import { describe, expect, it } from "vitest";
import { isoWeekStartDate } from "../../app/utils/iso-week";
// @ts-expect-error — .mjs script, no type declarations
import * as planReminder from "../../scripts/plan-reminder/current-iso-week.mjs";

const { isoWeekOfUtc, currentUtcIsoWeek } = planReminder as {
  isoWeekOfUtc: (date: Date) => string;
  currentUtcIsoWeek: () => string;
};

const MS_PER_DAY = 86_400_000;

/**
 * Anti-drift gate for the deliberate ISO-week duplication:
 * `scripts/plan-reminder/current-iso-week.mjs` (date → week, plain ESM for
 * the zero-install reminder workflow) and `app/utils/iso-week.ts`
 * (week → Monday date, the reference implementation). Run both across a
 * broad date range and assert they describe the SAME week boundaries, so
 * neither can change without this test forcing the other to follow.
 */
describe("plan-reminder ISO week stays in sync with app/utils/iso-week", () => {
  // Ranges chosen to cross the hard cases: year boundaries where the ISO
  // week-year differs from the calendar year, a 53-week (long) ISO year
  // (2020: leap year starting Wednesday), and the 2026→2027 boundary the
  // reminder workflow will actually live through (2026-12-28..2027-01-04
  // is all of week 2026-W53 — 2026 is a long year — plus 2027-W01).
  const ranges: [string, string][] = [
    ["2019-12-23", "2021-01-11"], // covers 2020's W53 and both year boundaries
    ["2024-12-23", "2025-01-13"], // 52-week year boundary
    ["2026-08-01", "2027-01-11"], // generation go-live range incl. 2026-W53
  ];

  it("every date in range maps to a week whose Monday-start contains it", () => {
    for (const [from, to] of ranges) {
      const end = Date.parse(`${to}T00:00:00Z`);
      for (let t = Date.parse(`${from}T00:00:00Z`); t <= end; t += MS_PER_DAY) {
        const date = new Date(t);
        const isoWeek = isoWeekOfUtc(date);
        expect(isoWeek).toMatch(/^\d{4}-W\d{2}$/);
        const start = isoWeekStartDate(isoWeek).getTime();
        // The date falls inside [Monday, Monday + 7 days).
        expect(t, `${date.toISOString()} → ${isoWeek}`).toBeGreaterThanOrEqual(start);
        expect(t, `${date.toISOString()} → ${isoWeek}`).toBeLessThan(start + 7 * MS_PER_DAY);
      }
    }
  });

  it("round-trips: the TS Monday-start of every week maps back to that week", () => {
    for (const [from, to] of ranges) {
      const end = Date.parse(`${to}T00:00:00Z`);
      for (let t = Date.parse(`${from}T00:00:00Z`); t <= end; t += MS_PER_DAY) {
        const isoWeek = isoWeekOfUtc(new Date(t));
        const start = isoWeekStartDate(isoWeek);
        expect(isoWeekOfUtc(start), `Monday of ${isoWeek}`).toBe(isoWeek);
      }
    }
  });

  it("agrees on the documented hard cases exactly", () => {
    const cases: [string, string][] = [
      ["2020-12-31", "2020-W53"], // long-year W53 spills into January
      ["2021-01-01", "2020-W53"],
      ["2021-01-04", "2021-W01"],
      ["2024-12-30", "2025-W01"], // W01 starts in the previous calendar year
      ["2026-12-28", "2026-W53"], // 2026 is a long ISO year
      ["2027-01-03", "2026-W53"],
      ["2027-01-04", "2027-W01"],
    ];
    for (const [date, expected] of cases) {
      expect(isoWeekOfUtc(new Date(`${date}T00:00:00Z`)), date).toBe(expected);
    }
  });

  it("currentUtcIsoWeek returns a well-formed identifier for now", () => {
    // Sample "now" before and after so a midnight-UTC week rollover between
    // the calls can never flake the assertion.
    const before = isoWeekOfUtc(new Date());
    const current = currentUtcIsoWeek();
    const after = isoWeekOfUtc(new Date());
    expect([before, after]).toContain(current);
    expect(current).toMatch(/^\d{4}-W\d{2}$/);
  });
});
