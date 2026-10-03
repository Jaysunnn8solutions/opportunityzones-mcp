import { db } from "@/lib/access/store";

const pending = new Map<string, Promise<unknown>>();
/** Allowlisted county/tract source keys only. Never pass an address, coordinates, or URL. */
export async function publicGeographyCache<T>(key: string, ttl: number, loader: () => Promise<T>, cacheable: (value: T) => boolean = () => true): Promise<{ value: T; checkedAt: number }> {
  if (!/^(site|laus|qwi|qcew):\d{5}(\d{6})?(:[a-z0-9-]+)*$/.test(key)) throw new Error("Invalid public geography cache key");
  const store = db();
  (await store.exec("CREATE TABLE IF NOT EXISTS public_cache (key TEXT PRIMARY KEY, body TEXT NOT NULL, checked INTEGER NOT NULL, expires INTEGER NOT NULL)"));
  const now = Date.now();
  (await store.prepare("DELETE FROM public_cache WHERE expires<?").run(now));
  const hit = (await store.prepare("SELECT body,checked FROM public_cache WHERE key=? AND expires>?").get(key, now)) as { body: string; checked: number } | undefined;
  if (hit) return { value: JSON.parse(hit.body) as T, checkedAt: hit.checked };
  const active = pending.get(key); if (active) return active as Promise<{ value: T; checkedAt: number }>;
  const request = loader().then(async (value) => { if (cacheable(value)) (await store.prepare("INSERT INTO public_cache(key,body,checked,expires) VALUES(?,?,?,?) ON CONFLICT(key) DO UPDATE SET body=excluded.body,checked=excluded.checked,expires=excluded.expires").run(key, JSON.stringify(value), now, now + ttl)); return { value, checkedAt: now }; }).finally(() => pending.delete(key));
  pending.set(key, request); return request;
}
