/**
 * Dates the guided check shows, as general rules only: the 180-day investment
 * window (IRC § 1400Z-2(a)(1)(A)) and when the 2027 rules begin. Some gains
 * start their window on a different date; the check says an adviser should
 * confirm.
 */

const DAY = 86_400_000;

/** January 1, 2027 (UTC): investments from this date fall under the rules as amended in 2025. */
export const NEW_RULES_START = Date.UTC(2027, 0, 1);

/** 180 days after a sale date given as YYYY-MM-DD, as UTC milliseconds; null if not a valid date. */
export function windowEnd(saleDate: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(saleDate)) return null;
  const t = Date.parse(`${saleDate}T00:00:00Z`);
  return Number.isFinite(t) ? t + 180 * DAY : null;
}

export function longDate(ms: number): string {
  return new Date(ms).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
}
