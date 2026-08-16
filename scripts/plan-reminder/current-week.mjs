#!/usr/bin/env node

/**
 * Week identifiers relative to "now" — the zero-dependency helper behind the
 * plan-reminder workflow (.github/workflows/plan-reminder.yml). A week runs
 * Sunday→Saturday and is named by its starting Sunday's date
 * (`YYYY-MM-DD`), so the workflow can check whether
 * `content/weeks/<weekStart>.json` exists. No LLM calls, no network, no deps.
 *
 * It also serves the owner-local generation skill as a portable replacement
 * for `date -u -d "<date> +7 days" +%F`. Relative-date parsing via `-d` is a
 * GNU coreutils extension: on BSD/macOS `date`, `-d` means "set daylight
 * saving time", so the argument is SWALLOWED and the command cheerfully
 * prints today's date instead of failing. ADR-007 runs the skill in the
 * owner's local session — very plausibly macOS — which would let the skill's
 * Sunday-confirmation guard pass while confirming nothing. `--from`/`--plus`
 * removes that trap: same Node the rest of the repo already requires, same
 * answer on every platform, and a non-Sunday `--from` is a hard failure.
 *
 * The workflow asks for the UPCOMING week (`--next`), not the current one:
 * the reminder fires on Thursday, by which point the current week is 5/7
 * spent and nagging about it buys nothing. The week worth chasing on a
 * Thursday is the one starting the coming Sunday, which is what the
 * before-weekend-shopping cadence exists for.
 *
 * "Today" is resolved in America/Denver, not UTC. GitHub Actions runners run
 * on UTC clocks, and the reminder fires at 12:00 UTC — but the household the
 * plan is for lives on Mountain Time, and the week rolls over at midnight
 * THERE. Resolving in UTC would name the wrong week for every instant
 * between Denver midnight and UTC midnight (i.e. the last 6-7 hours of each
 * Saturday, exactly when the next week's plan is being chased).
 * `Intl.DateTimeFormat` with a `timeZone` is built into Node, needs no
 * dependency, and applies the MDT/MST offset in effect on that date — so DST
 * transitions need no special handling here.
 *
 * DUPLICATION NOTICE: `app/utils/week-dates.ts` is the reference TypeScript
 * implementation of week boundaries (identifier → the Sunday's UTC date).
 * This file re-implements the inverse direction (instant → identifier) in
 * plain ESM so the workflow needs no pnpm install or TS toolchain. The two
 * are pinned together by tests/unit/week-start-sync.test.ts — change both in
 * sync.
 */

import { pathToFileURL } from "node:url";

const MS_PER_DAY = 86_400_000;

/**
 * The wall-clock calendar date in America/Denver at the given instant, as
 * `{ year, month, day }` numbers. Formatted part-by-part rather than parsing
 * a formatted string, so no locale's date layout can change the result.
 * @param {Date} instant
 * @returns {{ year: number, month: number, day: number }}
 */
function denverCalendarDate(instant) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Denver",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  /** @type {Record<string, string>} */
  const byType = {};
  for (const part of parts) {
    byType[part.type] = part.value;
  }
  return { year: Number(byType.year), month: Number(byType.month), day: Number(byType.day) };
}

/**
 * Week identifier (`YYYY-MM-DD` of the starting Sunday) for the Denver
 * calendar date of `instant`.
 *
 * The Denver date is re-anchored to UTC midnight before the weekday math, so
 * the arithmetic is plain integer day-stepping on a fixed-length day — no
 * 23- or 25-hour DST day can shift the result.
 * @param {Date} instant
 * @returns {string} e.g. "2026-08-16"
 */
export function weekStartOf(instant) {
  if (!(instant instanceof Date) || Number.isNaN(instant.getTime())) {
    throw new Error("weekStartOf expects a valid Date");
  }
  const { year, month, day } = denverCalendarDate(instant);
  const dayUtc = Date.UTC(year, month - 1, day);
  // getUTCDay(): 0 = Sunday … 6 = Saturday — step back to this week's Sunday.
  return formatUtcDate(new Date(dayUtc - new Date(dayUtc).getUTCDay() * MS_PER_DAY));
}

/**
 * `YYYY-MM-DD` for a Date's UTC calendar day.
 * @param {Date} date
 * @returns {string}
 */
