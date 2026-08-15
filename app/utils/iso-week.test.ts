import { describe, expect, it } from "vitest";
import { formatIsoWeekRange, isoWeekLabel, isoWeekStartDate } from "./iso-week";

describe("isoWeekStartDate", () => {
  it("returns the Monday of a mid-year week", () => {
    // 2026-W33: Monday 2026-08-10.
    expect(isoWeekStartDate("2026-W33").toISOString()).toBe("2026-08-10T00:00:00.000Z");
  });

  it("handles week 1 starting in the previous calendar year", () => {
    // ISO 2026-W01 starts Monday 2025-12-29.
    expect(isoWeekStartDate("2026-W01").toISOString()).toBe("2025-12-29T00:00:00.000Z");
  });

  it("handles a long-year week 53", () => {
    // 2020 is an ISO long year; W53 starts Monday 2020-12-28.
    expect(isoWeekStartDate("2020-W53").toISOString()).toBe("2020-12-28T00:00:00.000Z");
  });

  it("throws on malformed input", () => {
    expect(() => isoWeekStartDate("2026-33")).toThrow(/invalid ISO week/);
  });
});

describe("formatIsoWeekRange", () => {
  it("formats a same-month week compactly", () => {
    expect(formatIsoWeekRange("2026-W33")).toBe("Aug 10–16, 2026");
  });

  it("formats a month-spanning week with both months", () => {
    // 2026-W36: Mon Aug 31 – Sun Sep 6.
    expect(formatIsoWeekRange("2026-W36")).toBe("Aug 31 – Sep 6, 2026");
  });

  it("formats a year-spanning week with both years", () => {
    expect(formatIsoWeekRange("2026-W01")).toBe("Dec 29, 2025 – Jan 4, 2026");
  });
});

describe("isoWeekLabel", () => {
  it("renders a human week title", () => {
    expect(isoWeekLabel("2026-W33")).toBe("Week 33, 2026");
  });

  it("keeps single-digit weeks readable", () => {
    expect(isoWeekLabel("2026-W03")).toBe("Week 3, 2026");
  });
});
