"use client";

/**
 * The screening map. The basemap is OpenFreeMap (streets, water, labels) or
 * USGS aerial imagery (lib/geo/basemaps.ts). Tract and county outlines are the
 * Census cartographic boundary files the pipeline writes to public/boundaries
 * (pipeline/map/boundaries.ts): the counties file for zoomed-out views, and one
 * file per state with every tract, loaded as a state comes into view. Until
 * those files exist, outlines come per tile from TIGERweb through our cached
 * /api/boundaries route instead. Colors come from the published data.
 *
 * Privacy: search inputs live in the research session's browser memory.
 * Exact coordinates are carried in the URL fragment, never its path or query.
 */

import { Map as MapLibreMap, Marker, NavigationControl, setWorkerUrl, type GeoJSONSource, type GeoJSONSourceSpecification, type MapMouseEvent } from "maplibre-gl";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { BASEMAPS, DEFAULT_BASEMAP, isBasemapId, withOverlay, type BasemapId, type Overlay } from "@/lib/geo/basemaps";
import { countyHasZones, type CountyCounts } from "@/lib/data/countyZones";
import { featuresFrom, isBoundaryIndex, STATE_TRACT_MIN_ZOOM, statesInView, type BoundaryIndex } from "@/lib/geo/stateBoundaries";
import { tilesCovering, type Bounds } from "@/lib/geo/tiles";
import { versionLabel } from "@/lib/version";
import { mapFeaturesForMatches } from "@/lib/geo/mapMatches";
import { useResearchState } from "./ResearchSession";
import { researchFlagsAllowed, RESEARCH_SCOPE_NOTICE } from "@/lib/oz/researchScope";
import { legendFilters, withLayerVisibility, type LegendItem } from "@/lib/geo/mapLayerVisibility";
import MapLegendItem from "./MapLayerControls";

/** Tracts from this zoom when outlines come per tile from TIGERweb (the fallback). */
const TILE_TRACT_MIN_ZOOM = 8;
/** Counties with zones, zoomed out. */
const COUNTY_ZONE_COLOR = "#2563eb";
const tractMinZoomFor = (index: BoundaryIndex | null | undefined) => (index ? STATE_TRACT_MIN_ZOOM : TILE_TRACT_MIN_ZOOM);

const FLAGS = {
  eligible: { bit: 1, label: "2027 eligible", color: "#00bfff" },
  // Not a color choice of its own: shown as hatching over eligible and 2027-zone tracts.
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
/** The color-by choices offered; rural status is drawn as hatching on the two views where it matters. */
const PICKER: FlagName[] = ["eligible", "zone2027", "oz2018", "qct", "dda", "nmtc"];
const HATCHES_RURAL = new Set<FlagName>(["eligible", "zone2027"]);
/** Pattern from public/sprites/oz (scripts/make-sprite.ts), merged into every basemap's sprites. */
const RURAL_HATCH = "oz:rural-hatch";
/** Matches the sprite's ink (scripts/make-sprite.ts), for the legend swatch. */
const HATCH_INK = "rgba(32, 24, 16, 0.85)";
const UNAVAILABLE_COLOR = "#6b7280";

/** Legend wording per view: [yes, yes and rural, no, no data]. */
const LEGEND: Partial<Record<FlagName, [string, string, string, string]>> = {
  eligible: ["Eligible for 2027", "Eligible, rural", "Not eligible", "Status unavailable"],
  zone2027: ["Designated 2027 zone", "Designated, rural", "Not designated", "Pending (list not published)"],
};

const ruralHatchFilter = (flag: FlagName) =>
  (HATCHES_RURAL.has(flag) ? ["all", ["==", ["get", flag], 1], ["==", ["get", "rural"], 1]] : ["==", ["get", "GEOID"], "__none__"]) as never;

const tractFillColor = (flag: FlagName) => ["match", ["get", flag], 1, FLAGS[flag].color, 0, flag === "eligible" ? "rgba(0, 0, 0, 0)" : "#ffffff", UNAVAILABLE_COLOR] as never;

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
          // One color: blue where the county has zones (designated, or eligible while its state's list is unpublished).
          "fill-color": ["case", ["==", ["get", "zones"], 1], COUNTY_ZONE_COLOR, "rgba(0, 0, 0, 0)"],
          "fill-opacity": fillOpacity + 0.1,
        },
      },
      { id: "county-line", type: "line", source: "counties", maxzoom: tractMinZoom, paint: { "line-color": "#6b7682", "line-width": 0.4 } },
      {
        id: "tract-fill",
        type: "fill",
        source: "tracts",
        minzoom: tractMinZoom,
        paint: { "fill-color": tractFillColor(flag), "fill-opacity": fillOpacity },
      },
      { id: "tract-rural-hatch", type: "fill", source: "tracts", minzoom: tractMinZoom, filter: ruralHatchFilter(flag), paint: { "fill-pattern": RURAL_HATCH, "fill-opacity": 1 } },
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
  const h = new URLSearchParams(window.location.hash.slice(1));
  if (geoid) h.set("t", geoid); else h.delete("t");
  h.set("v", `${c.lng.toFixed(4)},${c.lat.toFixed(4)},${map.getZoom().toFixed(2)}`);
  if (basemap !== DEFAULT_BASEMAP) h.set("b", basemap); else h.delete("b");
  window.history.replaceState(window.history.state, "", `#${h.toString()}`);
}