function formatUtcDate(date) {
  const yyyy = String(date.getUTCFullYear()).padStart(4, "0");
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * The current week's identifier, with "now" resolved in America/Denver.
 * @param {Date} [now]
 * @returns {string}
 */
export function currentWeekStart(now = new Date()) {
  return weekStartOf(now);
}

/** Weekday names indexed by `Date.getUTCDay()` — 0 = Sunday. */
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * Parse a week identifier into its UTC-midnight Date, rejecting anything
 * that is not a real calendar date falling on a Sunday. The thrown messages
 * are the user-facing output of `--from`, so they name the actual weekday:
 * this one call is meant to double as the skill's Sunday assertion.
 * @param {string} value
 * @returns {Date}
 */
function parseWeekStart(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match === null) {
    throw new Error(`"${value}" is not a date in YYYY-MM-DD form`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  // Date.UTC rolls impossible dates over (Feb 30 → Mar 2), so round-trip the
  // parts — otherwise a typo'd date would silently become a different one.
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error(`"${value}" is not a real calendar date`);
  }
  if (date.getUTCDay() !== 0) {
    throw new Error(
      `a week must start on a Sunday, but ${value} is a ${WEEKDAYS[date.getUTCDay()]}`
    );
  }
  return date;
}

/**
 * Step a week identifier by whole days, e.g. `weekStartPlus("2026-08-16", 7)`
 * → `"2026-08-23"`. Negative values step backwards; `+6` gives the week's
 * closing Saturday.
 *
 * The step is taken on the IDENTIFIER re-anchored at UTC midnight, never on
 * a local-time instant, so it is DST-free by construction: no 23- or
 * 25-hour day exists in UTC to absorb or add an hour.
 * @param {string} weekStart
 * @param {number} days
 * @returns {string}
 */
export function weekStartPlus(weekStart, days) {
  if (!Number.isInteger(days)) {
    throw new Error(`weekStartPlus expects a whole number of days, got "${days}"`);
  }
  return formatUtcDate(new Date(parseWeekStart(weekStart).getTime() + days * MS_PER_DAY));
}

/**
 * The UPCOMING week's identifier — the Sunday after the current one. This is
 * what the Thursday reminder checks (see the module header).
 * @param {Date} [now]
 * @returns {string}
 */
export function nextWeekStart(now = new Date()) {
  return weekStartPlus(currentWeekStart(now), 7);
}

const USAGE = "usage: current-week.mjs [--next | --from <YYYY-MM-DD> [--plus <days>]]";

/**
 * Resolve CLI arguments to the single identifier to print.
 *
 * Unknown arguments are a hard error rather than being ignored. A typo like
 * `--form 2026-08-16` must not silently fall through to printing the current
 * week — a command that quietly answers a different question than the one
 * asked is the exact failure mode `--from` exists to eliminate.
 * @param {string[]} args
 * @returns {string}
 */
function resolveCli(args) {
  /** @type {string | undefined} */
  let from;
  /** @type {string | undefined} */
  let plus;
  let next = false;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--next") {
      next = true;
      continue;
    }
    if (arg === "--from" || arg === "--plus") {
      const value = args[i + 1];
      // A following flag means the value was omitted. Bare "-7" is a legal
      // --plus value, so only "--" prefixes disqualify it.
      if (value === undefined || value.startsWith("--")) {
        throw new Error(`${arg} requires a value\n${USAGE}`);
      }
      if (arg === "--from") from = value;
      else plus = value;
      i += 1;
      continue;
    }
    throw new Error(`unknown argument "${arg}"\n${USAGE}`);
  }

  if (from === undefined) {
    if (plus !== undefined) {
      throw new Error(`--plus requires --from\n${USAGE}`);
    }
    return next ? nextWeekStart() : currentWeekStart();
  }
  if (next) {
    throw new Error(`--next and --from are mutually exclusive\n${USAGE}`);
  }
  // `--plus` defaults to 0 so `--from <date>` alone is a pure Sunday
  // assertion that echoes the date back.
  const days = plus === undefined ? 0 : Number(plus);
  if (!Number.isInteger(days)) {
    throw new Error(`--plus must be a whole number of days, got "${plus}"\n${USAGE}`);
  }
  return weekStartPlus(from, days);
}

// CLI: print a week identifier — `--next` for the upcoming week (what the
// reminder workflow asks for), `--from`/`--plus` for portable date math
// (see the module header), otherwise the current week. Guarded so imports
// (tests) don't print. Errors go to stderr with a non-zero exit so a caller's
// `set -e` or `&&` chain actually stops.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    console.log(resolveCli(process.argv.slice(2)));
  } catch (error) {
    console.error(`current-week.mjs: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
