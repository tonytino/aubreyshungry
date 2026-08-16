#!/usr/bin/env node

/**
 * Current UTC ISO week — the zero-dependency helper behind the plan-reminder
 * workflow (.github/workflows/plan-reminder.yml). It computes the ISO 8601
 * week identifier (`YYYY-Www`) so the workflow can check whether
 * `content/weeks/<week>.json` exists. No LLM calls, no network, no deps.
 *
 * DUPLICATION NOTICE: `app/utils/iso-week.ts` is the reference TypeScript
 * implementation of ISO-week boundaries (same Jan-4 anchor). This file
 * re-implements the inverse direction (date → week) in plain ESM so the
 * workflow needs no pnpm install or TS toolchain. The two are pinned
 * together by tests/unit/iso-week-sync.test.ts — change both in sync.
 */

import { pathToFileURL } from "node:url";

const MS_PER_DAY = 86_400_000;

/**
 * ISO 8601 week identifier (`YYYY-Www`) for the UTC calendar date of `date`.
 * Uses the standard anchor: the ISO week-year of a date is the calendar year
 * of that ISO week's Thursday, and January 4 is always in week 1.
 * @param {Date} date
 * @returns {string} e.g. "2026-W34"
 */
export function isoWeekOfUtc(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new Error("isoWeekOfUtc expects a valid Date");
  }
  // Midnight UTC of the given date, then shift to the Thursday of its ISO
  // week (ISO day 1 = Monday … 7 = Sunday; Thursday = 4).
  const dayUtc = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const isoDay = new Date(dayUtc).getUTCDay() || 7;
  const thursday = new Date(dayUtc + (4 - isoDay) * MS_PER_DAY);
  const isoYear = thursday.getUTCFullYear();
  const week = Math.round((thursday.getTime() - Date.UTC(isoYear, 0, 4)) / MS_PER_DAY / 7) + 1;
  return `${isoYear}-W${String(week).padStart(2, "0")}`;
}

/**
 * The current UTC ISO week identifier.
 * @returns {string}
 */
export function currentUtcIsoWeek() {
  return isoWeekOfUtc(new Date());
}

// CLI: print the current UTC ISO week. Guarded so imports (tests) don't print.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(currentUtcIsoWeek());
}
