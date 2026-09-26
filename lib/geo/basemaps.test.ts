import type { LayerSpecification, StyleSpecification } from "maplibre-gl";
import { describe, expect, it } from "vitest";
import { SOURCES } from "@/pipeline/sources";
import { BASEMAPS, DEFAULT_BASEMAP, isBasemapId, withOverlay, type Overlay } from "./basemaps";

const overlay: Overlay = {
  sources: { tracts: { type: "geojson", data: { type: "FeatureCollection", features: [] } } },
  layers: [
    { id: "tract-fill", type: "fill", source: "tracts" },
    { id: "tract-line", type: "line", source: "tracts" },
  ],
};

const vector: StyleSpecification = {
  version: 8,
  sources: { osm: { type: "vector", url: "https://example.test/planet" } },
  layers: [
    { id: "background", type: "background" },
    { id: "water", type: "fill", source: "osm", "source-layer": "water" },
    { id: "road-label", type: "symbol", source: "osm", "source-layer": "transportation_name" },
    { id: "place-label", type: "symbol", source: "osm", "source-layer": "place" },
  ] as LayerSpecification[],
};

describe("basemaps", () => {
  it("puts overlay layers beneath the first label layer", () => {
    const ids = withOverlay(vector, overlay).layers.map((l) => l.id);
    expect(ids).toEqual(["background", "water", "tract-fill", "tract-line", "road-label", "place-label"]);
  });

  it("puts overlay layers on top of a basemap with no labels", () => {
    const style = BASEMAPS.imagery.style as StyleSpecification;
    const ids = withOverlay(style, overlay).layers.map((l) => l.id);
    expect(ids).toEqual(["usgs-imagery", "tract-fill", "tract-line"]);
  });

  it("keeps both sets of sources, and the overlay's win on a clash", () => {
    const clash: StyleSpecification = { ...vector, sources: { ...vector.sources, tracts: { type: "vector", url: "x" } } };
    const merged = withOverlay(clash, overlay);
    expect(Object.keys(merged.sources).sort()).toEqual(["osm", "tracts"]);
    expect(merged.sources.tracts.type).toBe("geojson");
  });

  it("replaces a basemap layer that reuses an overlay id", () => {
    const clash: StyleSpecification = { ...vector, layers: [...vector.layers, { id: "tract-fill", type: "background" }] };
    const layers = withOverlay(clash, overlay).layers.filter((l) => l.id === "tract-fill");
    expect(layers).toHaveLength(1);
    expect(layers[0].type).toBe("fill");
  });

  it("registers every basemap's source and needs no key", () => {
    for (const b of Object.values(BASEMAPS)) {
      expect(SOURCES).toHaveProperty(b.sourceId);
      const urls = typeof b.style === "string" ? [b.style] : JSON.stringify(b.style).match(/https:\/\/[^"]+/g) ?? [];
      for (const u of urls) expect(u).not.toMatch(/key=|token=/i);
    }
  });

  it("validates ids from the URL hash", () => {
    expect(isBasemapId(DEFAULT_BASEMAP)).toBe(true);
    expect(isBasemapId("imagery")).toBe(true);
    expect(isBasemapId("toString")).toBe(false);
    expect(isBasemapId(undefined)).toBe(false);
  });
});
