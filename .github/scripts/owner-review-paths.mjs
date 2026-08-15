// Single source of truth for the owner-review guardrail (docs/agents/governance.md).
// Ported and adapted from the sibling repo aubreyslist.
//
// This module defines WHICH changes require the repo owner's explicit review.
// It is consumed by two places that MUST agree:
//   1. .github/scripts/check-owner-review.mjs — the CI detector (Layer 2).
//   2. tests/unit/check-owner-review.test.ts — asserts this list and
//      `.github/CODEOWNERS` (Layer 1) never drift apart (bidirectional).
//
// The design is two-layer (see docs/agents/governance.md):
//   Layer 1 (the teeth): .github/CODEOWNERS assigns exactly OWNED_PATHS to the
//     owner; GitHub branch protection ("Require review from Code Owners") makes
//     an owned-path PR unmergeable until the owner approves. Nothing here can
//     be bypassed by a collaborator, bot, or agent.
//   Layer 2 (the tripwire): the CI detector re-derives the same surface from
//     this module PLUS content signals paths can't see (destructive SQL, the
//     safety-disclaimer copy, forbidden-ingredient terms in food content) and
//     FAILS the PR unless it is labeled `safe:human`. This stops an agent
//     self-labeling a gated change `safe:agent` (auto-mergeable).
//
// IMPORTANT — the backstop is asymmetric. Layer 1 (CODEOWNERS) backstops every
// miss in the PATH categories: a path-owned file cannot merge without the owner
// regardless of label, so the path checks can be simple. The CONTENT_CHECKS are
// different — they exist to catch gated changes that land in UNOWNED files (the
// disclaimer moved to a component, a cashew slipping into a recipe file), which
// by definition have NO Layer-1 backstop. They are therefore best-effort
// heuristics: a content-category change in an unowned file that evades these
// patterns can still merge as `safe:agent`. Keep the patterns broad and treat
// this as a known residual limitation (documented in docs/agents/governance.md).
//
// The owner-gated categories (docs/agents/governance.md): dietary safety, cost,
// legal/copyright, security, destructive/irreversible data changes, and the
// process/config surfaces.

/**
 * OWNED_PATHS — the exact path tokens that appear in `.github/CODEOWNERS`.
 *
 * Each entry uses GitHub CODEOWNERS glob semantics (gitignore-style):
 *   - a leading `/` anchors to the repo root;
 *   - a trailing `/` matches everything under that directory;
 *   - `*` matches any run of non-`/` characters; `?` matches one non-`/` char;
 *   - other characters (including `.` and `$`) are literal.
 *
 * KEEP THIS IDENTICAL to the path tokens in `.github/CODEOWNERS`. The
 * bidirectional drift test fails the build if the two sets ever diverge.
 *
 * @type {string[]}
 */
export const OWNED_PATHS = [
  // ── Dietary safety — the golden rules and their enforcement ──
  "/docs/agents/dietary-safety.md",

  // ── Governance and process/config surfaces. Owning these makes the guardrail
  //    self-protecting: weakening any gate needs the owner's review. `/.github/`
  //    covers CODEOWNERS itself, every workflow, and every guard script
  //    (including this file). ──
  "/AGENTS.md",
  "/docs/agents/governance.md",
  "/docs/decisions/",
  "/.github/",
  "/scripts/labels.mjs",
  "/package.json",
  "/pnpm-lock.yaml",

  // ── Security / data surfaces ──
  "/app/env.ts",
  "/.env.example",
  "/db/migrations/",
];

/**
 * Content signals that require owner review even when the edit lands in a file
 * NOT in OWNED_PATHS. Each is a category with `patterns` tested per changed
 * line and the diff `side` it applies to:
 *   - "add"  → only added (`+`) lines are inspected;
 *   - "both" → added and removed (`+`/`-`) lines are inspected (removing the
 *     disclaimer is as gate-worthy as changing it).
 *
 * `fileScope`, when set, restricts a check to changed lines whose file matches
 * (used to keep the destructive-SQL scan to migration files and the
 * forbidden-ingredient scan to food-content files).
 */
