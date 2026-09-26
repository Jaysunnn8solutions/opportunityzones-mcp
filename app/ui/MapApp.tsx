"use client";

/**
 * The screening map. The basemap is OpenFreeMap (streets, water, labels) or
 * USGS aerial imagery (lib/geo/basemaps.ts). Tract and county outlines are the
 * Census cartographic boundary files the pipeline writes to public/boundaries
 * (pipeline/map/boundaries.ts): the counties file for zoomed-out views, and one
 * file per state with every tract, loaded as a state comes into view. Until
 * those files exist, outlines come per tile from TIGERweb through our cached
 * /api/boundaries route instead. Colours come from the published data.
 *
 * Privacy: a searched address lives only in this component's state and is sent
 * once, in a POST body, to /api/geocode. It is never put in the URL; the hash
 * holds only the selected tract and the map view.
 */

import { Map as MapLibreMap, Marker, NavigationControl, setWorkerUrl, type GeoJSONSource, type GeoJSONSourceSpecification, type MapMouseEvent } from "maplibre-gl";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { BASEMAPS, DEFAULT_BASEMAP, isBasemapId, withOverlay, type BasemapId, type Overlay } from "@/lib/geo/basemaps";
import { countyHasZones, type CountyCounts } from "@/lib/data/countyZones";
import { featuresFrom, isBoundaryIndex, STATE_TRACT_MIN_ZOOM, statesInView, type BoundaryIndex } from "@/lib/geo/stateBoundaries";
import { tilesCovering, type Bounds } from "@/lib/geo/tiles";
import { versionLabel } from "@/lib/version";
import type { MapLayerId } from "@/lib/content/mapLayers";
import { LayerInfoCard } from "./LayerInfo";

/** Tracts from this zoom when outlines come per tile from TIGERweb (the fallback). */
const TILE_TRACT_MIN_ZOOM = 8;
/** Counties with zones, zoomed out. */
const COUNTY_ZONE_COLOR = "#2563eb";
const tractMinZoomFor = (index: BoundaryIndex | null | undefined) => (index ? STATE_TRACT_MIN_ZOOM : TILE_TRACT_MIN_ZOOM);

const FLAGS = {
  eligible: { bit: 1, label: "2027 eligible", color: "#0b6e4f" },
  // Not a colour choice of its own: shown as hatching over eligible and 2027-zone tracts.
  rural: { bit: 2, label: "Rural (2027 rules)", color: "#8c6d1f" },
  oz2018: { bit: 4, label: "2018 zone", color: "#6a3d9a" },
  qct: { bit: 8, label: "HUD QCT", color: "#1f78b4" },
  dda: { bit: 16, label: "HUD DDA", color: "#b15928" },
  nmtc: { bit: 32, label: "NMTC", color: "#33a02c" },
  zone2027: { bit: 64, label: "2027 zone", color: "#c2410c" },
} as const;
/** Set with zone2027 unknown: eligible, its state's list not yet published. */
const ZONE_2027_PENDING = 128;
type FlagName = keyof typeof FLAGS;
/** The colour-by choices offered; rural status is drawn as hatching on the two views where it matters. */
const PICKER: FlagName[] = ["eligible", "zone2027", "oz2018", "qct", "dda", "nmtc"];
const HATCHES_RURAL = new Set<FlagName>(["eligible", "zone2027"]);
/** Pattern from public/sprites/oz (scripts/make-sprite.ts), merged into every basemap's sprites. */
const RURAL_HATCH = "oz:rural-hatch";
/** Matches the sprite's ink (scripts/make-sprite.ts), for the legend swatch. */
const HATCH_INK = "rgba(6, 40, 29, 0.85)";

/** Legend wording per view: [yes, yes and rural, no, no data]. */
const LEGEND: Partial<Record<FlagName, [string, string, string, string]>> = {
  eligible: ["Eligible for 2027", "Eligible, rural", "Not eligible", "No data"],
  zone2027: ["Designated 2027 zone", "Designated, rural", "Not designated", "Pending (list not published)"],
};

const ruralHatchFilter = (flag: FlagName) =>
  (HATCHES_RURAL.has(flag) ? ["all", ["==", ["get", flag], 1], ["==", ["get", "rural"], 1]] : ["==", ["get", "GEOID"], "__none__"]) as never;

const tractFillColor = (flag: FlagName) => ["match", ["get", flag], 1, FLAGS[flag].color, 0, "#ffffff", "#dddddd"] as never;

