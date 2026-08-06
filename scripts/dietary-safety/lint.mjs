#!/usr/bin/env node

/**
 * Forbidden-ingredient dietary-safety linter — the deterministic CI gate for
 * the golden rules in `docs/agents/dietary-safety.md`:
 *
 *   1. 100% gluten-free — no gluten grain or derivative, ever.
 *   2. Absolutely no cashews or pistachios — life-threatening allergy.
 *
 * It scans food-content files (JSON and Markdown/prose) for the forbidden
 * terms defined in `scripts/dietary-safety/terms.mjs` and exits non-zero on
 * any hit. Matching is case-insensitive and word-boundary-aware; known-safe
 * phrases (ALLOWLIST, e.g. "buckwheat", "certified gluten-free oats") are
 * masked out of the text before forbidden matching runs.
 *
 * Usage:
 *   node scripts/dietary-safety/lint.mjs [glob ...]   # default globs below
 *   pnpm lint:dietary
 *
 * Globs are resolved against the current working directory. When no matching
 * files exist (e.g. `content/` hasn't been created yet), the linter exits 0
 * with a "nothing to scan" note — absence of content is not a violation.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import { ALLOWLIST, RULE_SETS } from "./terms.mjs";

/** Default scan targets: all food content, plus any food-content fixtures. */
export const DEFAULT_GLOBS = [
  "content/**/*.json",
  "content/**/*.md",
  "**/fixtures/**/*.json",
  "**/fixtures/**/*.md",
];

/** Directories never worth walking (build output, deps, VCS). */
const IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  ".claude",
  ".vinxi",
  ".output",
  "dist",
  "coverage",
  "playwright-report",
  "test-results",
]);

/**
 * One forbidden-term hit.
 * @typedef {Object} Finding
 * @property {string} file Path relative to the scan root.
 * @property {string} location `line N` for prose, or a JSON path like `$.a[0].b`.
 * @property {string} matched The exact text that matched.
 * @property {string} label Human label from the term list.
 * @property {string} rule Which golden rule the hit violates.
 * @property {string | undefined} substitute Suggested safe substitute, if any.
 */

/**
 * Translate a minimal glob (`**`, `*`, `?`, `{a,b}`) into a RegExp matched
 * against `/`-separated paths relative to the scan root.
 * @param {string} glob
 * @returns {RegExp}
 */
export function globToRegExp(glob) {
  let out = "";
  let i = 0;
  while (i < glob.length) {
    const ch = glob[i];
    if (ch === "*") {
      if (glob[i + 1] === "*") {
        // `**/` matches zero or more directories; bare `**` matches anything.
        if (glob[i + 2] === "/") {
          out += "(?:.*/)?";
          i += 3;
        } else {
          out += ".*";
          i += 2;
        }
      } else {
        out += "[^/]*";
        i += 1;
      }
    } else if (ch === "?") {
      out += "[^/]";
      i += 1;
    } else if (ch === "{") {
      const end = glob.indexOf("}", i);
      if (end === -1) {
        out += "\\{";
        i += 1;
      } else {
        const alternatives = glob
          .slice(i + 1, end)
          .split(",")
          .map((alt) => alt.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
        out += `(?:${alternatives.join("|")})`;
        i = end + 1;
      }
    } else {
      out += ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      i += 1;
    }
  }
  return new RegExp(`^${out}$`);
}

/**
 * Walk `root` and return files (relative, `/`-separated) matching any glob.
 * @param {string} root Absolute directory to scan.
 * @param {string[]} globs
 * @returns {string[]} Sorted relative paths.
 */
export function collectFiles(root, globs) {
  const regexps = globs.map(globToRegExp);
  /** @type {string[]} */
  const matches = [];
  /** @param {string} dir */
  const walk = (dir) => {
    /** @type {fs.Dirent[]} */
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return; // Unreadable or vanished directory — nothing to scan there.
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".") && entry.name !== ".") continue;
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name)) walk(absolute);
      } else if (entry.isFile()) {
        const relative = path.relative(root, absolute).split(path.sep).join("/");
        if (regexps.some((re) => re.test(relative))) matches.push(relative);
      }
    }
  };
  walk(root);
  return matches.sort();
}

/**
 * Mask every allowlisted phrase in `text` with spaces (same length, so
 * offsets and line numbers stay accurate), then return the masked text.
 * Every pattern is matched against the ORIGINAL text and the union of all
 * spans is masked, so overlapping allowlist entries (e.g. "gluten-free"
 * inside "certified gluten-free oats") never shadow each other.
 * @param {string} text
 * @returns {string}
 */
export function maskAllowlisted(text) {
  /** @type {{ start: number, end: number }[]} */
  const spans = [];
  for (const pattern of ALLOWLIST) {
    for (const match of text.matchAll(pattern)) {
      if (match.index === undefined) continue;
      spans.push({ start: match.index, end: match.index + match[0].length });
    }
  }
  if (spans.length === 0) return text;
  const chars = text.split("");
  for (const { start, end } of spans) {
    for (let i = start; i < end; i++) chars[i] = " ";
  }
  return chars.join("");
}

/**
 * Scan a chunk of text for forbidden terms. Allowlisted phrases are masked
 * first; each forbidden match is masked before later (more general) entries
 * run, so overlapping terms report once, with the most specific label.
 * @param {string} text
 * @returns {{ index: number, matched: string, label: string, rule: string, substitute: string | undefined }[]}
 */
