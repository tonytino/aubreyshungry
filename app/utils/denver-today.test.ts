import { describe, expect, it } from "vitest";
import { denverToday } from "./denver-today";

describe("denverToday", () => {
  it("returns the Denver wall-clock date, zero-padded", () => {
    expect(denverToday(new Date("2026-08-16T18:00:00Z"))).toBe("2026-08-16");
    expect(denverToday(new Date("2026-01-04T18:00:00Z"))).toBe("2026-01-04");
  });

  it("is still YESTERDAY in Denver when UTC has already rolled over", () => {
    // The whole reason this module exists. MDT is UTC-6: at 05:00Z the UTC
    // calendar already says Aug 16, but Denver is at 23:00 on Aug 15.
    const instant = new Date("2026-08-16T05:00:00Z");
    expect(instant.toISOString().slice(0, 10)).toBe("2026-08-16");
    expect(denverToday(instant)).toBe("2026-08-15");
  });

  it("rolls over at Denver midnight in summer (MDT, UTC-6)", () => {
    expect(denverToday(new Date("2026-08-16T05:59:59Z"))).toBe("2026-08-15");
    expect(denverToday(new Date("2026-08-16T06:00:00Z"))).toBe("2026-08-16");
  });

  it("rolls over at Denver midnight in winter (MST, UTC-7)", () => {
    // One hour later in UTC terms than the summer case — the offset change
    // is applied automatically, with no DST table of our own.
    expect(denverToday(new Date("2026-01-04T06:59:59Z"))).toBe("2026-01-03");
    expect(denverToday(new Date("2026-01-04T07:00:00Z"))).toBe("2026-01-04");
  });

  it("handles the spring-forward day (23 hours local)", () => {
    expect(denverToday(new Date("2026-03-08T06:59:59Z"))).toBe("2026-03-07");
    expect(denverToday(new Date("2026-03-08T07:00:00Z"))).toBe("2026-03-08");
    // 03:00 MDT, just after the skipped hour — still the same local day.
    expect(denverToday(new Date("2026-03-08T09:00:00Z"))).toBe("2026-03-08");
    expect(denverToday(new Date("2026-03-09T05:59:59Z"))).toBe("2026-03-08");
  });

  it("handles the fall-back day (25 hours local, 01:30 happens twice)", () => {
    expect(denverToday(new Date("2026-11-01T05:59:59Z"))).toBe("2026-10-31");
    expect(denverToday(new Date("2026-11-01T06:00:00Z"))).toBe("2026-11-01");
    // Both passes through 01:30 local land on the same calendar day.
    expect(denverToday(new Date("2026-11-01T07:30:00Z"))).toBe("2026-11-01");
    expect(denverToday(new Date("2026-11-01T08:30:00Z"))).toBe("2026-11-01");
    expect(denverToday(new Date("2026-11-02T06:59:59Z"))).toBe("2026-11-01");
  });

  it("crosses the year boundary in Denver, not UTC", () => {
    const instant = new Date("2027-01-01T06:00:00Z");
    expect(instant.toISOString().slice(0, 10)).toBe("2027-01-01");
    expect(denverToday(instant)).toBe("2026-12-31");
  });

  it("rejects an invalid Date rather than emitting a bogus day", () => {
    expect(() => denverToday(new Date("nonsense"))).toThrow(/valid Date/);
  });
});
