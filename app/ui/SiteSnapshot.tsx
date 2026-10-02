"use client";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { pointFromHash } from "@/lib/client/place";
import type { SnapshotItem } from "@/lib/site/snapshot";

const SOURCES: Array<[SnapshotItem["key"], string]> = [["flood", "Flood zone"], ["earthquake", "Earthquake"], ["wildfire", "Wildfire"], ["epa", "EPA sites within 1 mile"], ["traffic", "Road traffic within ½ mile"], ["amenities", "Amenities within 1 mile"]];
export default function SiteSnapshot({ geoid }: { geoid: string }) {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash, () => "");
  const ready = useSyncExternalStore(subscribe, () => true, () => false);
  return ready ? <SnapshotRequests key={`${geoid}:${hash}`} geoid={geoid} hash={hash} /> : <p role="status">Preparing site context…</p>;
}
const subscribe = (callback: () => void) => { window.addEventListener("hashchange", callback); return () => window.removeEventListener("hashchange", callback); };
function SnapshotRequests({ geoid, hash }: { geoid: string; hash: string }) {
  const [items, setItems] = useState<Partial<Record<SnapshotItem["key"], SnapshotItem>>>({});
  const point = useMemo(() => pointFromHash(hash), [hash]);
  const basis = point ? "address" : "tract";
  const [loading, setLoading] = useState<string[]>([]);
  const [requested, setRequested] = useState(false);
  const controllers = useRef(new Map<string, AbortController>());
  const load = useCallback(async (key: SnapshotItem["key"]) => {
    if (controllers.current.has(key) || key === "amenities") return;
    const controller = new AbortController(); controllers.current.set(key, controller);
    const keys = [key];
    setRequested(true);
    setLoading((current) => [...new Set([...current, ...keys])]);
    try {
      const response = await fetch("/api/site", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ geoid, ...(point ? { lon: point[0], lat: point[1] } : {}), source: key }), signal: controller.signal });
      const body = await response.json() as { items?: SnapshotItem[]; error?: string };
      if (!response.ok) throw new Error(body.error ?? "temporarily unavailable; try again");
      if (!controller.signal.aborted && body.items) setItems((current) => ({ ...current, ...Object.fromEntries(body.items!.map((item) => [item.key, item])) }));
    } catch (error) {
      if (!controller.signal.aborted) setItems((current) => ({ ...current, ...Object.fromEntries(keys.map((id) => [id, { key: id, label: SOURCES.find(([source]) => source === id)![1], headline: null, detail: null, source: "", unavailable: error instanceof Error ? error.message : "temporarily unavailable" }])) }));
    } finally { controllers.current.delete(key); if (!controller.signal.aborted) setLoading((current) => current.filter((id) => id !== key)); }
  }, [geoid, point]);
  useEffect(() => {
    const pending = controllers.current;
    return () => { for (const controller of pending.values()) controller.abort(); };
  }, []);
  return <div>
    <p className="location-basis"><strong>{basis === "address" ? "Matched address point and surrounding area" : "Representative point inside the tract"}</strong><span>{basis === "tract" ? "These are point-based readings, not tract-wide statistics. A tract can contain several flood zones. Search an address to check its matched point." : "The matched point is not a parcel boundary or building footprint. Flood conditions can differ elsewhere on the property."}</span></p>
    <p className="hint">Choose a check below. Sources load independently, only on request. Unavailable or unmapped information does not mean no risk. Checked dates describe retrieval, not the age of the underlying data.</p>
    <button type="button" className="button secondary" disabled={loading.length > 0 || SOURCES.filter(([key]) => key !== "amenities").every(([key]) => items[key])} onClick={() => { for (const [key] of SOURCES) if (key !== "amenities" && !items[key]) void load(key); }}>Load all available checks</button>
    <div className="tiles snapshot">{SOURCES.map(([key, label]) => { const item = items[key]; const busy = loading.includes(key); const enabled = key !== "amenities"; return <section className="tile snapshot-card" key={key} aria-label={label} aria-busy={busy}>
      <h3 className="tile-label">{label}</h3>
      <div role="status"><strong>{busy ? "Loading…" : !enabled ? "Not available on this site" : !item ? "Not requested" : item.headline ?? "Check unavailable"}</strong>
      {!busy && <>{!enabled ? <p className="tile-detail">The amenities data connection is not enabled. No lookup is made.</p> : item?.unavailable ? <p className="tile-detail">{item.unavailable}. No conclusion can be drawn from this missing result.</p> : item?.detail && <p className="tile-detail">{item.detail}</p>}
      {item?.source && <p className="tile-source">{item.source}</p>}
      {item?.checkedAt && <p className="tile-source">{item.unavailable ? "Attempted" : "Checked"} {new Date(item.checkedAt).toLocaleString("en-US")}{basis === "tract" && !item.unavailable ? "; public-point reading may be cached for up to 24 hours" : ""}.</p>}</>}</div>
      {key === "flood" && <p className="tile-detail">FEMA mapped zone at {basis === "tract" ? "one representative tract point" : "the matched address point"}. This is not a property-wide assessment or an official insurance/lending determination. <a href="https://msc.fema.gov/portal/home" target="_blank" rel="noopener noreferrer">Open FEMA flood maps ↗</a></p>}
      {key === "earthquake" && <p className="tile-detail">Area estimate using coordinates rounded to about 1 km, default soil class, and Risk Category II; not a building assessment.</p>}
      {key === "wildfire" && <p className="tile-detail">Landscape model sampled near a point rounded to about 1 km. An annual probability is not a schedule for when a fire will occur.</p>}
      {enabled && <button type="button" className="button secondary" disabled={busy} onClick={() => void load(key)}>{busy ? `Checking ${label.toLowerCase()}…` : `${item?.unavailable ? "Retry" : item ? "Refresh" : "Check"} ${label.toLowerCase()}`}</button>}
    </section>; })}</div>
    {requested && <p className="hint" role="status">{loading.length ? "Checking requested sources…" : "Source checks complete. Results may include unavailable information."}</p>}
  </div>;
}
