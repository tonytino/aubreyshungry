import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error — .mjs script, no type declarations
import * as detector from "../../.github/scripts/check-owner-review.mjs";
// @ts-expect-error — .mjs module, no type declarations
import * as policy from "../../.github/scripts/owner-review-paths.mjs";

const { matchCodeowners, isOwnedPath, parseUnifiedDiff, contentReasons, classifyOwnerReview } =
  detector;
const { OWNED_PATHS, OWNER_HANDLE } = policy as { OWNED_PATHS: string[]; OWNER_HANDLE: string };

describe("matchCodeowners — CODEOWNERS glob semantics", () => {
  it("matches a directory prefix (trailing slash)", () => {
    expect(matchCodeowners("/db/migrations/", "db/migrations/0001_init.sql")).toBe(true);
    expect(matchCodeowners("/db/migrations/", "db/migrations-notes.md")).toBe(false);
  });

  it("matches an exact root-anchored file but not a nested one of the same name", () => {
    expect(matchCodeowners("/package.json", "package.json")).toBe(true);
    expect(matchCodeowners("/package.json", "packages/x/package.json")).toBe(false);
  });

  it("treats `*` as non-slash-crossing and `.` as a literal", () => {
    expect(matchCodeowners("/*.config.ts", "app.config.ts")).toBe(true);
    expect(matchCodeowners("/*.config.ts", "app/nested.config.ts")).toBe(false);
    expect(matchCodeowners("/app/env.ts", "app/envXts")).toBe(false);
  });
});

describe("isOwnedPath — the owner-gated categories", () => {
  it.each([
    "docs/agents/dietary-safety.md", // dietary safety
    "AGENTS.md", // governance
    "docs/agents/governance.md", // governance
    "docs/decisions/001-example.md", // governance
    ".github/workflows/ci.yml", // guardrail integrity
    ".github/CODEOWNERS", // guardrail integrity
    ".github/scripts/check-owner-review.mjs", // guardrail integrity
    "scripts/labels.mjs", // process/config
    "package.json", // supply chain / cost
    "pnpm-lock.yaml", // supply chain
    "app/env.ts", // secrets
    ".env.example", // secrets
    "db/migrations/0001_init.sql", // destructive-data surface
  ])("gates %s", (file) => {
    expect(isOwnedPath(file)).toBe(true);
  });

  it.each([
    "app/components/WeeklyPlan.tsx",
    "app/routes/index.tsx",
    "docs/agents/testing.md",
    "docs/agents/nutrition-guidelines.md",
    "changelog.d/foo.added.md",
    "db/schema.ts",
    "tests/unit/db.test.ts",
  ])("does NOT gate ordinary feature work: %s", (file) => {
    expect(isOwnedPath(file)).toBe(false);
  });
});

describe("parseUnifiedDiff", () => {
  it("attributes added/removed lines to the right file", () => {
    const diff = [
      "diff --git a/app/x.ts b/app/x.ts",
      "--- a/app/x.ts",
      "+++ b/app/x.ts",
      "@@ -1,1 +1,1 @@",
      "-old line",
      "+new line",
    ].join("\n");
    const entries = parseUnifiedDiff(diff);
    expect(entries).toContainEqual({ file: "app/x.ts", side: "add", text: "new line" });
    expect(entries).toContainEqual({ file: "app/x.ts", side: "del", text: "old line" });
  });

  it("uses the a-side path for a deletion (+++ /dev/null)", () => {
    const diff = ["--- a/app/gone.ts", "+++ /dev/null", "@@ -1 +0,0 @@", "-was here"].join("\n");
    expect(parseUnifiedDiff(diff)).toContainEqual({
      file: "app/gone.ts",
      side: "del",
      text: "was here",
    });
  });

  it("does not misparse an added line whose content starts with `+++ ` as a header", () => {
    const diff = [
      "diff --git a/db/migrations/0007_x.sql b/db/migrations/0007_x.sql",
      "--- a/db/migrations/0007_x.sql",
      "+++ b/db/migrations/0007_x.sql",
      "@@ -0,0 +1,2 @@",
      "+++ a comment line that looks like a header",
      '+DROP TABLE "weeks";',
    ].join("\n");
    const entries = parseUnifiedDiff(diff);
    // The DROP TABLE line must still be attributed to the migration file, not
    // lost to a bogus file reset.
    expect(entries).toContainEqual({
      file: "db/migrations/0007_x.sql",
      side: "add",
      text: 'DROP TABLE "weeks";',
    });
    expect(contentReasons(entries).map((r: { kind: string }) => r.kind)).toContain(
      "destructive-migration"
    );
  });
});

