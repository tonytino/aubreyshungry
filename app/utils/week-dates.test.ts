import { describe, expect, it } from "vitest";
import { formatWeekRange, weekContains, weekLabel, weekStartDate } from "./week-dates";

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

describe("weekContains", () => {
  it("covers all seven days from the Sunday through the Saturday", () => {
    const days = [
      "2026-08-16",
      "2026-08-17",
      "2026-08-18",
      "2026-08-19",
      "2026-08-20",
      "2026-08-21",
      "2026-08-22",
    ];
    for (const day of days) {
      expect(weekContains("2026-08-16", day), day).toBe(true);
    }
  });

  it("excludes the day before and the day after the span", () => {
    expect(weekContains("2026-08-16", "2026-08-15")).toBe(false);
    expect(weekContains("2026-08-16", "2026-08-23")).toBe(false);
  });

  it("spans month and year boundaries", () => {
    expect(weekContains("2026-08-30", "2026-09-05")).toBe(true);
    expect(weekContains("2026-08-30", "2026-09-06")).toBe(false);
    expect(weekContains("2026-12-27", "2027-01-02")).toBe(true);
    expect(weekContains("2026-12-27", "2027-01-03")).toBe(false);
  });

  it("counts the leap day", () => {
    expect(weekContains("2024-02-25", "2024-02-29")).toBe(true);
    expect(weekContains("2024-02-25", "2024-03-02")).toBe(true);
    expect(weekContains("2024-02-25", "2024-03-03")).toBe(false);
  });

  it("is unaffected by DST — the local 23- and 25-hour Sundays still span 7 days", () => {
    // Both transition weeks must contain their own Saturday and exclude the
    // next Sunday, exactly like any other week.
    expect(weekContains("2026-03-08", "2026-03-14")).toBe(true);
    expect(weekContains("2026-03-08", "2026-03-15")).toBe(false);
    expect(weekContains("2026-11-01", "2026-11-07")).toBe(true);
    expect(weekContains("2026-11-01", "2026-11-08")).toBe(false);
  });

  it("throws on a non-Sunday week or a malformed date", () => {
    expect(() => weekContains("2026-08-17", "2026-08-18")).toThrow(/not a Sunday/);
    expect(() => weekContains("2026-08-16", "nonsense")).toThrow(/invalid calendar date/);
    expect(() => weekContains("2026-08-16", "2026-13-01")).toThrow(/invalid calendar date/);
  });
});
