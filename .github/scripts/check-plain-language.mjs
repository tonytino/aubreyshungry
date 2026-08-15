#!/usr/bin/env node

// Called by the `plain-language` job in .github/workflows/pr-conventions.yml.
//
// An ASD-STE100-INSPIRED plain-language checker — deliberately NOT a claim of
// STE-100 conformance. The real specification's dictionary (approved words and
// meanings) is licensed by ASD and cannot be embedded here, and true
// conformance needs semantic judgment no regex has. What this enforces is the
// mechanical subset of STE's writing rules that a linter CAN check:
//
//   R1 sentence-length  — max 25 words per sentence (STE's descriptive limit).
//   R2 paragraph-length — max 6 sentences per paragraph.
//   R3 active-voice     — heuristic passive-voice detection (be-verb + past
//                         participle). Heuristic: expect some false positives.
//   R4 simpler-word     — a small, self-authored substitution list in the
//                         spirit of STE's one-word-one-meaning rule
//                         (e.g. "utilize" → "use"). NOT the STE dictionary.
//
// Two severities, one scope rule:
//   STRICT   — the `## TL;DR` section of the PR body (located with the same
//              parser as check-tldr-block.mjs so the two gates can never
//              disagree about what the TL;DR is). Findings here fail the job:
//              the TL;DR exists to be plain language, and it is 1–3 sentences,
//              so fixing it is always cheap.
//   ADVISORY — everything else: the rest of the PR body, changed Markdown
//              files, and comments extracted from changed source files
//              (.ts/.tsx/.mjs). Findings are emitted as ::warning annotations
//              and never fail the job — heuristics over technical prose are
//              too noisy to block on, and retrofitting every existing doc is
//              not this gate's job.
//
// Out of scope, on purpose: PR *comments* (CI checks run before comments
// exist — nothing to gate), and generated/lock files.
//
// Inputs: PR_BODY (env) — the PR description; BASE_SHA (env, optional) — when
// set, changed files are computed with `git diff --name-only BASE_SHA HEAD`
// and scanned in advisory mode. Both read from env, never argv, so hostile
// content cannot inject into the calling shell (same pattern as the sibling
// check-* scripts).

import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import { extractTldrSection } from "./check-tldr-block.mjs";

const MAX_SENTENCE_WORDS = 25;
const MAX_PARAGRAPH_SENTENCES = 6;
const MAX_ADVISORY_ANNOTATIONS = 50;

const REMEDY =
  "Rewrite the flagged TL;DR sentences in plain language: max 25 words per " +
  "sentence, active voice, simple words. This is an STE-inspired check, not " +
  "ASD-STE100 conformance — see .github/scripts/check-plain-language.mjs.";

// R4: STE-inspired substitutions. Self-authored (the STE dictionary is
// licensed); multi-word phrases first so they win over single-word matches.
const SIMPLER_WORDS = [
  ["in order to", "to"],
  ["prior to", "before"],
  ["subsequent to", "after"],
  ["utilize", "use"],
  ["utilise", "use"],
  ["commence", "start"],
  ["approximately", "about"],
  ["sufficient", "enough"],
  ["facilitate", "help"],
  ["initiate", "start"],
  ["ascertain", "find out"],
  ["endeavor", "try"],
  ["endeavour", "try"],
  ["leverage", "use"],
];

// R3: be-verb + participle. The exception list holds participles that usually
// act as plain adjectives after "be" (not passive constructions).
const PASSIVE_RE =
  /\b(am|is|are|was|were|be|been|being)\s+(\w{3,}ed|\w{2,}en|built|done|found|given|held|kept|known|made|put|read|run|sent|set|shown|told|written)\b/gi;
const PASSIVE_EXCEPTIONS = new Set([
  "tired",
  "interested",
  "excited",
  "worried",
  "pleased",
  "open",
  "green",
  "even",
  "often",
]);

// Common abbreviations that end with "." but do not end a sentence.
const ABBREVIATIONS = /\b(e\.g|i\.e|vs|etc|no|approx)\.$/i;

/**
 * Reduce markdown to plain prose for counting: inline code and URLs become
 * single tokens, emphasis markers vanish, list bullets are stripped.
 *
 * @param {string} text
 * @returns {string}
 */
