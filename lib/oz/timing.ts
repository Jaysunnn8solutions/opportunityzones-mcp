/**
 * Dates the guided check shows, as general rules only: the 180-day investment
 * window and when the 2027 rules begin (lib/content/rules.ts: window180,
 * gain2026Invested2027). Some gains start their window on a different date;
 * the check says an adviser should confirm.
 */

const DAY = 86_400_000;

/** January 1, 2027 (UTC): investments from this date fall under the rules as amended in 2025. */
export const NEW_RULES_START = Date.UTC(2027, 0, 1);

/**
 * The last day of "the 180-day period beginning on the date of such sale"
 * (26 U.S.C. § 1400Z-2(a)(1)(A)): the sale date is day 1, so the last day is
 * 179 days after it. Takes YYYY-MM-DD; returns UTC milliseconds, or null if not
 * a valid date.
 */
export function windowEnd(saleDate: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(saleDate)) return null;
  const t = Date.parse(`${saleDate}T00:00:00Z`);
  if (!Number.isFinite(t) || new Date(t).toISOString().slice(0, 10) !== saleDate) return null;
  return t + 179 * DAY;
}

export function longDate(ms: number): string {
  return new Date(ms).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
}
