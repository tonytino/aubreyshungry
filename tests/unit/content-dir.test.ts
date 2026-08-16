import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadPreferences } from "../../app/content/preferences";
import { validateContentDir } from "../../app/content/validate";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const CONTENT_DIR = path.join(REPO_ROOT, "content");

const contentDirExists = fs.existsSync(CONTENT_DIR);
const preferencesFileExists = fs.existsSync(path.join(CONTENT_DIR, "preferences.json"));

/**
 * CI gate over the REAL repo content (supersedes the earlier
 * content-validation.test.ts). It runs inside the existing Vitest CI job —
 * and standalone as `pnpm validate:content` — making schema validation a
 * required check for every PR that touches `content/`
 * (docs/agents/generation.md).
 *
 * When `content/` (or preferences.json) is absent, the corresponding gate is
 * an EXPLICIT skip-style pass — a test that asserts the absence — never a
 * silent green: absence of content is valid-and-empty by design (ADR-006),
 * but the run output must say which state it verified.
 */
describe("repo content gate", () => {
  it.runIf(contentDirExists)("content/ weeks + recipes validate with intact references", () => {
    const result = validateContentDir(CONTENT_DIR);
    // Report EVERY error in the failure message so a red run is fixable
    // without re-running anything.
    const report = result.errors
      .map((error) => `${error.file}${error.path ? ` at ${error.path}` : ""}: ${error.message}`)
      .join("\n");
    expect(result.errors, report).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it.runIf(!contentDirExists)(
    "content/ is absent — explicitly skipping the weeks/recipes gate (valid-and-empty per ADR-006)",
    () => {
      expect(contentDirExists).toBe(false);
      // Absent dir must still be a defined, valid state for the validator.
      expect(validateContentDir(CONTENT_DIR).ok).toBe(true);
    }
  );

  it.runIf(preferencesFileExists)("content/preferences.json validates against the schema", () => {
    const result = loadPreferences(CONTENT_DIR);
    const report = result.ok
      ? ""
      : result.errors
          .map((error) => `${error.file}${error.path ? ` at ${error.path}` : ""}: ${error.message}`)
          .join("\n");
    expect(result.ok, report).toBe(true);
    if (result.ok) {
      // The file exists, so the loader must return data, not the absent state.
      expect(result.data).not.toBeNull();
    }
  });

  it.runIf(!preferencesFileExists)(
    "content/preferences.json is absent — explicitly skipping the preferences gate (a defined non-error state)",
    () => {
      expect(preferencesFileExists).toBe(false);
      expect(loadPreferences(CONTENT_DIR)).toEqual({ ok: true, data: null });
    }
  );
});
