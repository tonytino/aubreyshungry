import { execFileSync } from "node:child_process";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { weekStartDate } from "../../app/utils/week-dates";
// @ts-expect-error — .mjs script, no type declarations
import * as planReminder from "../../scripts/plan-reminder/current-week.mjs";

const { weekStartOf, currentWeekStart } = planReminder as {
  weekStartOf: (instant: Date) => string;
  currentWeekStart: () => string;
};

const MS_PER_DAY = 86_400_000;
const MS_PER_HOUR = 3_600_000;

/**
 * Independent Denver-calendar-date formulation for the assertions below.
 * The script assembles its date from `formatToParts`; this uses `en-CA`'s
 * `YYYY-MM-DD` layout via `format`. Deliberately a different code path, so
 * this test can't agree with the script by sharing its bug.
 */
const DENVER_DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Denver",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function denverDate(instant: Date): string {
  return DENVER_DATE.format(instant);
}

/**
 * Anti-drift gate for the deliberate week-boundary duplication:
 * `scripts/plan-reminder/current-week.mjs` (instant → weekStart, plain ESM
 * for the zero-install reminder workflow) and `app/utils/week-dates.ts`
 * (weekStart → the Sunday's UTC date, the reference implementation). Run
 * both across a broad range and assert they describe the SAME Sunday→Saturday
 * windows, so neither can change without this test forcing the other to
 * follow.
 *
 * The ranges step by the HOUR, not the day: the two implementations can only
 * disagree near a boundary, and every interesting boundary here (Denver
 * midnight vs UTC midnight, the DST spring-forward and fall-back hours) is
 * sub-daily.
 */
