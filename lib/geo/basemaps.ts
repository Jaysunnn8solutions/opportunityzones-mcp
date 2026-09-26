/**
 * Basemaps the screening map can draw under the tract colours.
 *
 * All of them are free for commercial use with no API key, and each is
 * registered in pipeline/sources.ts:
 *  - OpenFreeMap vector styles (OpenStreetMap data, ODbL). Crisp at every zoom,
 *    with road, water and place labels.
 *  - USGS National Map aerial imagery (NAIP, public domain), so a site can be
 *    seen on the ground.
 *
 * The map's own layers (county and tract fills and outlines) are merged into
 * whichever basemap is chosen, just beneath its first label layer, so street
 * and place names stay readable on top of the colours.
 */

import type { LayerSpecification, SourceSpecification, StyleSpecification } from "maplibre-gl";

export type BasemapId = "light" | "streets" | "imagery";

export interface Basemap {
  id: BasemapId;
  label: string;
  /** A style URL (vector) or a complete style object (raster). */
  style: string | StyleSpecification;
  /** How opaque tract and county fills are drawn over this basemap. */
  fillOpacity: number;
  sourceId: "openFreeMap" | "usgsNationalMap";
}

const USGS = "https://basemap.nationalmap.gov/arcgis/rest/services";

export const BASEMAPS: Record<BasemapId, Basemap> = {
  light: {
    id: "light",
    label: "Light",
    style: "https://tiles.openfreemap.org/styles/positron",
    fillOpacity: 0.55,
    sourceId: "openFreeMap",
  },
  streets: {
    id: "streets",
    label: "Streets",
    style: "https://tiles.openfreemap.org/styles/liberty",
    fillOpacity: 0.45,
    sourceId: "openFreeMap",
  },
  imagery: {
    id: "imagery",
    label: "Aerial",
    style: {
      version: 8,
      // Glyphs are needed only if a symbol layer is ever added on top.
      glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
      sources: {
        "usgs-imagery": {
          type: "raster",
          // USGSImageryTopo: NAIP imagery with US Topo roads and names baked in.
          tiles: [`${USGS}/USGSImageryTopo/MapServer/tile/{z}/{y}/{x}`],
          tileSize: 256,
          maxzoom: 16,
          attribution: "USGS The National Map: orthoimagery (NAIP) and US Topo",
        },
      },
      layers: [{ id: "usgs-imagery", type: "raster", source: "usgs-imagery" }],
    },
    fillOpacity: 0.35,
    sourceId: "usgsNationalMap",
  },
};

export const DEFAULT_BASEMAP: BasemapId = "light";

export function isBasemapId(v: unknown): v is BasemapId {
  return typeof v === "string" && Object.hasOwn(BASEMAPS, v);
}

export interface Overlay {
  sources: Record<string, SourceSpecification>;
  layers: LayerSpecification[];
}

/**
 * The basemap with the map's own sources and layers merged in. Overlay layers
 * go just before the basemap's first symbol (label) layer, or on top when it
 * has none (the raster imagery). Overlay ids win over any basemap id they
 * collide with, so the map's click handlers always find their layers.
 */
export function withOverlay(base: StyleSpecification, overlay: Overlay): StyleSpecification {
  const ours = new Set(overlay.layers.map((l) => l.id));
  const baseLayers = base.layers.filter((l) => !ours.has(l.id));
  const firstSymbol = baseLayers.findIndex((l) => l.type === "symbol");
  const at = firstSymbol < 0 ? baseLayers.length : firstSymbol;
  return {
    ...base,
    sources: { ...base.sources, ...overlay.sources },
    layers: [...baseLayers.slice(0, at), ...overlay.layers, ...baseLayers.slice(at)],
  };
}
