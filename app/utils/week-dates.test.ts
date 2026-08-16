import { describe, expect, it } from "vitest";
import { formatWeekRange, weekLabel, weekStartDate } from "./week-dates";

describe("weekStartDate", () => {
  it("returns UTC midnight of a mid-year Sunday", () => {
    expect(weekStartDate("2026-08-16").toISOString()).toBe("2026-08-16T00:00:00.000Z");
  });

  it("returns UTC midnight for a week that spills into the next year", () => {
    expect(weekStartDate("2026-12-27").toISOString()).toBe("2026-12-27T00:00:00.000Z");
  });

  it("is unaffected by local DST — the spring-forward Sunday is still midnight UTC", () => {
    // 2026-03-08 is a 23-hour day in America/Denver. All math here is UTC,
    // so the result must not shift by an hour.
    expect(weekStartDate("2026-03-08").toISOString()).toBe("2026-03-08T00:00:00.000Z");
    expect(weekStartDate("2026-11-01").toISOString()).toBe("2026-11-01T00:00:00.000Z");
  });

  it.each([
    ["an ISO week identifier", "2026-W33"],
    ["an unpadded month", "2026-8-16"],
    ["a timestamp", "2026-08-16T00:00:00Z"],
    ["an empty string", ""],
  ])("throws on %s", (_label, value) => {
    expect(() => weekStartDate(value)).toThrow(/expected YYYY-MM-DD/);
  });

  it("throws on a shape-valid but impossible date", () => {
    expect(() => weekStartDate("2026-02-30")).toThrow(/not a real calendar date/);
    expect(() => weekStartDate("2026-13-01")).toThrow(/not a real calendar date/);
  });

  it("throws on a real date that is not a Sunday", () => {
    // Rendering a Sun–Sat span from a Monday would be a plausible-looking
    // lie about which days the plan covers, so this must fail loudly.
    expect(() => weekStartDate("2026-08-17")).toThrow(/not a Sunday/);
    expect(() => weekStartDate("2026-08-22")).toThrow(/not a Sunday/);
  });
});

describe("formatWeekRange", () => {
  it("formats a same-month week compactly", () => {
    expect(formatWeekRange("2026-08-16")).toBe("Aug 16–22, 2026");
  });

  it("formats a month-spanning week with both months", () => {
    // Sun Aug 30 – Sat Sep 5.
    expect(formatWeekRange("2026-08-30")).toBe("Aug 30 – Sep 5, 2026");
  });

  it("formats a year-spanning week with both years", () => {
    // Sun Dec 27, 2026 – Sat Jan 2, 2027.
    expect(formatWeekRange("2026-12-27")).toBe("Dec 27, 2026 – Jan 2, 2027");
  });

  it("formats a leap-February week that crosses into March", () => {
    // Sun Feb 25, 2024 – Sat Mar 2, 2024: the Feb 29 must be counted.
    expect(formatWeekRange("2024-02-25")).toBe("Feb 25 – Mar 2, 2024");
  });

  it("always spans exactly seven days, Sunday through Saturday", () => {
    // Walk a full year of Sundays: the range end must be start + 6 days, so
    // no month-length or leap-day case can silently produce a short week.
    const MS_PER_DAY = 86_400_000;
    for (let t = Date.UTC(2026, 0, 4); t < Date.UTC(2027, 0, 4); t += 7 * MS_PER_DAY) {
      const start = new Date(t);
      const id = start.toISOString().slice(0, 10);
      expect(start.getUTCDay(), id).toBe(0);
      const end = new Date(t + 6 * MS_PER_DAY);
      expect(end.getUTCDay(), id).toBe(6);
      // The formatted string must name the Saturday's day-of-month.
      expect(formatWeekRange(id), id).toContain(String(end.getUTCDate()));
    }
  });
});

describe("weekLabel", () => {
  it("names the week by its starting Sunday", () => {
    expect(weekLabel("2026-08-16")).toBe("Week of Aug 16, 2026");
  });

  it("does not zero-pad the day", () => {
    expect(weekLabel("2026-01-04")).toBe("Week of Jan 4, 2026");
  });

  it("uses the Sunday's year, not the year the week ends in", () => {
    expect(weekLabel("2026-12-27")).toBe("Week of Dec 27, 2026");
  });
});
