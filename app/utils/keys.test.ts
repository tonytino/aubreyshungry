import { describe, expect, it } from "vitest";
import { withKeys } from "./keys";

describe("withKeys", () => {
  it("uses the derived key when unique", () => {
    expect(withKeys(["a", "b"], (s) => s)).toEqual([
      { item: "a", key: "a" },
      { item: "b", key: "b" },
    ]);
  });

  it("suffixes duplicates deterministically", () => {
    expect(withKeys(["Stir.", "Stir.", "Stir."], (s) => s).map((e) => e.key)).toEqual([
      "Stir.",
      "Stir.-2",
      "Stir.-3",
    ]);
  });
});
