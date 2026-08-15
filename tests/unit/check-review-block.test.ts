import { describe, expect, it } from "vitest";
// @ts-expect-error — .mjs script, no type declarations
import { validateReviewBlock } from "../../.github/scripts/check-review-block.mjs";

describe("validateReviewBlock", () => {
  it("passes on a SHIP verdict block", () => {
    const body = [
      "## Summary",
      "- did a thing",
      "",
      "## Adversarial review",
      "overall: SHIP",
      "notes: clean after round 1.",
    ].join("\n");
    expect(validateReviewBlock(body)).toEqual({ ok: true });
  });

  it("passes on the verbatim orchestration.md JSON verdict block", () => {
    // Exactly the fenced verdict from docs/agents/orchestration.md (quoted key
    // and value) pasted inside the section — the canonical Reviewer output.
    const body = [
      "## Adversarial review",
      "",
      "```json",
      "{",
      '  "findings": [],',
      '  "overall": "SHIP",',
      '  "notes": "clean."',
      "}",
      "```",
    ].join("\n");
    expect(validateReviewBlock(body)).toEqual({ ok: true });
  });

  it("passes on the escalation `##` heading placed after the section", () => {
    // orchestration.md documents the escalation block as its own h2 heading —
    // a SIBLING of `## Adversarial review`, so the section boundary cuts it
    // off — but the marker is matched body-wide and must still validate.
    const body = [
      "## Adversarial review",
      "",
      "## Unresolved review items (escalated after 2-round cap)",
      "- **[major] correctness** — edge case. Worker's rebuttal: … Reviewer's concern: …",
    ].join("\n");
    expect(validateReviewBlock(body)).toEqual({ ok: true });
  });

  it("passes on bold-emphasised verdicts", () => {
    expect(validateReviewBlock("## Adversarial review\n**overall**: SHIP").ok).toBe(true);
    expect(validateReviewBlock("## Adversarial review\n**overall: SHIP**").ok).toBe(true);
  });

  it("fails on a SHIP-prefixed word (word boundary)", () => {
    expect(validateReviewBlock("## Adversarial review\noverall: SHIPPED to prod").ok).toBe(false);
    expect(validateReviewBlock("## Adversarial review\noverall: SHIP-NOT").ok).toBe(false);
  });

  it("is case-insensitive on the heading and the verdict", () => {
    const body = ["### ADVERSARIAL REVIEW", "Overall:   Ship"].join("\n");
    expect(validateReviewBlock(body)).toEqual({ ok: true });
  });

  it("fails when the heading is missing", () => {
    const r = validateReviewBlock("## Summary\noverall: SHIP");
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/heading/i);
  });

  it("fails on an empty body and an empty/placeholder section", () => {
    expect(validateReviewBlock("").ok).toBe(false);
    expect(validateReviewBlock("## Adversarial review\n\n-\n").ok).toBe(false);
    expect(validateReviewBlock("## Adversarial review\n<!-- paste verdict here -->").ok).toBe(
      false
    );
  });

  it("does NOT accept a SHIP token outside the Adversarial review section", () => {
    const body = [
      "## Summary",
      "overall: SHIP",
      "",
      "## Adversarial review",
      "round 1: CHANGES_REQUESTED",
    ].join("\n");
    expect(validateReviewBlock(body).ok).toBe(false);
  });

  it("bounds the section at the next same-or-shallower heading", () => {
    const body = [
      "## Adversarial review",
      "round 1 notes only",
      "## Test plan",
      "overall: SHIP",
    ].join("\n");
    expect(validateReviewBlock(body).ok).toBe(false);
  });
});
