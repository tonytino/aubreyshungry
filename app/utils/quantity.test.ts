import { describe, expect, it } from "vitest";
import { formatQuantity } from "./quantity";

describe("formatQuantity", () => {
  it("joins amount and unit", () => {
    expect(formatQuantity(1.5, "lb")).toBe("1.5 lb");
  });

  it("renders bare counts without a unit", () => {
    expect(formatQuantity(2, "")).toBe("2");
  });

  it("trims floating-point noise from summed quantities", () => {
    expect(formatQuantity(0.1 + 0.2, "cup")).toBe("0.3 cup");
  });

  it("rounds to two decimals", () => {
    expect(formatQuantity(1 / 3, "tsp")).toBe("0.33 tsp");
  });
});
