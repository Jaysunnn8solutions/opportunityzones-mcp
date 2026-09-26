"use client";

/**
 * Live hazards and surroundings on a place report. At the searched address
 * when the page was opened from a search (the point rides in the URL hash,
 * which never reaches the server), otherwise at the tract's interior point.
 */

import { useEffect, useState } from "react";

interface Item {
  key: string;
  label: string;
  headline: string | null;
  detail: string | null;
  source: string;
  unavailable?: string;
}

const ICON: Record<string, string> = { flood: "≈", earthquake: "⌇", wildfire: "▲", epa: "⚑", traffic: "⇄", amenities: "⌂" };

function pointFromHash(): { lat: number; lon: number } | null {
  const at = new URLSearchParams(window.location.hash.slice(1)).get("at");
  const [lat, lon] = (at ?? "").split(",").map(Number);
  return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { lat, lon } : null;
}

export default function SiteSnapshot({ geoid }: { geoid: string }) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [basis, setBasis] = useState<"address" | "tract" | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    const at = pointFromHash();
    fetch("/api/site", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(at ?? { geoid }) })
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status));
        const body = (await r.json()) as { basis: "address" | "tract"; items: Item[] };
        if (live) {
          setItems(body.items);
          setBasis(body.basis);
        }
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [geoid]);

  if (failed) return <p className="hint">The live site snapshot is unavailable right now.</p>;
  return (
    <div>
      <p className="hint">
        {basis === "address"
          ? "At the address you searched."
          : basis === "tract"
            ? "At a point inside the tract. Flood zones can change street by street; search an exact address for its own reading."
            : "Asking FEMA, USGS, the Forest Service, EPA, FHWA and Foursquare..."}
      </p>
      <div className="tiles snapshot">
        {(items ?? Array.from({ length: 6 }, (_, i): Item => ({ key: `s${i}`, label: "", headline: null, detail: null, source: "" }))).map((it) => (
          <div key={it.key} className={`tile${items ? "" : " skeleton"}`}>
            <span className="tile-label">
              <span aria-hidden="true" className="tile-icon">
                {ICON[it.key] ?? ""}
              </span>{" "}
              {it.label}
            </span>
            <strong>{it.headline ?? (items ? "Unavailable" : " ")}</strong>
            <span className="tile-detail">{it.unavailable ? `Source ${it.unavailable}.` : it.detail}</span>
            {items && <span className="tile-source">{it.source}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