describe("plan-reminder weekStart stays in sync with app/utils/week-dates", () => {
  // Ranges chosen to cross the hard cases: both US DST transitions, and the
  // year boundaries where the week's Sunday and its Saturday sit in
  // different calendar years.
  const ranges: [string, string][] = [
    ["2026-03-01", "2026-03-15"], // spring forward (Sun 2026-03-08, 02:00 MST → 03:00 MDT)
    ["2026-10-25", "2026-11-08"], // fall back (Sun 2026-11-01, 02:00 MDT → 01:00 MST)
    ["2025-12-24", "2026-01-08"], // 2025→2026 boundary
    ["2026-12-24", "2027-01-08"], // 2026→2027 boundary, the reminder's go-live range
  ];

  function* instants(): Generator<Date> {
    for (const [from, to] of ranges) {
      const end = Date.parse(`${to}T00:00:00Z`);
      for (let t = Date.parse(`${from}T00:00:00Z`); t <= end; t += MS_PER_HOUR) {
        yield new Date(t);
      }
    }
  }

  it("every instant maps to a well-formed Sunday the TS module accepts", () => {
    for (const instant of instants()) {
      const weekStart = weekStartOf(instant);
      expect(weekStart, instant.toISOString()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      // weekStartDate throws unless this is a real calendar date on a
      // Sunday, so surviving the call IS the cross-implementation assertion.
      const start = weekStartDate(weekStart);
      expect(start.getUTCDay(), `${instant.toISOString()} → ${weekStart}`).toBe(0);
    }
  });

  it("the instant's DENVER calendar date falls inside [Sunday, Sunday + 7 days)", () => {
    for (const instant of instants()) {
      const weekStart = weekStartOf(instant);
      const start = weekStartDate(weekStart).getTime();
      // Compare calendar dates, not instants: re-anchor Denver's date at UTC
      // midnight so the containment check is pure day arithmetic.
      const local = Date.parse(`${denverDate(instant)}T00:00:00Z`);
      const label = `${instant.toISOString()} (Denver ${denverDate(instant)}) → ${weekStart}`;
      expect(local, label).toBeGreaterThanOrEqual(start);
      expect(local, label).toBeLessThan(start + 7 * MS_PER_DAY);
    }
  });

  it("round-trips: UTC noon on every produced Sunday maps back to that Sunday", () => {
    // Noon UTC is 05:00/06:00 in Denver — same calendar day under both MST
    // and MDT, so this probes the identifier, not the offset.
    for (const instant of instants()) {
      const weekStart = weekStartOf(instant);
      const noon = new Date(weekStartDate(weekStart).getTime() + 12 * MS_PER_HOUR);
      expect(weekStartOf(noon), `noon of ${weekStart}`).toBe(weekStart);
    }
  });

  it("resolves the week in Mountain Time, not UTC", () => {
    // Each case is an instant where the UTC calendar date and the Denver
    // calendar date disagree, so a UTC-based implementation would name a
    // different week. `naiveUtc` records what that wrong answer would be —
    // asserting it differs is what stops a silent regression to UTC.
    const cases: [string, string, string][] = [
      // [instant, expected weekStart (Denver), the wrong UTC-based answer]
      // Summer, MDT (UTC-6): 23:00 Sat in Denver is already Sunday in UTC.
      ["2026-08-16T05:00:00Z", "2026-08-09", "2026-08-16"],
      // Same week's far end: 23:59 Sat Aug 22 in Denver, Sunday in UTC.
      ["2026-08-23T05:59:59Z", "2026-08-16", "2026-08-23"],
      // Winter, MST (UTC-7): 23:00 Sat Jan 3 in Denver, Sunday in UTC — and
      // the correct answer sits in the PREVIOUS calendar year.
      ["2026-01-04T06:00:00Z", "2025-12-28", "2026-01-04"],
      // 2026→2027: 23:00 Sat Jan 2 in Denver, Sunday Jan 3 in UTC.
      ["2027-01-03T06:00:00Z", "2026-12-27", "2027-01-03"],
    ];
    for (const [iso, expected, naiveUtc] of cases) {
      const instant = new Date(iso);
      expect(weekStartOf(instant), iso).toBe(expected);
      expect(naiveUtc, `${iso} must not resolve as UTC would`).not.toBe(expected);
      // And the UTC day really is the later one — proving the case is live.
      expect(instant.toISOString().slice(0, 10), iso).toBe(naiveUtc);
    }
  });

  it("rolls the week over at Denver midnight, on both sides of the boundary", () => {
    const cases: [string, string][] = [
      // Summer (MDT, UTC-6).
      ["2026-08-16T05:59:59Z", "2026-08-09"], // 23:59:59 Sat, still last week
      ["2026-08-16T06:00:00Z", "2026-08-16"], // 00:00:00 Sun, new week
      // Winter (MST, UTC-7).
      ["2026-01-04T06:59:59Z", "2025-12-28"],
      ["2026-01-04T07:00:00Z", "2026-01-04"],
    ];
    for (const [iso, expected] of cases) {
      expect(weekStartOf(new Date(iso)), iso).toBe(expected);
    }
  });

  it("handles both DST transitions without shifting the week", () => {
    const cases: [string, string, string][] = [
      // Spring forward: Sun 2026-03-08, 02:00 MST → 03:00 MDT (23-hour day).
      // The rollover is still at Denver midnight, i.e. 07:00Z (MST).
      ["2026-03-08T06:59:59Z", "2026-03-01", "23:59:59 Sat MST, week has not rolled"],
      ["2026-03-08T07:00:00Z", "2026-03-08", "00:00 Sun MST, week rolls"],
      ["2026-03-08T09:00:00Z", "2026-03-08", "03:00 Sun MDT, just after the skipped hour"],
      ["2026-03-09T05:59:59Z", "2026-03-08", "Sun 23:59:59 MDT, still the same week"],
      // Fall back: Sun 2026-11-01, 02:00 MDT → 01:00 MST (25-hour day). The
      // rollover is at 06:00Z (MDT), and 01:30 local happens twice.
      ["2026-11-01T05:59:59Z", "2026-10-25", "23:59:59 Sat MDT, week has not rolled"],
      ["2026-11-01T06:00:00Z", "2026-11-01", "00:00 Sun MDT, week rolls"],
      ["2026-11-01T07:30:00Z", "2026-11-01", "01:30 Sun MDT, first pass of the repeated hour"],
      ["2026-11-01T08:30:00Z", "2026-11-01", "01:30 Sun MST, second pass of the repeated hour"],
      ["2026-11-02T06:59:59Z", "2026-11-01", "Sun 23:59:59 MST, still the same week"],
    ];
    for (const [iso, expected, why] of cases) {
      expect(weekStartOf(new Date(iso)), `${iso} — ${why}`).toBe(expected);
    }
  });

  it("rejects a non-Date or invalid Date instead of emitting a bogus week", () => {
    expect(() => weekStartOf(new Date("nonsense"))).toThrow(/valid Date/);
    expect(() => weekStartOf("2026-08-16" as unknown as Date)).toThrow(/valid Date/);
  });

  it("the CLI (the seam plan-reminder.yml uses) prints the current week to stdout", () => {
    const script = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../scripts/plan-reminder/current-week.mjs"
    );
    // Sample before/after so a Denver-midnight week rollover during the
    // spawn can never flake the equality check.
    const before = weekStartOf(new Date());
    const stdout = execFileSync(process.execPath, [script], { encoding: "utf-8" });
    const after = weekStartOf(new Date());
    expect(stdout).toMatch(/^\d{4}-\d{2}-\d{2}\n$/);
    expect([before, after]).toContain(stdout.trim());
    // The workflow's shape guard also assumes this is a Sunday.
    expect(weekStartDate(stdout.trim()).getUTCDay()).toBe(0);
  });

  it("currentWeekStart returns a well-formed identifier for now", () => {
    // Sample "now" before and after so a rollover between the calls can
    // never flake the assertion.
    const before = weekStartOf(new Date());
    const current = currentWeekStart();
    const after = weekStartOf(new Date());
    expect([before, after]).toContain(current);
    expect(current).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