/** The map's own sources and layers, merged into whichever basemap is shown. */
function overlay(flag: FlagName, fillOpacity: number, selected: string | null, tractMinZoom: number): Overlay {
  const empty = (): GeoJSONSourceSpecification => ({ type: "geojson", data: { type: "FeatureCollection", features: [] } });
  return {
    sources: { counties: empty(), tracts: empty() },
    sprite: { id: "oz", url: `${window.location.origin}/sprites/oz` },
    layers: [
      {
        id: "county-fill",
        type: "fill",
        source: "counties",
        maxzoom: tractMinZoom,
        paint: {
          // One colour: blue where the county has zones (designated, or eligible while its state's list is unpublished).
          "fill-color": ["case", ["==", ["get", "zones"], 1], COUNTY_ZONE_COLOR, "rgba(0, 0, 0, 0)"],
          "fill-opacity": fillOpacity + 0.1,
        },
      },
      { id: "county-line", type: "line", source: "counties", maxzoom: tractMinZoom, paint: { "line-color": "#6b7682", "line-width": 0.4 } },
      { id: "tract-fill", type: "fill", source: "tracts", minzoom: tractMinZoom, paint: { "fill-color": tractFillColor(flag), "fill-opacity": fillOpacity } },
      { id: "tract-rural-hatch", type: "fill", source: "tracts", minzoom: tractMinZoom, filter: ruralHatchFilter(flag), paint: { "fill-pattern": RURAL_HATCH } },
      { id: "tract-line", type: "line", source: "tracts", minzoom: tractMinZoom, paint: { "line-color": "#4b5563", "line-width": 0.6 } },
      { id: "tract-selected", type: "line", source: "tracts", filter: ["==", ["get", "GEOID"], selected ?? ""], paint: { "line-color": "#d7191c", "line-width": 3 } },
    ],
  };
}

interface Feature {
  type: "Feature";
  properties: Record<string, string | number>;
  geometry: unknown;
}

interface Profile {
  geoid: string;
  state: string | null;
  county: string | null;
  cbsa: string | null;
  measures: Record<string, { value: number | null }>;
  rural: { treasury: boolean | null; explanation: string };
  designation2027: { status: string; text: string };
}

function readHash(): { geoid?: string; view?: [number, number, number]; basemap?: BasemapId } {
  const h = new URLSearchParams(window.location.hash.slice(1));
  const geoid = h.get("t") ?? undefined;
  const v = h.get("v")?.split(",").map(Number);
  const b = h.get("b");
  return {
    geoid: geoid && /^\d{11}$/.test(geoid) ? geoid : undefined,
    view: v && v.length === 3 && v.every(Number.isFinite) ? (v as [number, number, number]) : undefined,
    basemap: isBasemapId(b) ? b : undefined,
  };
}

function writeHash(geoid: string | null, map: MapLibreMap, basemap: BasemapId) {
  const c = map.getCenter();
  const h = new URLSearchParams();
  if (geoid) h.set("t", geoid);
  h.set("v", `${c.lng.toFixed(4)},${c.lat.toFixed(4)},${map.getZoom().toFixed(2)}`);
  if (basemap !== DEFAULT_BASEMAP) h.set("b", basemap);
  window.history.replaceState(null, "", `#${h.toString()}`);
}

const pct = (v: number | null | undefined) => (v == null ? "n/a" : `${(v * 100).toFixed(1)}%`);
const usd = (v: number | null | undefined) => (v == null ? "n/a" : `$${Math.round(v).toLocaleString("en-US")}`);

