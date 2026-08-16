/**
 * ISO-week date helpers for the digest UI. Pure and deterministic: all math
 * is done in UTC and formatting uses fixed English month names, so server
 * render and client hydration always agree (no locale/timezone drift).
 *
 * Inputs are expected to be valid `YYYY-Www` identifiers — routes validate
 * with `IsoWeekSchema` before calling. Malformed input throws.
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

function parseIsoWeek(isoWeek: string): { year: number; week: number } {
  const match = /^(\d{4})-W(\d{2})$/.exec(isoWeek);
  if (match === null) {
    throw new Error(`invalid ISO week identifier: "${isoWeek}"`);
  }
  return { year: Number(match[1]), week: Number(match[2]) };
}

/**
 * UTC date of the Monday starting the given ISO week. Uses the standard
 * anchor: January 4 is always in ISO week 1 of its year.
 */
export function isoWeekStartDate(isoWeek: string): Date {
  const { year, week } = parseIsoWeek(isoWeek);
  const jan4 = Date.UTC(year, 0, 4);
  // getUTCDay(): 0 = Sunday … 6 = Saturday → ISO 1 = Monday … 7 = Sunday.
  const jan4IsoDay = new Date(jan4).getUTCDay() || 7;
  const week1Monday = jan4 - (jan4IsoDay - 1) * MS_PER_DAY;
  return new Date(week1Monday + (week - 1) * 7 * MS_PER_DAY);
}

function formatMonthDay(date: Date): string {
  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}`;
}

/**
 * Human date range covered by an ISO week (Monday–Sunday), e.g.
 * `"Aug 10–16, 2026"`, `"Aug 31 – Sep 6, 2026"`, or across a year boundary
 * `"Dec 29, 2025 – Jan 4, 2026"`.
 */
export function formatIsoWeekRange(isoWeek: string): string {
  const start = isoWeekStartDate(isoWeek);
  const end = new Date(start.getTime() + 6 * MS_PER_DAY);

  if (start.getUTCFullYear() !== end.getUTCFullYear()) {
    return `${formatMonthDay(start)}, ${start.getUTCFullYear()} – ${formatMonthDay(end)}, ${end.getUTCFullYear()}`;
  }
  if (start.getUTCMonth() !== end.getUTCMonth()) {
    return `${formatMonthDay(start)} – ${formatMonthDay(end)}, ${end.getUTCFullYear()}`;
  }
  return `${formatMonthDay(start)}–${end.getUTCDate()}, ${end.getUTCFullYear()}`;
}

/** Human title for an ISO week, e.g. `"Week 33, 2026"`. */
export function isoWeekLabel(isoWeek: string): string {
  const { year, week } = parseIsoWeek(isoWeek);
  return `Week ${week}, ${year}`;
}