export interface MapFocus { geoid: string; point: [number, number] | null; exact?: boolean }
export default function MapApp({ view, focus, matches, onSelect, viewControls }: { view?: [number, number, number] | null; focus?: MapFocus | null; matches: string[] | null; onSelect: (geoid: string) => void; viewControls?: ReactNode }) {
  const container = useRef<HTMLDivElement>(null);
  const toolbar = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const tractFeatures = useRef(new Map<string, Feature>());
  const countyFeatures = useRef(new Map<string, Feature>());
  const loadedTiles = useRef(new Set<string>());
  const stateStatus = useRef(new Map<string, Record<string, number>>());
  const countySummary = useRef<Record<string, CountyCounts> | null>(null);
  const marker = useRef<Marker | null>(null);

  const [flag, setFlag] = useResearchState<FlagName>("map-color", () => { const value = new URLSearchParams(window.location.hash.slice(1)).get("color"); return PICKER.includes(value as FlagName) ? value as FlagName : "eligible"; });
  const flagRef = useRef(flag);
  const [rememberedView, rememberView] = useResearchState<[number, number, number] | null>("map-view", null);
  const [basemap, setBasemap] = useResearchState<BasemapId>("map-basemap", DEFAULT_BASEMAP);
  const [hiddenLayers, setHiddenLayers] = useResearchState<LegendItem[]>("map-hidden-legend-items", []);
  const hiddenLayersRef = useRef(hiddenLayers);
  const applyLayerVisibility = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    for (const [id, filter] of Object.entries(legendFilters(flagRef.current, hiddenLayersRef.current))) if (map.getLayer(id)) map.setFilter(id, filter);
  }, []);
  useEffect(() => { hiddenLayersRef.current = hiddenLayers; applyLayerVisibility(); }, [hiddenLayers, applyLayerVisibility]);
  const [initialView] = useState(() => { const hash = readHash(); const explicitScope = hash.geoid || new URLSearchParams(window.location.hash.slice(1)).has("s"); return { ...hash, view: hash.view ?? (explicitScope ? undefined : rememberedView ?? undefined), basemap: hash.basemap ?? basemap }; });
  const appliedView = useRef(false);
  const appliedFocus = useRef(false);
  const [zoom, setZoom] = useState(0);
  // Read when a basemap switch rebuilds the style, so it keeps what is shown.
  const basemapRef = useRef(basemap);
  const selectedRef = useRef<string | null>(null);
  // undefined until checked; null when the static files are absent (tile fallback).
  const boundaryIndex = useRef<BoundaryIndex | null | undefined>(undefined);
  const loadedStates = useRef(new Set<string>());
  const [loading, setLoading] = useState(0);
  const [mapError, setMapError] = useState(false);
  const [unavailableLegend, setUnavailableLegend] = useState<{ flag: FlagName; visible: boolean }>({ flag, visible: false });
  const [ready, setReady] = useState(false);
  const [tractMinZoom, setTractMinZoom] = useState(TILE_TRACT_MIN_ZOOM);
  const matchRef = useRef<Set<string> | null>(matches === null ? null : new Set(matches));
  const onSelectRef = useRef(onSelect);
  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);
  // Inspect only rendered tracts after map updates, not every animation frame
  // or all cached states. Clearing filters or panning can change this entry.
  const updateLegendAvailability = useCallback(() => {
    const map = mapRef.current;
    if (!map?.getLayer("tract-fill")) return;
    const currentFlag = flagRef.current;
    const visible = map.queryRenderedFeatures({ layers: ["tract-fill"] }).some((feature) => feature.properties[currentFlag] === -1);
    setUnavailableLegend((previous) => previous.flag === currentFlag && previous.visible === visible ? previous : { flag: currentFlag, visible });
  }, []);
  /** Re-attach status flags and push merged features to the map. */
  const refreshSources = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const tracts = mapFeaturesForMatches(tractFeatures.current.values(), matchRef.current, "tract").map((f) => {
      const g = String(f.properties.GEOID);
      const bits = stateStatus.current.get(g.slice(0, 2))?.[g];
      const props: Record<string, string | number> = { GEOID: g };
      for (const [name, { bit }] of Object.entries(FLAGS)) {
        props[name] = bits == null || (name === "zone2027" && bits & ZONE_2027_PENDING) ? -1 : bits & bit ? 1 : 0;
      }
      return { ...f, properties: props };
    });
    const counties = mapFeaturesForMatches(countyFeatures.current.values(), matchRef.current, "county").map((f) => {
      const s = countySummary.current?.[String(f.properties.GEOID)];
      return { ...f, properties: { ...f.properties, zones: matchRef.current !== null ? 1 : s ? (countyHasZones(s) ? 1 : 0) : -1 } };
    });
    (map.getSource("tracts") as GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features: tracts } as never);
    (map.getSource("counties") as GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features: counties } as never);
    if (marker.current) marker.current.getElement().hidden = matchRef.current !== null && !matchRef.current.has(selectedRef.current ?? "");
  }, []);

  /** Status flags for each state not yet fetched, for coloring its tracts. */
  const loadStatus = useCallback(async (states: Iterable<string>) => {
    await Promise.all(
      [...new Set(states)]
        .filter((s) => !stateStatus.current.has(s))
        .map(async (s) => {
          stateStatus.current.set(s, {});
          try {
            const r = await fetch(`/api/status/${s}`);
            if (!r.ok) throw new Error("Status unavailable");
            stateStatus.current.set(s, (await r.json()) as Record<string, number>);
          } catch (error) { stateStatus.current.delete(s); throw error; }
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
      setTractMinZoom(z);
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
                setMapError(true);
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
            setMapError(true);
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
    } catch {
      setMapError(true);
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
        transformStyle: (_previous, next) => {
          const overlays = overlay(flagRef.current, b.fillOpacity, selectedRef.current, tractMinZoomFor(boundaryIndex.current));
          return withOverlay(next, { ...overlays, layers: withLayerVisibility(overlays.layers, hiddenLayersRef.current, flagRef.current) });
        },
      });
      // The new style starts with empty overlay sources; refill them.
      map.once("style.load", refreshSources);
      writeHash(selectedRef.current, map, id);
    },
    [refreshSources]
  );

  const selectTract = useCallback((geoid: string | null) => {
    if (geoid && !researchFlagsAllowed(stateStatus.current.get(geoid.slice(0, 2))?.[geoid])) return;
    const hash = new URLSearchParams(window.location.hash.slice(1)); hash.delete("at");
    window.history.replaceState(window.history.state, "", `#${hash}`);
    selectedRef.current = geoid;
    const map = mapRef.current;
    if (map?.getLayer("tract-selected")) map.setFilter("tract-selected", ["==", ["get", "GEOID"], geoid ?? ""]);
    if (map) writeHash(geoid, map, basemapRef.current);
    if (geoid) onSelectRef.current(geoid);
  }, []);

  useEffect(() => {
    if (!container.current || mapRef.current) return;
    // The bundler does not emit MapLibre's worker next to its code; serve our
    // copy (scripts/copy-maplibre-worker.ts) or the map never loads.
    setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
    const initial = initialView;
    selectedRef.current = initial.geoid ?? null;
    const map = new MapLibreMap({
      container: container.current,
      center: initial.view ? [initial.view[0], initial.view[1]] : [-96, 38.5],
      zoom: initial.view?.[2] ?? 3.6,
      attributionControl: { compact: true, customAttribution: "Boundaries: U.S. Census Bureau" },
      // MapLibre consumes wheel events over the map canvas. Outside the map,
      // the results and filter panes retain their native scrolling.
      cooperativeGestures: false,
      scrollZoom: true,
      // Replaced at once by applyBasemap, which merges in the overlay layers.
      style: { version: 8, sources: {}, layers: [] },
    });
    // MapLibre 6 starts compact attribution expanded. Close it once at creation;
    // the native info disclosure still opens normally by mouse or keyboard.
    const attribution = map.getContainer().querySelector<HTMLDetailsElement>("details.maplibregl-ctrl-attrib");
    if (attribution) {
      attribution.open = false;
      attribution.classList.remove("maplibregl-compact-show");
    }
    map.getCanvas().setAttribute("aria-label", "Interactive tract map. Use the List view to select tracts without the map.");
    map.getCanvas().setAttribute("aria-describedby", "map-keyboard-help");
    map.addControl(new NavigationControl({ showCompass: false }), "top-left");
    mapRef.current = map;
    const initialBasemap = initial.basemap ?? DEFAULT_BASEMAP;
    setBasemap(initialBasemap);
    applyBasemap(initialBasemap);
    // Map errors (a tile that failed, a bad style value) carry no user data.
    map.on("error", () => setMapError(true));
    map.on("idle", updateLegendAvailability);
    map.on("style.load", applyLayerVisibility);
    if (process.env.NODE_ENV !== "production") (window as unknown as { __ozMap?: MapLibreMap }).__ozMap = map;
    map.on("load", () => {
      setReady(true);
      setZoom(map.getZoom());
      void loadVisible();
    });
    map.on("moveend", () => {
      const center = map.getCenter();
      rememberView([center.lng, center.lat, map.getZoom()]);
      setZoom(map.getZoom());
      void loadVisible();
      writeHash(readHash().geoid ?? null, map, basemapRef.current);
    });
    map.on("click", "tract-fill", (e: MapMouseEvent & { features?: Array<{ properties: Record<string, unknown> }> }) => {
      const g = e.features?.[0]?.properties?.GEOID;
      if (typeof g === "string") void selectTract(g);
    });
    map.on("click", "county-fill", (e: MapMouseEvent) => map.easeTo({ center: e.lngLat, zoom: Math.max(map.getZoom(), tractMinZoomFor(boundaryIndex.current)) + 1, duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 350 }));
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [applyBasemap, applyLayerVisibility, loadVisible, selectTract, initialView, rememberView, setBasemap, updateLegendAvailability]);

  useEffect(() => {
    flagRef.current = flag;
    const hash = new URLSearchParams(window.location.hash.slice(1));
    hash.set("color", flag);
    window.history.replaceState(window.history.state, "", `#${hash}`);
    const map = mapRef.current;
    if (!map || !map.getLayer("tract-fill")) return;
    map.setPaintProperty("tract-fill", "fill-color", tractFillColor(flag));
    applyLayerVisibility();
    updateLegendAvailability();
  }, [flag, applyLayerVisibility, updateLegendAvailability]);

  useEffect(() => {
    matchRef.current = matches ? new Set(matches) : null;
    refreshSources();
  }, [matches, refreshSources]);

  useEffect(() => {
    if (!ready || !view) return;
    if (!appliedView.current && initialView.view) { appliedView.current = true; return; }
    appliedView.current = true;
    mapRef.current?.jumpTo({ center: [view[0], view[1]], zoom: view[2] });
  }, [view, ready, initialView]);

  useEffect(() => {
    if (!ready) return;
    const map = mapRef.current;
    if (!map) return;
    if (!focus) {
      marker.current?.remove();
      selectedRef.current = null;
      if (map.getLayer("tract-selected")) map.setFilter("tract-selected", ["==", ["get", "GEOID"], ""]);
      return;
    }
    selectedRef.current = focus.geoid;
    if (map.getLayer("tract-selected")) map.setFilter("tract-selected", ["==", ["get", "GEOID"], focus.geoid]);
    marker.current?.remove();
    if (focus.point) {
      if (focus.exact) marker.current = new Marker({ color: "#d7191c" }).setLngLat(focus.point).addTo(map);
      if (marker.current) marker.current.getElement().hidden = matchRef.current !== null && !matchRef.current.has(focus.geoid);
      if (appliedFocus.current || !initialView.view || initialView.geoid !== focus.geoid) map.jumpTo({ center: focus.point, zoom: focus.exact ? 13 : 11 });
    }
    appliedFocus.current = true;
    writeHash(focus.geoid, map, basemapRef.current);
  }, [focus, ready, initialView]);

  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      mapRef.current?.resize();
      element.closest<HTMLElement>(".screening-map")?.style.setProperty("--map-toolbar-height", `${toolbar.current?.getBoundingClientRect().height ?? 60}px`);
    });
    observer.observe(element);
    if (toolbar.current) observer.observe(toolbar.current);
    return () => observer.disconnect();
  }, []);

  return <div className="screening-map">
    <p id="map-keyboard-help" className="visually-hidden">Scroll over the map to zoom in or out, or use its zoom buttons. Scroll outside the map to move through the results or filters. On a touchscreen, drag to move the map and pinch with two fingers to zoom. Arrow keys pan the focused map. Plus and minus zoom. Tab moves out of the map. The List view uses the same search filters and offers text results.</p>
    <div className="map-toolbar" ref={toolbar}>
      <details className="map-controls">
        <summary>Map controls</summary>
        <div className="map-controls-options">
      {viewControls}
      <label>Color by <select value={flag} onChange={(event) => setFlag(event.target.value as FlagName)}>{PICKER.map((key) => <option key={key} value={key}>{FLAGS[key].label}</option>)}</select></label>
      <label>Basemap <select value={basemap} onChange={(event) => { const id = event.target.value as BasemapId; setBasemap(id); applyBasemap(id); }}>{Object.entries(BASEMAPS).map(([id, base]) => <option key={id} value={id}>{base.label}</option>)}</select></label>
        </div>
      </details>
    </div>
    <div className="map" role="region" aria-label="Map of matching places">
      <div ref={container} className="map-canvas" />
      {loading > 0 && <div className="map-status" role="status">Loading boundaries…</div>}
      {mapError && <div className="map-error" role="status">Some map content is unavailable. The results list remains available. <button type="button" className="link" onClick={() => { setMapError(false); loadedStates.current.clear(); loadedTiles.current.clear(); void loadVisible(); }}>Retry boundaries</button></div>}
      <details className="map-legend">
        <summary>Map legend</summary>
        <div className="map-legend-scroll" role="region" aria-label="Map legend entries" tabIndex={0}>
          <p className="hint">{RESEARCH_SCOPE_NOTICE}</p>
          <MapLegend flag={flag} showTracts={zoom >= tractMinZoom} filtering={matches != null} showUnavailable={unavailableLegend.flag === flag && unavailableLegend.visible} hidden={hiddenLayers} onToggle={(id) => setHiddenLayers((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])} />
          <p className="hint">Uncheck a legend item to hide it. Search filters and result counts stay unchanged.</p>
        </div>
      </details>
      <span className="map-version">{versionLabel()}</span>
    </div>
  </div>;
}

