import { execFileSync, spawnSync } from "node:child_process";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { denverToday } from "../../app/utils/denver-today";
import { weekContains, weekStartDate } from "../../app/utils/week-dates";
// @ts-expect-error — .mjs script, no type declarations
import * as planReminder from "../../scripts/plan-reminder/current-week.mjs";

const { weekStartOf, currentWeekStart, nextWeekStart, weekStartPlus } = planReminder as {
  weekStartOf: (instant: Date) => string;
  currentWeekStart: (now?: Date) => string;
  nextWeekStart: (now?: Date) => string;
  weekStartPlus: (weekStart: string, days: number) => string;
};

const SCRIPT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../scripts/plan-reminder/current-week.mjs"
);

/** Run the CLI the way a shell would, capturing the exit status. */
function runCli(...args: string[]): { status: number; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf-8" });
  return { status: result.status ?? -1, stdout: result.stdout, stderr: result.stderr };
}

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

  // There are now TWO Denver resolutions in the repo: the script's private
  // `denverCalendarDate` (plain ESM, for the zero-install workflow) and
  // `app/utils/denver-today.ts` (TS, for the home page's current-week
  // pick). If they ever drift, the site and the reminder would disagree
  // about which week it is. These two tests are that gate.
  it("app/utils/denver-today agrees with the script's Denver resolution", () => {
    for (const instant of instants()) {
      const today = denverToday(instant);
      expect(today, instant.toISOString()).toBe(denverDate(instant));
      // And the script's week must be the week that contains that day.
      expect(
        weekContains(weekStartOf(instant), today),
        `${instant.toISOString()} → ${weekStartOf(instant)} should contain ${today}`
      ).toBe(true);
    }
  });

  it("the home page's week pick and the reminder's week agree at every instant", () => {
    // The site resolves "current week" as denverToday → weekContains; the
    // reminder resolves it as weekStartOf. Same answer, always.
    for (const instant of instants()) {
      const fromScript = weekStartOf(instant);
      const today = denverToday(instant);
      // Reconstruct the site's pick: the Sunday whose span holds today.
      const candidates = [-7, 0, 7].map((offset) => {
        const base = weekStartDate(fromScript).getTime() + offset * MS_PER_DAY;
        return new Date(base).toISOString().slice(0, 10);
      });
      const sitePick = candidates.filter((weekStart) => weekContains(weekStart, today));
      expect(sitePick, `${instant.toISOString()} (Denver ${today})`).toEqual([fromScript]);
    }
  });

  it("nextWeekStart is always exactly seven days after the current Sunday", () => {
    // The Thursday reminder chases the UPCOMING week, so this offset is the
    // thing that decides which plan gets nagged about. Checked across every
    // instant in the ranges — including both DST transitions, where an
    // instant-based `+7 days` would drift by a day.
    for (const instant of instants()) {
      const current = weekStartDate(currentWeekStart(instant));
      const next = weekStartDate(nextWeekStart(instant));
      const label = `${instant.toISOString()} → ${nextWeekStart(instant)}`;
      expect(next.getUTCDay(), label).toBe(0);
      expect(next.getTime() - current.getTime(), label).toBe(7 * MS_PER_DAY);
    }
  });

  it("nextWeekStart crosses month and year boundaries correctly", () => {
    const cases: [string, string][] = [
      // Thursday 2026-08-27 (MDT): current week starts Aug 23, next Aug 30.
      ["2026-08-27T18:00:00Z", "2026-08-30"],
      // Thursday 2026-12-31: next week starts in 2027.
      ["2026-12-31T18:00:00Z", "2027-01-03"],
      // Leap day itself (Thu 2024-02-29): Feb 25 → Mar 3, counting Feb 29.
      ["2024-02-29T18:00:00Z", "2024-03-03"],
      // Thursday before the fall-back Sunday: next week IS that Sunday.
      ["2026-10-29T18:00:00Z", "2026-11-01"],
      // Thursday before the spring-forward Sunday.
      ["2026-03-05T18:00:00Z", "2026-03-08"],
    ];
    for (const [iso, expected] of cases) {
      expect(nextWeekStart(new Date(iso)), iso).toBe(expected);
    }
  });

  // `--from`/`--plus` is the portable stand-in for `date -u -d "<date> +7
  // days" +%F` that the owner-local generation skill used to run. On
  // BSD/macOS `date`, `-d` means "set DST" and silently swallows its
  // argument, printing TODAY instead — so the skill's Sunday guard could
  // pass while confirming nothing. These tests pin the replacement.
  describe("--from / --plus (portable date arithmetic for the generation skill)", () => {
    it("--plus 7 agrees with nextWeekStart across every instant in range", () => {
      for (const instant of instants()) {
        const current = currentWeekStart(instant);
        expect(weekStartPlus(current, 7), current).toBe(nextWeekStart(instant));
      }
    });

    it("steps whole days on the identifier, DST transitions included", () => {
      const cases: [string, number, string][] = [
        // Into the spring-forward week (Sun 2026-03-08 is 23 hours local).
        ["2026-03-01", 7, "2026-03-08"],
        // Out of it, and across it in one 28-day stride.
        ["2026-03-08", 7, "2026-03-15"],
        ["2026-03-01", 28, "2026-03-29"],
        // Into and out of the fall-back week (Sun 2026-11-01 is 25 hours).
        ["2026-10-25", 7, "2026-11-01"],
        ["2026-11-01", 7, "2026-11-08"],
        ["2026-10-25", 28, "2026-11-22"],
        // Month, year and leap-day boundaries.
        ["2026-08-30", 7, "2026-09-06"],
        ["2026-12-27", 7, "2027-01-03"],
        ["2024-02-25", 7, "2024-03-03"],
        // Zero and negative steps; +6 is the week's closing Saturday.
        ["2026-08-16", 0, "2026-08-16"],
        ["2026-08-16", 6, "2026-08-22"],
        ["2026-08-16", -7, "2026-08-09"],
      ];
      for (const [from, days, expected] of cases) {
        expect(weekStartPlus(from, days), `${from} +${days}`).toBe(expected);
      }
    });

    it("multiples of 7 always land on another Sunday", () => {
      for (const instant of instants()) {
        const from = currentWeekStart(instant);
        for (const weeks of [-4, -1, 1, 4, 52]) {
          const result = weekStartPlus(from, weeks * 7);
          // weekStartDate throws unless this is a real Sunday.
          expect(weekStartDate(result).getUTCDay(), `${from} +${weeks}w`).toBe(0);
        }
      }
    });

    it("rejects a --from that is not a Sunday, naming the actual weekday", () => {
      const result = runCli("--from", "2026-08-17");
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("a week must start on a Sunday, but 2026-08-17 is a Monday");
      expect(result.stdout.trim()).toBe("");
    });

    it("rejects a --from that is not a real date, distinctly from a non-Sunday", () => {
      const impossible = runCli("--from", "2026-02-30");
      expect(impossible.status).toBe(1);
      // Must NOT be blamed on the weekday: Date.UTC would roll Feb 30 to
      // Mar 2 (a Monday) and report the wrong rule.
      expect(impossible.stderr).toContain('"2026-02-30" is not a real calendar date');

      const malformed = runCli("--from", "2026-W33");
      expect(malformed.status).toBe(1);
      expect(malformed.stderr).toContain('"2026-W33" is not a date in YYYY-MM-DD form');
    });

    it("--from alone doubles as a Sunday assertion that echoes the date", () => {
      const ok = runCli("--from", "2026-08-16");
      expect(ok.status).toBe(0);
      expect(ok.stdout.trim()).toBe("2026-08-16");
    });

    it("prints the stepped date on stdout with a zero exit", () => {
      const result = runCli("--from", "2026-08-16", "--plus", "7");
      expect(result.status).toBe(0);
      expect(result.stdout).toBe("2026-08-23\n");
      expect(result.stderr).toBe("");
    });

    it("fails loudly on malformed usage rather than answering a different question", () => {
      // The whole point of this mode: a typo must never silently fall
      // through to printing the current week (which is what BSD `date -d`
      // does, and why this mode exists).
      const cases: [string[], string][] = [
        [["--form", "2026-08-16"], 'unknown argument "--form"'],
        [["--from"], "--from requires a value"],
        [["--plus", "7"], "--plus requires --from"],
        [["--from", "2026-08-16", "--plus", "1.5"], "--plus must be a whole number of days"],
        [["--from", "2026-08-16", "--plus", "soon"], "--plus must be a whole number of days"],
        [["--next", "--from", "2026-08-16"], "--next and --from are mutually exclusive"],
      ];
      for (const [args, expected] of cases) {
        const result = runCli(...args);
        expect(result.status, args.join(" ")).toBe(1);
        expect(result.stderr, args.join(" ")).toContain(expected);
        expect(result.stdout.trim(), args.join(" ")).toBe("");
      }
    });

    it("leaves the existing flags working", () => {
      const bare = runCli();
      const next = runCli("--next");
      expect(bare.status).toBe(0);
      expect(next.status).toBe(0);
      expect(bare.stdout).toMatch(/^\d{4}-\d{2}-\d{2}\n$/);
      expect(next.stdout).toMatch(/^\d{4}-\d{2}-\d{2}\n$/);
      expect(weekStartPlus(bare.stdout.trim(), 7)).toBe(next.stdout.trim());
    });
  });

  it("the CLI (the seam plan-reminder.yml uses) prints week identifiers to stdout", () => {
    // Sample before/after so a Denver-midnight week rollover during the
    // spawn can never flake the equality checks.
    const before = new Date();
    const current = execFileSync(process.execPath, [SCRIPT], { encoding: "utf-8" });
    // `--next` is what the workflow actually invokes.
    const next = execFileSync(process.execPath, [SCRIPT, "--next"], { encoding: "utf-8" });
    const after = new Date();

    for (const stdout of [current, next]) {
      // Exactly what the workflow's shape guard accepts.
      expect(stdout).toMatch(/^\d{4}-\d{2}-\d{2}\n$/);
      // The guard also assumes a Sunday; weekStartDate throws otherwise.
      expect(weekStartDate(stdout.trim()).getUTCDay()).toBe(0);
    }
    expect([currentWeekStart(before), currentWeekStart(after)]).toContain(current.trim());
    expect([nextWeekStart(before), nextWeekStart(after)]).toContain(next.trim());
    // The two must differ, or the workflow would nag about the wrong week.
    expect(next.trim()).not.toBe(current.trim());
  });

  it("currentWeekStart and nextWeekStart return well-formed identifiers for now", () => {
    // Sample "now" before and after so a rollover between the calls can
    // never flake the assertion.
    const before = new Date();
    const current = currentWeekStart();
    const next = nextWeekStart();
    const after = new Date();
    expect([currentWeekStart(before), currentWeekStart(after)]).toContain(current);
    expect([nextWeekStart(before), nextWeekStart(after)]).toContain(next);
    expect(current).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(next).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