export function stripMarkdown(text) {
  return text
    .replace(/`[^`]*`/g, "CODE")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "IMAGE")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "URL")
    .replace(/[*_~]/g, "")
    .replace(/^\s*(?:[-+*]|\d+[.)])\s+/gm, "")
    .replace(/^\s*>\s?/gm, "");
}

/**
 * Split prose into sentences. Naive by design: terminal punctuation followed
 * by whitespace ends a sentence, except after known abbreviations. A block
 * with no terminal punctuation is one sentence (so a long bullet fragment
 * still gets a length check).
 *
 * @param {string} prose
 * @returns {string[]}
 */
export function splitSentences(prose) {
  const out = [];
  let current = "";
  for (const token of prose.split(/(\s+)/)) {
    current += token;
    if (/[.!?]["')\]]?$/.test(token.trim()) && !ABBREVIATIONS.test(token.trim())) {
      if (current.trim()) out.push(current.trim());
      current = "";
    }
  }
  if (current.trim()) out.push(current.trim());
  return out;
}

/**
 * Count the words of one sentence (post-stripMarkdown tokens count as one
 * word each, which is the point — a code span is one unit of reading).
 *
 * @param {string} sentence
 * @returns {number}
 */
export function wordCount(sentence) {
  return sentence.split(/\s+/).filter(Boolean).length;
}

/**
 * @typedef {{ rule: string, message: string, excerpt: string, line: number }} Finding
 */

/**
 * Run rules R1–R4 over a block of markdown prose.
 *
 * @param {string} text - markdown source.
 * @param {{ paragraphRule?: boolean, startLine?: number }} [opts]
 * @returns {Finding[]}
 */
export function lintProse(text, opts = {}) {
  const { paragraphRule = true, startLine = 1 } = opts;
  /** @type {Finding[]} */
  const findings = [];

  // Walk line-by-line so findings carry line numbers; skip fenced code blocks,
  // headings, and tables. Group consecutive prose lines into paragraphs.
  const lines = text.split(/\r?\n/);
  let inFence = false;
  /** @type {{ text: string, line: number }[]} */
  const paragraphs = [];
  /** @type {{ text: string, line: number } | null} */
  let para = null;

  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (/^(```|~~~)/.test(line)) {
      inFence = !inFence;
      para = null;
      return;
    }
    const isProse =
      !inFence &&
      line !== "" &&
      !/^#{1,6}\s/.test(line) &&
      !/^\|/.test(line) &&
      !/^<!--/.test(line);
    if (!isProse) {
      para = null;
      return;
    }
    if (para === null) {
      para = { text: line, line: startLine + i };
      paragraphs.push(para);
    } else {
      para.text += ` ${line}`;
    }
  });

  for (const p of paragraphs) {
    const prose = stripMarkdown(p.text);
    const sentences = splitSentences(prose);

    if (paragraphRule && sentences.length > MAX_PARAGRAPH_SENTENCES) {
      findings.push({
        rule: "R2 paragraph-length",
        message: `Paragraph has ${sentences.length} sentences (max ${MAX_PARAGRAPH_SENTENCES}). Split it.`,
        excerpt: `${prose.slice(0, 60)}…`,
        line: p.line,
      });
    }

    for (const sentence of sentences) {
      const words = wordCount(sentence);
      if (words > MAX_SENTENCE_WORDS) {
        findings.push({
          rule: "R1 sentence-length",
          message: `Sentence has ${words} words (max ${MAX_SENTENCE_WORDS}). Split it.`,
          excerpt: `${sentence.slice(0, 60)}…`,
          line: p.line,
        });
      }

      for (const match of sentence.matchAll(PASSIVE_RE)) {
        if (!PASSIVE_EXCEPTIONS.has(match[2].toLowerCase())) {
          findings.push({
            rule: "R3 active-voice",
            message: `Possible passive voice: "${match[0]}". Prefer the active form (heuristic — ignore if wrong).`,
            excerpt: `${sentence.slice(0, 60)}…`,
            line: p.line,
          });
        }
      }

      for (const [complex, simple] of SIMPLER_WORDS) {
        if (new RegExp(`\\b${complex}\\b`, "i").test(sentence)) {
          findings.push({
            rule: "R4 simpler-word",
            message: `Use "${simple}" instead of "${complex}".`,
            excerpt: `${sentence.slice(0, 60)}…`,
            line: p.line,
          });
        }
      }
    }
  }

  return findings;
}