export default function MapApp() {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const tractFeatures = useRef(new Map<string, Feature>());
  const countyFeatures = useRef(new Map<string, Feature>());
  const loadedTiles = useRef(new Set<string>());
  const stateStatus = useRef(new Map<string, Record<string, number>>());
  const countySummary = useRef<Record<string, CountyCounts> | null>(null);
  const marker = useRef<Marker | null>(null);

  const [flag, setFlag] = useState<FlagName>("eligible");
  // Layer explanations: shown while hovering or focusing a layer, or kept open by clicking its "i".
  const [hoverInfo, setHoverInfo] = useState<MapLayerId | null>(null);
  const [pinnedInfo, setPinnedInfo] = useState<MapLayerId | null>(null);
  const [zoom, setZoom] = useState(0);
  const [basemap, setBasemap] = useState<BasemapId>(DEFAULT_BASEMAP);
  const [selected, setSelected] = useState<string | null>(null);
  // Read when a basemap switch rebuilds the style, so it keeps what is shown.
  const flagRef = useRef(flag);
  const basemapRef = useRef(basemap);
  const selectedRef = useRef(selected);
  // undefined until checked; null when the static files are absent (tile fallback).
  const boundaryIndex = useRef<BoundaryIndex | null | undefined>(undefined);
  const loadedStates = useRef(new Set<string>());
  const [profile, setProfile] = useState<Profile | null>(null);
  const [address, setAddress] = useState("");
  const [candidates, setCandidates] = useState<Array<{ geoid: string; lon: number; lat: number; label: string | null }>>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(0);

  /** Re-attach status flags and push merged features to the map. */
  const refreshSources = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const tracts = [...tractFeatures.current.values()].map((f) => {
      const g = String(f.properties.GEOID);
      const bits = stateStatus.current.get(g.slice(0, 2))?.[g];
      const props: Record<string, string | number> = { GEOID: g };
      for (const [name, { bit }] of Object.entries(FLAGS)) {
        props[name] = bits == null || (name === "zone2027" && bits & ZONE_2027_PENDING) ? -1 : bits & bit ? 1 : 0;
      }
      return { ...f, properties: props };
    });
    const counties = [...countyFeatures.current.values()].map((f) => {
      const s = countySummary.current?.[String(f.properties.GEOID)];
      return { ...f, properties: { ...f.properties, zones: s ? (countyHasZones(s) ? 1 : 0) : -1 } };
    });
    (map.getSource("tracts") as GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features: tracts } as never);
    (map.getSource("counties") as GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features: counties } as never);
  }, []);

  /** Status flags for each state not yet fetched, for colouring its tracts. */
  const loadStatus = useCallback(async (states: Iterable<string>) => {
    await Promise.all(
      [...new Set(states)]
        .filter((s) => !stateStatus.current.has(s))
        .map(async (s) => {
          stateStatus.current.set(s, {});
          const r = await fetch(`/api/status/${s}`);
          if (r.ok) stateStatus.current.set(s, (await r.json()) as Record<string, number>);
        })
    );
  }, []);

  const loadCountySummary = useCallback(async () => {
    if (countySummary.current) return;
    const r = await fetch("/api/counties");
    if (r.ok) countySummary.current = (await r.json()) as Record<string, CountyCounts>;
  }, []);

  /**
   * Whether the pipeline's static boundary files are published. Checked once;
   * when they are, the county file is loaded at the same time.
   */
  const checkBoundaryFiles = useCallback(async (): Promise<BoundaryIndex | null> => {
    if (boundaryIndex.current !== undefined) return boundaryIndex.current;
    try {
      const r = await fetch("/boundaries/index.json");
      const body: unknown = r.ok ? await r.json() : null;
      boundaryIndex.current = isBoundaryIndex(body) ? body : null;
    } catch {
      boundaryIndex.current = null;
    }
    if (boundaryIndex.current) {
      const r = await fetch("/boundaries/counties.json");
      if (r.ok) for (const f of featuresFrom(await r.json(), "counties")) countyFeatures.current.set(String(f.properties.GEOID), f);
    }
    const map = mapRef.current;
    if (map) {
      const z = tractMinZoomFor(boundaryIndex.current);
      for (const id of ["county-fill", "county-line"]) if (map.getLayer(id)) map.setLayerZoomRange(id, 0, z);
      for (const id of ["tract-fill", "tract-rural-hatch", "tract-line"]) if (map.getLayer(id)) map.setLayerZoomRange(id, z, 24);
    }
    return boundaryIndex.current;
  }, []);

  /** Load whatever outlines the view needs that are not loaded yet. */
  const loadVisible = useCallback(async () => {
    const map = mapRef.current;
    if (!map) return;
    setLoading((n) => n + 1);
    try {
      const index = await checkBoundaryFiles();
      const z = map.getZoom();
      const b = map.getBounds();
      const bounds: Bounds = { west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() };
      if (index) {
        if (z < STATE_TRACT_MIN_ZOOM) {
          await loadCountySummary();
        } else {
          const states = statesInView(index, bounds).filter((s) => !loadedStates.current.has(s));
          await Promise.all(
            states.map(async (s) => {
              loadedStates.current.add(s);
              const res = await fetch(`/boundaries/tracts/${s}.json`);
              if (!res.ok) {
                loadedStates.current.delete(s);
                return;
              }
              for (const f of featuresFrom(await res.json(), "tracts")) tractFeatures.current.set(String(f.properties.GEOID), f);
            })
          );
          await loadStatus(states);
        }
        refreshSources();
        return;
      }

      // Fallback: per-tile outlines from TIGERweb through /api/boundaries.
      const layer = z >= TILE_TRACT_MIN_ZOOM ? "tracts" : "counties";
      const tz = layer === "tracts" ? Math.min(12, Math.max(TILE_TRACT_MIN_ZOOM, Math.floor(z))) : Math.min(7, Math.max(3, Math.floor(z)));
      const tiles = tilesCovering(bounds, tz).filter((t) => !loadedTiles.current.has(`${layer}/${tz}/${t.x}/${t.y}`));
      if (tiles.length === 0 || tiles.length > 40) return;
      await Promise.all(
        tiles.map(async (t) => {
          const key = `${layer}/${tz}/${t.x}/${t.y}`;
          loadedTiles.current.add(key);
          const res = await fetch(`/api/boundaries/${key}`);
          if (!res.ok) {
            loadedTiles.current.delete(key);
            return;
          }
          const fc = (await res.json()) as { features: Feature[] };
          const store = layer === "tracts" ? tractFeatures.current : countyFeatures.current;
          for (const f of fc.features) if (!store.has(String(f.properties.GEOID))) store.set(String(f.properties.GEOID), f);
          if (layer === "tracts") await loadStatus(fc.features.map((f) => String(f.properties.GEOID).slice(0, 2)));
        })
      );
      if (layer === "counties") await loadCountySummary();
      refreshSources();
    } finally {
      setLoading((n) => n - 1);
    }
  }, [checkBoundaryFiles, loadCountySummary, loadStatus, refreshSources]);

  /** Swap the basemap, carrying the map's own layers and data across. */
  const applyBasemap = useCallback(
    (id: BasemapId) => {
      const map = mapRef.current;
      if (!map) return;
      basemapRef.current = id;
      const b = BASEMAPS[id];
      map.setStyle(b.style, {
        diff: false,
        transformStyle: (_previous, next) => withOverlay(next, overlay(flagRef.current, b.fillOpacity, selectedRef.current, tractMinZoomFor(boundaryIndex.current))),
      });
      // The new style starts with empty overlay sources; refill them.
      map.once("style.load", refreshSources);
      writeHash(selectedRef.current, map, id);
    },
    [refreshSources]
  );

  const selectTract = useCallback(async (geoid: string | null) => {
    setSelected(geoid);
    selectedRef.current = geoid;
    const map = mapRef.current;
    if (map) {
      if (map.getLayer("tract-selected")) map.setFilter("tract-selected", ["==", ["get", "GEOID"], geoid ?? ""]);
      writeHash(geoid, map, basemapRef.current);
    }
    if (!geoid) {
      setProfile(null);
      return;
    }
    const r = await fetch(`/api/tract/${geoid}`);
    setProfile(r.ok ? ((await r.json()) as Profile) : null);
  }, []);

  useEffect(() => {
    if (!container.current || mapRef.current) return;
    // The bundler does not emit MapLibre's worker next to its code; serve our
    // copy (scripts/copy-maplibre-worker.ts) or the map never loads.
    setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
    const initial = readHash();
    const map = new MapLibreMap({
      container: container.current,
      center: initial.view ? [initial.view[0], initial.view[1]] : [-96, 38.5],
      zoom: initial.view?.[2] ?? 3.6,
      attributionControl: { compact: true, customAttribution: "Boundaries: U.S. Census Bureau" },
      // Replaced at once by applyBasemap, which merges in the overlay layers.
      style: { version: 8, sources: {}, layers: [] },
    });
    map.addControl(new NavigationControl({ showCompass: false }), "top-left");
    mapRef.current = map;
    const initialBasemap = initial.basemap ?? DEFAULT_BASEMAP;
    setBasemap(initialBasemap);
    applyBasemap(initialBasemap);
    // Map errors (a tile that failed, a bad style value) carry no user data.
    map.on("error", (e) => console.warn("[map]", e.error?.message ?? "error"));
    if (process.env.NODE_ENV !== "production") (window as unknown as { __ozMap?: MapLibreMap }).__ozMap = map;
    map.on("load", () => {
      setZoom(map.getZoom());
      void loadVisible();
      if (initial.geoid) void selectTract(initial.geoid);
    });
    map.on("moveend", () => {
      setZoom(map.getZoom());
      void loadVisible();
      writeHash(readHash().geoid ?? null, map, basemapRef.current);
    });
    map.on("click", "tract-fill", (e: MapMouseEvent & { features?: Array<{ properties: Record<string, unknown> }> }) => {
      const g = e.features?.[0]?.properties?.GEOID;
      if (typeof g === "string") void selectTract(g);
    });
    map.on("click", "county-fill", (e: MapMouseEvent) => map.easeTo({ center: e.lngLat, zoom: Math.max(map.getZoom(), tractMinZoomFor(boundaryIndex.current)) + 1 }));
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [applyBasemap, loadVisible, selectTract]);

  useEffect(() => {
    flagRef.current = flag;
    const map = mapRef.current;
    if (!map || !map.getLayer("tract-fill")) return;
    map.setPaintProperty("tract-fill", "fill-color", tractFillColor(flag));
    if (map.getLayer("tract-rural-hatch")) map.setFilter("tract-rural-hatch", ruralHatchFilter(flag));
  }, [flag]);

  function chooseBasemap(id: BasemapId) {
    if (id === basemapRef.current) return;
    setBasemap(id);
    applyBasemap(id);
  }

  async function search(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setCandidates([]);
    const res = await fetch("/api/geocode", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address }),
    });
    if (!res.ok) {
      setMessage(res.status === 400 ? "Enter a full U.S. street address (5-200 characters)." : "Address lookup is unavailable right now.");
      return;
    }
    const { matches } = (await res.json()) as { matches: typeof candidates };
    if (matches.length === 0) {
      setMessage("No match found. Try the full street address with city, state and ZIP.");
      return;
    }
    setCandidates(matches);
    goTo(matches[0]);
  }

  function goTo(m: { geoid: string; lon: number; lat: number }) {
    const map = mapRef.current;
    if (!map) return;
    marker.current?.remove();
    marker.current = new Marker({ color: "#d7191c" }).setLngLat([m.lon, m.lat]).addTo(map);
    map.flyTo({ center: [m.lon, m.lat], zoom: 13 });
    void selectTract(m.geoid);
  }

  const m = profile?.measures;
  return (
    <div className="map-screen">
      <aside className="panel">
        <form className="search" onSubmit={search}>
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Street address, city, state ZIP"
            aria-label="Address"
            autoComplete="off"
          />
          <button type="submit">Find</button>
        </form>
        <p className="hint">Sent once to the U.S. Census Geocoder to find the tract. Not stored.</p>
        {message && <p className="error">{message}</p>}
        {candidates.length > 1 && (
          <ul>
            {candidates.map((c) => (
              <li key={`${c.geoid}-${c.lon}`}>
                <button type="button" className="link" onClick={() => goTo(c)}>
                  {c.label ?? c.geoid}
                </button>
              </li>
            ))}
          </ul>
        )}

        <div onMouseLeave={() => setHoverInfo(null)}>
          <div className="layer-picker" role="group" aria-label="Colour tracts by">
            {PICKER.map((f) => (
              <span key={f} className="layer-choice" onMouseEnter={() => setHoverInfo(f as MapLayerId)}>
                <button type="button" aria-pressed={flag === f} onClick={() => setFlag(f)}>
                  {FLAGS[f].label}
                </button>
                <button
                  type="button"
                  className="layer-info-toggle"
                  aria-label={`What is ${FLAGS[f].label}?`}
                  aria-expanded={pinnedInfo === f}
                  onClick={() => setPinnedInfo(pinnedInfo === f ? null : (f as MapLayerId))}
                  onFocus={() => setHoverInfo(f as MapLayerId)}
                >
                  i
                </button>
              </span>
            ))}
          </div>
          {(hoverInfo ?? pinnedInfo) && <LayerInfoCard id={(hoverInfo ?? pinnedInfo)!} onClose={pinnedInfo ? () => setPinnedInfo(null) : undefined} />}
        </div>
        <div className="layer-picker" role="group" aria-label="Basemap">
          {(Object.keys(BASEMAPS) as BasemapId[]).map((b) => (
            <button key={b} type="button" aria-pressed={basemap === b} onClick={() => chooseBasemap(b)}>
              {BASEMAPS[b].label}
            </button>
          ))}
        </div>
        <p className="hint">Zoomed out, counties show where zones are; zoom in to a state to see its tracts, and click one.</p>

        {selected && !profile && <p className="hint">Loading tract {selected}...</p>}
        {profile && m && (
          <section>
            <h2>
              Tract {profile.geoid}
              <br />
              <span className="hint">
                {profile.county}, {profile.state}
              </span>
            </h2>
            <ul>
              <li>
                2027 eligibility: <strong>{m.eligible_2027.value === 1 ? "eligible" : m.eligible_2027.value === 0 ? "not eligible" : "n/a"}</strong>{" "}
                (eligibility is not designation)
              </li>
              <li>{profile.designation2027.text}</li>
              <li>
                Income {m.mfi_ratio.value == null ? "n/a" : `${(m.mfi_ratio.value * 100).toFixed(0)}%`} of area MFI; poverty {pct(m.poverty_rate.value)}
              </li>
              <li>Rural: {profile.rural.treasury == null ? "n/a" : profile.rural.treasury ? "yes" : "no"}. {profile.rural.explanation}</li>
              <li>2018 zone: {m.oz2018_population_share.value == null ? "n/a" : m.oz2018_population_share.value >= 0.5 ? "yes" : m.oz2018_population_share.value > 0 ? "partly" : "no"}</li>
              <li>
                QCT {m.qct_2026.value === 1 ? "yes" : "no"}; DDA {m.dda_2026.value === 2 ? "yes" : m.dda_2026.value === 1 ? "partly" : "no"}; NMTC{" "}
                {m.nmtc_lic.value === 1 ? "yes" : m.nmtc_lic.value === 0 ? "no" : "n/a"}
              </li>
              <li>
                Population {m.population.value?.toLocaleString("en-US") ?? "n/a"}; median household income {usd(m.median_household_income.value)}
              </li>
            </ul>
            <p>
              <Link href={`/tract/${profile.geoid}`}>Full tract profile and sources</Link>
            </p>
            <div className="next-steps">
              <strong>What next</strong>
              <Link href="/how-it-works">How a gain, a fund and a zone fit together</Link>
              <Link href="/how-it-works#designation">Why eligible is not designated</Link>
              <Link href="/funds">Finding and reviewing funds</Link>
            </div>
          </section>
        )}
        <p className="note">Informational only, not investment, tax or legal advice.</p>
      </aside>
      <div className="map">
        <div ref={container} className="map-canvas" />
        {loading > 0 && <div className="map-status">Loading boundaries...</div>}
        <MapLegend flag={flag} showTracts={zoom >= tractMinZoomFor(boundaryIndex.current)} />
        <div className="map-version" title="Release · commit · build date">
          {versionLabel()}
        </div>
      </div>
    </div>
  );
}

