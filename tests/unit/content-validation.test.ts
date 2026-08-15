import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { validateContentDir } from "../../app/content/validate";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/**
 * CI gate: the real repo content must always validate. This runs in the
 * existing Vitest CI job, making schema validation a required check for
 * every PR that touches `content/` (see docs/agents/generation.md).
 *
 * While `content/` does not exist yet this passes trivially — an absent
 * directory is valid-and-empty by design (ADR-006: content lands via the
 * generation pipeline, not ahead of need).
 */
describe("repo content", () => {
  it("content/ validates against the schemas with intact references", () => {
    const result = validateContentDir(path.join(REPO_ROOT, "content"));
    const report = result.errors
      .map((error) => `${error.file}${error.path ? ` at ${error.path}` : ""}: ${error.message}`)
      .join("\n");
    expect(result.errors, report).toEqual([]);
    expect(result.ok).toBe(true);
  });
});
