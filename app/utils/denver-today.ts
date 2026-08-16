/**
 * ⚠️ IMPURE AND TIMEZONE-AWARE — the deliberate opposite of
 * `app/utils/week-dates.ts`, which is pure, UTC-only, and safe to call from
 * a component. This module reads the clock and applies a named timezone, so
 * two calls can return different answers and a server and a client can
 * disagree. It lives in its own file precisely so that impurity is visible
 * at the import site rather than hidden among the pure formatters.
 *
 * RULE: call this ONLY in a loader or server function — never during
 * component render. The digest UI renders "the current week", and if the
 * current week were resolved during render, a server in UTC and a browser in
 * another timezone (or either side crossing Denver midnight between render
 * and hydration) would pick different weeks and React would throw a
 * hydration mismatch. Resolve once on the server, pass the chosen week down
 * as data, and the components stay pure.
 *
 * WHY Denver: the household the plans are for lives on Mountain Time, and a
 * planning week rolls over at midnight THERE. Resolving in UTC would show
 * next week's menu for the last 6-7 hours of every Saturday, while the
 * household is still cooking the current week.
 */

/**
 * The wall-clock calendar date in America/Denver, as `YYYY-MM-DD`.
 *
 * `Intl.DateTimeFormat` with a `timeZone` is built into Node and every
 * browser, needs no dependency, and applies the MDT/MST offset in effect on
 * that date — so DST transitions need no special handling here. The parts
 * are read individually rather than parsing a formatted string, so no
 * locale's date layout can change the result.
 *
 * `now` is injectable so tests can pin an instant; production callers pass
 * nothing.
 */
export function denverToday(now: Date = new Date()): string {
  if (Number.isNaN(now.getTime())) {
    throw new Error("denverToday expects a valid Date");
  }
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Denver",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);

  const byType: Record<string, string> = {};
  for (const part of parts) {
    byType[part.type] = part.value;
  }
  const { year, month, day } = byType;
  if (year === undefined || month === undefined || day === undefined) {
    throw new Error("denverToday could not resolve a date from Intl.DateTimeFormat");
  }
  return `${year}-${month}-${day}`;
}