/** On-map key: counties when zoomed out, the chosen tract view when zoomed in. */
function MapLegend({ flag, showTracts }: { flag: FlagName; showTracts: boolean }) {
  const hatch = `repeating-linear-gradient(135deg, ${HATCH_INK} 0 1.5px, transparent 1.5px 5px)`;
  if (!showTracts) {
    return (
      <div className="map-legend" aria-label="Map legend">
        <strong>Counties</strong>
        <span>
          <span className="swatch" style={{ background: COUNTY_ZONE_COLOR }} /> Has 2027-eligible tracts
        </span>
        <span>
          <span className="swatch" /> None
        </span>
        <span className="legend-note">Where a state&apos;s designations are published: has designated tracts. Zoom in for tracts.</span>
      </div>
    );
  }
  const [yes, yesRural, no, none] = LEGEND[flag] ?? [FLAGS[flag].label, "", "No", "No data"];
  return (
    <div className="map-legend" aria-label="Map legend">
      <strong>{FLAGS[flag].label}</strong>
      <span>
        <span className="swatch" style={{ background: FLAGS[flag].color }} /> {yes}
      </span>
      {HATCHES_RURAL.has(flag) && (
        <span>
          <span className="swatch" style={{ background: `${hatch}, ${FLAGS[flag].color}` }} /> {yesRural}
        </span>
      )}
      <span>
        <span className="swatch" style={{ background: "#ffffff" }} /> {no}
      </span>
      <span>
        <span className="swatch" style={{ background: "#dddddd" }} /> {none}
      </span>
    </div>
  );
}