export function scanText(text) {
  let working = maskAllowlisted(text);
  /** @type {{ index: number, matched: string, label: string, rule: string, substitute: string | undefined }[]} */
  const hits = [];
  for (const { rule, terms } of RULE_SETS) {
    for (const { pattern, label, substitute } of terms) {
      /** @type {{ index: number, length: number }[]} */
      const spans = [];
      for (const match of working.matchAll(pattern)) {
        if (match.index === undefined) continue;
        hits.push({ index: match.index, matched: match[0], label, rule, substitute });
        spans.push({ index: match.index, length: match[0].length });
      }
      for (const { index, length } of spans) {
        working = working.slice(0, index) + " ".repeat(length) + working.slice(index + length);
      }
    }
  }
  return hits.sort((a, b) => a.index - b.index);
}

/**
 * Scan prose (Markdown or any plain text), reporting line numbers.
 * @param {string} file Relative path, used in findings.
 * @param {string} text
 * @returns {Finding[]}
 */
export function scanProse(file, text) {
  // Precompute line-start offsets to map a match index to a 1-based line.
  const lineStarts = [0];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "\n") lineStarts.push(i + 1);
  }
  /** @param {number} index */
  const lineOf = (index) => {
    let low = 0;
    let high = lineStarts.length - 1;
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      if (lineStarts[mid] <= index) low = mid;
      else high = mid - 1;
    }
    return low + 1;
  };
  return scanText(text).map(({ index, matched, label, rule, substitute }) => ({
    file,
    location: `line ${lineOf(index)}`,
    matched,
    label,
    rule,
    substitute,
  }));
}

/**
 * Recursively scan a parsed JSON value — string values AND object keys, so an
 * ingredient used as a map key is still caught. Locations are JSON paths.
 * @param {string} file Relative path, used in findings.
 * @param {unknown} value
 * @param {string} jsonPath
 * @param {Finding[]} findings
 */
function scanJsonValue(file, value, jsonPath, findings) {
  /** @param {string} text @param {string} where */
  const scanString = (text, where) => {
    for (const { matched, label, rule, substitute } of scanText(text)) {
      findings.push({ file, location: where, matched, label, rule, substitute });
    }
  };
  if (typeof value === "string") {
    scanString(value, jsonPath);
  } else if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      scanJsonValue(file, value[i], `${jsonPath}[${i}]`, findings);
    }
  } else if (value !== null && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      scanString(key, `${jsonPath}.${key} (key)`);
      scanJsonValue(file, child, `${jsonPath}.${key}`, findings);
    }
  }
}

/**
 * Scan one file. `.json` files are scanned structurally (JSON paths in the
 * output); anything else — and JSON that fails to parse — is scanned as prose
 * so no text ever escapes the gate.
 * @param {string} root Absolute scan root.
 * @param {string} file Relative path from `root`.
 * @returns {Finding[]}
 */
export function scanFile(root, file) {
  const text = fs.readFileSync(path.join(root, file), "utf-8");
  if (file.endsWith(".json")) {
    try {
      const parsed = JSON.parse(text);
      /** @type {Finding[]} */
      const findings = [];
      scanJsonValue(file, parsed, "$", findings);
      return findings;
    } catch {
      // Malformed JSON still gets scanned — fall through to prose mode.
    }
  }
  return scanProse(file, text);
}

/**
 * Run the linter over `root` with the given globs.
 * @param {string} root Absolute directory to scan.
 * @param {string[]} [globs]
 * @returns {{ files: string[], findings: Finding[] }}
 */
export function lint(root, globs = DEFAULT_GLOBS) {
  const files = collectFiles(root, globs);
  /** @type {Finding[]} */
  const findings = [];
  for (const file of files) {
    findings.push(...scanFile(root, file));
  }
  return { files, findings };
}

/**
 * Render one finding as a failure line.
 * @param {Finding} finding
 * @returns {string}
 */
export function formatFinding(finding) {
  const { file, location, matched, label, rule, substitute } = finding;
  const fix = substitute ? ` Substitute: ${substitute}.` : "";
  return `  ✗ ${file} (${location}): "${matched}" — ${label}. Violates ${rule}.${fix}`;
}

/**
 * CLI entry. Exits 0 when nothing to scan or no hits; 1 on any hit.
 * @param {string[]} argv Glob arguments (empty → DEFAULT_GLOBS).
 */
function main(argv) {
  const globs = argv.length > 0 ? argv : DEFAULT_GLOBS;
  const root = process.cwd();
  const { files, findings } = lint(root, globs);

  if (files.length === 0) {
    console.log(
      `Dietary safety linter: no content found matching [${globs.join(", ")}] — nothing to scan.`
    );
    return;
  }

  if (findings.length === 0) {
    console.log(
      `✓ Dietary safety linter: ${files.length} file(s) scanned, no forbidden ingredients found.`
    );
    return;
  }

  console.error(
    `Dietary safety linter: ${findings.length} forbidden-ingredient hit(s) in ${files.length} scanned file(s):\n`
  );
  for (const finding of findings) {
    console.error(formatFinding(finding));
  }
  console.error(
    "\nThese violate the golden rules in docs/agents/dietary-safety.md (100% gluten-free;" +
      "\nabsolutely no cashews/pistachios — life-threatening allergy). Remove or substitute" +
      "\nevery flagged ingredient. If a hit is a genuine false positive, the ALLOWLIST in" +
      "\nscripts/dietary-safety/terms.mjs is owner-gated (safe:human) — ask @tonytino."
  );
  process.exitCode = 1;
}

// Dispatch only when run directly, so the helpers stay importable in tests.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2));
}