/** On-map key: counties when zoomed out, the chosen tract view when zoomed in. */
function MapLegend({ flag, showTracts, filtering, showUnavailable, hidden, onToggle }: { flag: FlagName; showTracts: boolean; filtering: boolean; showUnavailable: boolean; hidden: LegendItem[]; onToggle: (id: LegendItem) => void }) {
  const hatch = `repeating-linear-gradient(135deg, ${HATCH_INK} 0 1.5px, transparent 1.5px 5px)`;
  if (!showTracts) {
    return (
      <div className="map-legend-content">
        <strong>{filtering ? "Counties with matching tracts" : "Counties"}</strong>
        <MapLegendItem label={filtering ? "Contains matching tracts" : "Has 2027-eligible tracts"} swatch={{ background: COUNTY_ZONE_COLOR }} checked={!hidden.includes("county-yes")} onToggle={() => onToggle("county-yes")} />
        {!filtering && <MapLegendItem label="None" checked={!hidden.includes("county-no")} onToggle={() => onToggle("county-no")} />}
        <span className="legend-note">{filtering ? "Zoom in to see only the matching tracts within these counties." : "Where a state's designations are published: has designated tracts. Zoom in for tracts."}</span>
      </div>
    );
  }
  const [yes, yesRural, no, none] = LEGEND[flag] ?? [FLAGS[flag].label, "", "No", "Status unavailable"];
  return (
    <div className="map-legend-content">
      <strong>{FLAGS[flag].label}</strong>
      <MapLegendItem label={HATCHES_RURAL.has(flag) ? `${yes} · other tracts` : yes} swatch={{ background: FLAGS[flag].color }} checked={!hidden.includes("tract-yes")} onToggle={() => onToggle("tract-yes")} />
      {HATCHES_RURAL.has(flag) && (
        <MapLegendItem label={yesRural} swatch={{ background: `${hatch}, ${FLAGS[flag].color}` }} checked={!hidden.includes("tract-rural")} onToggle={() => onToggle("tract-rural")} />
      )}
      <MapLegendItem label={`${no}${flag === "eligible" ? " · boundary only" : ""}`} swatch={{ background: flag === "eligible" ? "transparent" : "#ffffff", ...(flag === "eligible" ? { border: "2px solid var(--muted)" } : {}) }} checked={!hidden.includes("tract-no")} onToggle={() => onToggle("tract-no")} />
      {(showUnavailable || hidden.includes("tract-unavailable")) && <MapLegendItem label={none} swatch={{ background: UNAVAILABLE_COLOR }} checked={!hidden.includes("tract-unavailable")} onToggle={() => onToggle("tract-unavailable")} />}
      {HATCHES_RURAL.has(flag) && <span className="legend-note">Rural tracts are shown separately; other tracts have non-rural or unavailable rural status.</span>}
      {filtering && <span className="legend-note">Only tracts matching your filters are shown.</span>}
    </div>
  );
}
