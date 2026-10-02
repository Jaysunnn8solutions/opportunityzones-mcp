import { randomUUID } from "node:crypto";
import { RUNTIME_BUDGETS, type SourceId } from "@/pipeline/sources";
import { AccessError, DAY, checkBudgets, db, prune, recordBudgets, transaction } from "@/lib/access/store";

export function providerPermit(sourceId: string, leaseMs = 60_000) {
  const config = RUNTIME_BUDGETS[sourceId as SourceId];
  const configured = process.env[`OZ_SOURCE_${sourceId.toUpperCase()}_DAILY`];
  const fallback = process.env.NODE_ENV === "production" && config?.providerDaily == null ? 0 : config?.pilotDaily ?? 0;
  const daily = configured == null ? fallback : Number(configured);
  if (process.env.OZ_LIVE_PAUSED === "1" || !Number.isSafeInteger(daily) || daily <= 0) throw new AccessError("Live source is paused or awaiting an operator budget.", 503);
  const store = db(); const now = Date.now(); const lease = randomUUID();
  transaction(store, () => {
    prune(store, now);
    const cooldown = Number((store.prepare("SELECT value FROM settings WHERE key=?").get(`cooldown:${sourceId}`) as { value: string } | undefined)?.value ?? 0);
    if (cooldown > now) throw new AccessError("The source is cooling down. Published data remains available.", 429, Math.ceil((cooldown - now) / 1000));
    const leases = store.prepare("SELECT key,value FROM settings WHERE key LIKE ?").all(`lease:${sourceId}:%`) as Array<{ key: string; value: string }>;
    for (const entry of leases) if (Number(entry.value) <= now) store.prepare("DELETE FROM settings WHERE key=?").run(entry.key);
    if (leases.filter((entry) => Number(entry.value) > now).length >= 2) throw new AccessError("The source is busy. Try again shortly.", 429, 20);
    const budgets = [{ subject: `provider:${sourceId}`, action: "attempt", limit: Math.min(daily, config?.providerDaily == null ? daily : Math.floor(config.providerDaily * 0.8)), window: DAY }, { subject: `provider:${sourceId}`, action: "attempt", limit: 30, window: 60_000 }];
    checkBudgets(store, budgets, now); recordBudgets(store, budgets, now);
    store.prepare("INSERT INTO settings(key,value) VALUES(?,?)").run(`lease:${sourceId}:${lease}`, String(now + leaseMs));
  });
  return () => { store.prepare("DELETE FROM settings WHERE key=?").run(`lease:${sourceId}:${lease}`); };
}
export function providerBackoff(sourceId: string, value: string | null) {
  const seconds = Number(value);
  const parsed = value && Number.isFinite(seconds) ? seconds * 1000 : value ? Date.parse(value) - Date.now() : 60_000;
  const wait = Number.isFinite(parsed) ? Math.max(1000, parsed) : 60_000;
  db().prepare("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=CAST(MAX(CAST(settings.value AS INTEGER),CAST(excluded.value AS INTEGER)) AS TEXT)").run(`cooldown:${sourceId}`, String(Date.now() + wait));
  return Math.ceil(wait / 1000);
}