describe("content checks — gated changes paths can't see", () => {
  it("flags a destructive migration only on added lines in db/migrations", () => {
    const diff = [
      "--- a/db/migrations/0006_x.sql",
      "+++ b/db/migrations/0006_x.sql",
      "@@ -0,0 +1 @@",
      '+ALTER TABLE "weeks" DROP COLUMN "notes";',
    ].join("\n");
    const reasons = contentReasons(parseUnifiedDiff(diff));
    expect(reasons.map((r: { kind: string }) => r.kind)).toContain("destructive-migration");
  });

  it("does not flag destructive SQL that lives outside db/migrations", () => {
    const diff = ["--- a/docs/x.md", "+++ b/docs/x.md", "@@ +1 @@", "+run DROP TABLE weeks"].join(
      "\n"
    );
    const kinds = contentReasons(parseUnifiedDiff(diff)).map((r: { kind: string }) => r.kind);
    expect(kinds).not.toContain("destructive-migration");
  });

  it("flags a change to the medical/nutritional-advice disclaimer in ANY file (added or removed)", () => {
    const diff = [
      "--- a/README.md",
      "+++ b/README.md",
      "@@ -1 +1 @@",
      "-It is not medical or nutritional advice.",
      "+A weekly meal-plan digest for one household.",
    ].join("\n");
    const kinds = contentReasons(parseUnifiedDiff(diff)).map((r: { kind: string }) => r.kind);
    expect(kinds).toContain("safety-disclaimer");
  });

  it("flags a reworded disclaimer in a new unowned file (no path backstop)", () => {
    const diff = [
      "--- /dev/null",
      "+++ b/app/components/LegalLine.tsx",
      "@@ +1 @@",
      "+  return <p>Not a substitute for professional dietary guidance.</p>;",
    ].join("\n");
    const kinds = contentReasons(parseUnifiedDiff(diff)).map((r: { kind: string }) => r.kind);
    expect(kinds).toContain("safety-disclaimer");
  });

  it("flags a forbidden-ingredient term added to a food-content file", () => {
    for (const line of [
      "+- 1/2 cup cashew cream",
      "+- 1 tbsp pistachio paste",
      "+- 2 cups wheat flour",
      "+- 1 tbsp soy sauce",
    ]) {
      const diff = [
        "--- a/content/2026-w32/recipes.md",
        "+++ b/content/2026-w32/recipes.md",
        "@@ +1 @@",
        line,
      ].join("\n");
      const kinds = contentReasons(parseUnifiedDiff(diff)).map((r: { kind: string }) => r.kind);
      expect(kinds, line).toContain("forbidden-ingredient");
    }
  });

  it("scopes the forbidden-ingredient check to food-content files (recipe/seed/plan naming)", () => {
    // A dietary-safety DOC discussing cashews is not food content — the check
    // must not fire outside food-content files (the dedicated linter from
    // issue #3 is the real gate for food content anyway).
    const diff = [
      "--- a/docs/agents/nutrition-guidelines.md",
      "+++ b/docs/agents/nutrition-guidelines.md",
      "@@ +1 @@",
      "+Avoid cashews and pistachios everywhere (life-threatening allergy).",
    ].join("\n");
    const kinds = contentReasons(parseUnifiedDiff(diff)).map((r: { kind: string }) => r.kind);
    expect(kinds).not.toContain("forbidden-ingredient");

    // But a seed-data file IS food content.
    const seedDiff = [
      "--- a/db/seed.ts",
      "+++ b/db/seed.ts",
      "@@ +1 @@",
      '+  { name: "cashew butter", quantity: 1 },',
    ].join("\n");
    const seedKinds = contentReasons(parseUnifiedDiff(seedDiff)).map(
      (r: { kind: string }) => r.kind
    );
    expect(seedKinds).toContain("forbidden-ingredient");
  });

  it("does not flag safe food content", () => {
    const diff = [
      "--- a/content/2026-w32/recipes.md",
      "+++ b/content/2026-w32/recipes.md",
      "@@ +1 @@",
      "+- 1 cup certified gluten-free oats",
      "+- 2 tbsp almond butter",
      "+- 1 tbsp gluten-free tamari",
    ].join("\n");
    const kinds = contentReasons(parseUnifiedDiff(diff)).map((r: { kind: string }) => r.kind);
    expect(kinds).not.toContain("forbidden-ingredient");
  });
});

