/** Shared by server enforcement and the account UI. No browser-supplied counters are trusted. */
export const EXPORT_ROW_LIMIT = 500;
export const EXPORT_ALLOWANCES = [
  { key: "daily-exports", label: "Exports", period: "24 hours", action: "exports", limit: 3, window: 86_400_000 },
  { key: "daily-rows", label: "Tract rows", period: "24 hours", action: "export-rows", limit: 1000, window: 86_400_000 },
  { key: "monthly-exports", label: "Exports", period: "30 days", action: "exports", limit: 10, window: 30 * 86_400_000 },
  { key: "monthly-rows", label: "Tract rows", period: "30 days", action: "export-rows", limit: 5000, window: 30 * 86_400_000 },
] as const;
export type UsageEvent = { action: string; at: number; amount: number };
export function summarizeAllowance(account: UsageEvent[], browser: UsageEvent[], now: number) {
  return EXPORT_ALLOWANCES.map((rule) => {
    const events = (usage: UsageEvent[]) => usage.filter((event) => event.action === rule.action && event.at > now - rule.window && event.at <= now);
    const accountEvents = events(account), browserEvents = events(browser);
    const total = (usage: UsageEvent[]) => usage.reduce((sum, event) => sum + event.amount, 0);
    const accountUsed = total(accountEvents), browserUsed = total(browserEvents);
    const used = Math.max(accountUsed, browserUsed);
    const limitingEvents = accountUsed >= browserUsed ? accountEvents : browserEvents;
    const nextReleaseAt = limitingEvents.length ? Math.min(...limitingEvents.filter((event) => event.amount > 0).map((event) => event.at + rule.window)) : null;
    return { ...rule, used, accountUsed, browserUsed, remaining: Math.max(0, rule.limit - used), nextReleaseAt: nextReleaseAt != null && Number.isFinite(nextReleaseAt) ? nextReleaseAt : null };
  });
}
export type AllowanceSummary = ReturnType<typeof summarizeAllowance>;