/**
 * Extract comment text from a JS/TS source file: `//` line comments (leading
 * doc-syntax stripped) and `/*`-style blocks. Only R1 and R4 make sense for
 * code comments (fragments are normal there), so callers lint the result with
 * paragraphRule disabled and the caller filters R3.
 *
 * @param {string} source
 * @returns {{ text: string, line: number }[]}
 */
export function extractComments(source) {
  /** @type {{ text: string, line: number }[]} */
  const comments = [];
  const lines = source.split(/\r?\n/);
  let block = null;
  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (block !== null) {
      const end = line.indexOf("*/");
      const body = (end === -1 ? line : line.slice(0, end)).replace(/^\*\s?/, "");
      if (body.trim()) block.text += ` ${body.trim()}`;
      if (end !== -1) {
        comments.push(block);
        block = null;
      }
      return;
    }
    const blockStart = line.match(/\/\*+\s?(.*)$/);
    if (blockStart && !line.includes("*/")) {
      block = { text: blockStart[1].trim(), line: i + 1 };
      return;
    }
    const inline = line.match(/(?:^|\s)\/\/\s?(.*)$/);
    if (inline?.[1]?.trim()) {
      comments.push({ text: inline[1].trim(), line: i + 1 });
    }
  });
  return comments;
}

/**
 * @param {Finding} f
 * @param {string} where
 * @returns {string}
 */
function format(f, where) {
  return `[${f.rule}] ${where}:${f.line} — ${f.message} ("${f.excerpt}")`;
}

function main() {
  const body = process.env.PR_BODY ?? "";
  const baseSha = process.env.BASE_SHA ?? "";
  /** @type {string[]} */
  const strictFailures = [];
  /** @type {string[]} */
  const advisories = [];

  // STRICT: the TL;DR section (paragraph rule off — it is meant to be short).
  const tldr = extractTldrSection(body);
  if (tldr.found) {
    for (const f of lintProse(tldr.section, { paragraphRule: false })) {
      strictFailures.push(format(f, "PR body ## TL;DR"));
    }
  }

  // ADVISORY: the rest of the PR body.
  for (const f of lintProse(body)) {
    advisories.push(format(f, "PR body"));
  }

  // ADVISORY: changed markdown + source-file comments.
  if (baseSha) {
    let changed = [];
    try {
      changed = execFileSync("git", ["diff", "--name-only", baseSha, "HEAD"], {
        encoding: "utf-8",
      })
        .split("\n")
        .filter(Boolean);
    } catch {
      console.log("::notice::plain-language: could not diff against BASE_SHA; skipping file scan.");
    }
    for (const file of changed) {
      if (!fs.existsSync(file) || file.includes("lock")) continue;
      const content = fs.readFileSync(file, "utf-8");
      if (file.endsWith(".md")) {
        for (const f of lintProse(content)) advisories.push(format(f, file));
      } else if (/\.(ts|tsx|mjs)$/.test(file)) {
        for (const c of extractComments(content)) {
          for (const f of lintProse(c.text, { paragraphRule: false, startLine: c.line })) {
            if (f.rule !== "R3 active-voice") advisories.push(format(f, file));
          }
        }
      }
    }
  }

  for (const a of advisories.slice(0, MAX_ADVISORY_ANNOTATIONS)) {
    console.log(`::warning::plain-language (advisory): ${a}`);
  }
  if (advisories.length > MAX_ADVISORY_ANNOTATIONS) {
    console.log(
      `::warning::plain-language: ${advisories.length - MAX_ADVISORY_ANNOTATIONS} more advisory finding(s) suppressed.`
    );
  }

  if (strictFailures.length > 0) {
    for (const s of strictFailures) console.error(`::error::plain-language (strict): ${s}`);
    console.error(`::error::${REMEDY}`);
    process.exit(1);
  }
  console.log(
    `✓ TL;DR passes the plain-language rules (${advisories.length} advisory finding(s) elsewhere).`
  );
}

if (process.argv[1]?.endsWith("check-plain-language.mjs")) {
  main();
}
