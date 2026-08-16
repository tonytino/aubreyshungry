#!/usr/bin/env node

/**
 * Week identifiers relative to "now" — the zero-dependency helper behind the
 * plan-reminder workflow (.github/workflows/plan-reminder.yml). A week runs
 * Sunday→Saturday and is named by its starting Sunday's date
 * (`YYYY-MM-DD`), so the workflow can check whether
 * `content/weeks/<weekStart>.json` exists. No LLM calls, no network, no deps.
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

/**
 * The UPCOMING week's identifier — the Sunday after the current one. This is
 * what the Thursday reminder checks (see the module header).
 *
 * The step is taken on the IDENTIFIER, not on the instant: re-anchoring the
 * current Sunday at UTC midnight and adding exactly 7×24h is DST-free by
 * construction. Adding 7 days of absolute time to `now` instead would land a
 * day off whenever a DST transition falls inside the window and `now` sits
 * within an hour of Denver midnight.
 * @param {Date} [now]
 * @returns {string}
 */
export function nextWeekStart(now = new Date()) {
  const current = currentWeekStart(now);
  return formatUtcDate(new Date(Date.parse(`${current}T00:00:00Z`) + 7 * MS_PER_DAY));
}

// CLI: print a week identifier — `--next` for the upcoming week (what the
// reminder workflow asks for), otherwise the current one. Guarded so imports
// (tests) don't print.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(process.argv.includes("--next") ? nextWeekStart() : currentWeekStart());
}
