/**
 * Week-date helpers for the digest UI. Pure and deterministic: all math is
 * done in UTC and formatting uses fixed English month names, so server
 * render and client hydration always agree (no locale/timezone drift).
 *
 * A week runs Sunday→Saturday and is identified by its starting Sunday's
 * date (`YYYY-MM-DD`) — see `WeekStartSchema` in `app/content/schema.ts`.
 * Inputs are expected to be valid identifiers: routes validate with that
 * schema before calling. Malformed input throws.
 */

const MS_PER_DAY = 86_400_000;

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/**
 * UTC midnight of the Sunday that starts the given week.
 *
 * Throws on anything that isn't a real `YYYY-MM-DD` calendar date falling on
 * a Sunday. The Sunday check is repeated here (the schema already enforces
 * it) because every output below describes a Sun–Sat span: given a Monday,
 * this module would silently render a plausible but wrong window rather than
 * fail. A loud throw beats a quiet lie about what someone is eating.
 */
export function weekStartDate(weekStart: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(weekStart);
  if (match === null) {
    throw new Error(`invalid week identifier: "${weekStart}" (expected YYYY-MM-DD)`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  // Date.UTC rolls impossible dates over (Feb 30 → Mar 2); round-tripping
  // the parts is the only way to catch that.
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error(`invalid week identifier: "${weekStart}" is not a real calendar date`);
  }
  if (date.getUTCDay() !== 0) {
    throw new Error(`invalid week identifier: "${weekStart}" is not a Sunday`);
  }
  return date;
}

function formatMonthDay(date: Date): string {
  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}`;
}

/**
 * Human date range covered by a week (Sunday–Saturday), e.g.
 * `"Aug 16–22, 2026"`, `"Aug 30 – Sep 5, 2026"`, or across a year boundary
 * `"Dec 27, 2026 – Jan 2, 2027"`.
 */
export function formatWeekRange(weekStart: string): string {
  const start = weekStartDate(weekStart);
  const end = new Date(start.getTime() + 6 * MS_PER_DAY);

  if (start.getUTCFullYear() !== end.getUTCFullYear()) {
    return `${formatMonthDay(start)}, ${start.getUTCFullYear()} – ${formatMonthDay(end)}, ${end.getUTCFullYear()}`;
  }
  if (start.getUTCMonth() !== end.getUTCMonth()) {
    return `${formatMonthDay(start)} – ${formatMonthDay(end)}, ${end.getUTCFullYear()}`;
  }
  return `${formatMonthDay(start)}–${end.getUTCDate()}, ${end.getUTCFullYear()}`;
}

/**
 * Human title for a week, e.g. `"Week of Aug 16, 2026"` — named by the
 * Sunday it starts on, which is the only thing the identifier means now.
 */
export function weekLabel(weekStart: string): string {
  const start = weekStartDate(weekStart);
  return `Week of ${formatMonthDay(start)}, ${start.getUTCFullYear()}`;
}