describe("classifyOwnerReview — the gate", () => {
  it("fails an owner-gated path labeled safe:agent", () => {
    const r = classifyOwnerReview({
      changedFiles: ["docs/agents/dietary-safety.md"],
      labels: ["type:docs", "size:s", "safe:agent"],
    });
    expect(r.requiresOwner).toBe(true);
    expect(r.ok).toBe(false);
  });

  it("passes the same change once relabeled safe:human", () => {
    const r = classifyOwnerReview({
      changedFiles: ["docs/agents/dietary-safety.md"],
      labels: ["type:docs", "size:s", "safe:human"],
    });
    expect(r.requiresOwner).toBe(true);
    expect(r.ok).toBe(true);
  });

  it("fails a forbidden-ingredient addition labeled safe:agent (content-based)", () => {
    const diff = [
      "--- a/content/2026-w32/snacks.md",
      "+++ b/content/2026-w32/snacks.md",
      "@@ +1 @@",
      "+- cashew clusters",
    ].join("\n");
    const r = classifyOwnerReview({
      changedFiles: ["content/2026-w32/snacks.md"],
      diffText: diff,
      labels: ["safe:agent"],
    });
    expect(r.ok).toBe(false);
    expect(r.reasons.some((x: { kind: string }) => x.kind === "forbidden-ingredient")).toBe(true);
  });

  it("passes ordinary feature work labeled safe:agent (no owner review needed)", () => {
    const r = classifyOwnerReview({
      changedFiles: ["app/components/WeeklyPlan.tsx"],
      labels: ["safe:agent"],
    });
    expect(r.requiresOwner).toBe(false);
    expect(r.ok).toBe(true);
  });
});

describe("drift guard — CODEOWNERS and the policy module never diverge", () => {
  it("has identical path sets in .github/CODEOWNERS and OWNED_PATHS (bidirectional)", () => {
    // Vitest's root is the repo root, so resolve from cwd (works in CI too).
    const codeownersPath = join(process.cwd(), ".github/CODEOWNERS");
    const codeownersTokens = readFileSync(codeownersPath, "utf8")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l !== "" && !l.startsWith("#"))
      .map((l) => l.split(/\s+/)[0] ?? "");

    const codeownersSet = new Set(codeownersTokens);
    const policySet = new Set(OWNED_PATHS);

    // Every CODEOWNERS entry is known to the detector...
    for (const token of codeownersSet) expect(policySet.has(token)).toBe(true);
    // ...and every policy path is actually gated in CODEOWNERS.
    for (const token of policySet) expect(codeownersSet.has(token)).toBe(true);
    expect(codeownersSet.size).toBe(policySet.size);
  });

  it("assigns every CODEOWNERS rule solely to the owner (no other/empty owner)", () => {
    // Set-equality on paths alone would let a rule reassign a gated path to a
    // bot — or drop the owner entirely (which REMOVES ownership) — while
    // staying green. Assert every rule's owner column is exactly the owner.
    const codeownersPath = join(process.cwd(), ".github/CODEOWNERS");
    const rules = readFileSync(codeownersPath, "utf8")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l !== "" && !l.startsWith("#"));
    for (const rule of rules) {
      const owners = rule.split(/\s+/).slice(1);
      expect(owners).toEqual([OWNER_HANDLE]);
    }
  });
});