export const CONTENT_CHECKS = [
  {
    kind: "destructive-migration",
    side: "add",
    fileScope: /(^|\/)db\/migrations\//,
    // Data-loss / integrity-loss operations. `SET DATA TYPE` / `ALTER COLUMN
    // ... TYPE` narrows a column (can truncate/round existing values); dropping
    // a constraint/NOT NULL/DEFAULT loses an invariant; RENAME + DELETE FROM
    // are destructive too. NOTE: any migration edit is ALREADY path-gated
    // (/db/migrations/ is an OWNED_PATH), so this list only sharpens the error
    // message — it does not need to be exhaustive to keep data-loss migrations
    // from shipping `safe:agent`. Destructive SQL executed from NON-migration
    // app code (e.g. a raw `sql`TRUNCATE …`` in an unowned server module) is
    // out of scope here (see the residual-limitations note in
    // docs/agents/governance.md).
    patterns: [
      /\bdrop\s+table\b/i,
      /\bdrop\s+column\b/i,
      /\bdrop\s+constraint\b/i,
      /\bdrop\s+(not\s+null|default)\b/i,
      /\btruncate\b/i,
      /\bdelete\s+from\b/i,
      /\brename\s+(column|table|to)\b/i,
      /\bset\s+data\s+type\b/i,
      /\balter\s+column\b[^\n;]*\btype\b/i,
    ],
    message:
      "This migration contains an irreversible / data-loss operation (published weeks and the archive are meant to be a trustworthy history). It requires the owner's explicit review (safe:human) — see docs/agents/governance.md.",
  },
  {
    kind: "safety-disclaimer",
    side: "both",
    // The "not medical or nutritional advice" framing (currently in README.md)
    // is a legal + safety statement. Any line touching this framing (in ANY
    // file — the disclaimer may move) is gated so wording changes get the
    // owner's sign-off. Broadened past the exact phrase so a reworded variant
    // in a new component still trips.
    patterns: [
      /medical\s+(advice|guidance|opinion|claims?)/i,
      /nutritional?\s+advice/i,
      /health\s+advice/i,
      /(not|isn'?t)\s+a\s+substitute\s+for/i,
      /professional\s+(medical|health|dietary)/i,
      /consult\s+(a|your)\s+(doctor|physician|dietitian|healthcare)/i,
    ],
    message:
      "This change touches the medical/nutritional-advice safety-disclaimer copy. Changing the legal/safety framing requires the owner's explicit review (safe:human) — see docs/agents/governance.md.",
  },
  {
    kind: "forbidden-ingredient",
    side: "add",
    // Food-content files: the planned per-week content dir (content storage is
    // leaning files-in-repo, see docs/agents/domain.md), seed/fixture data, and
    // any file whose name signals meal-plan/recipe/snack/shopping-list content.
    fileScope:
      /(^|\/)(content\/|seed|fixtures?\/|[^/]*(meal-?plan|recipe|snack|shopping-?list|week-)[^/]*)/i,
    // DELIBERATELY simple heuristic — a tripwire, not the safety gate. The
    // dedicated forbidden-ingredient linter (issue #3) is the real gate for
    // food content; until it exists and is trusted, ALL food content is
    // `safe:human` anyway (docs/agents/governance.md). This check only catches
    // the loudest golden-rule signals (docs/agents/dietary-safety.md): cashew/
    // pistachio in any form, and the classic gluten grains. False positives
    // (e.g. "wheat-free") merely force `safe:human` — cheap on this product.
    patterns: [
      /cashew/i,
      /pistachio/i,
      /\bwheat\b/i,
      /\bbarley\b/i,
      /\brye\b/i,
      /\bfarro\b/i,
      /\bspelt\b/i,
      /\bseitan\b/i,
      /\bmalt\b/i,
      /\bsoy\s+sauce\b/i, // wheat unless certified GF tamari — always flag for review
      /\bcouscous\b/i,
      /\bsemolina\b/i,
      /\borzo\b/i,
    ],
    message:
      "This change adds a forbidden-ingredient signal (gluten grain or cashew/pistachio term) to a food-content file. Dietary safety is the most owner-caliber surface in this repo: label it safe:human — see docs/agents/dietary-safety.md and docs/agents/governance.md. (The dedicated forbidden-ingredient linter — issue #3 — is the real gate; this is only a tripwire.)",
  },
];

/** The label that marks a PR as owner-reviewed-and-merged-by-a-human. */
export const OWNER_LABEL = "safe:human";

/** The repo owner's GitHub handle (the sole code owner in .github/CODEOWNERS). */
export const OWNER_HANDLE = "@tonytino";
