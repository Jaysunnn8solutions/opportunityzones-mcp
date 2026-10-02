// @vitest-environment jsdom
import { act, createElement, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import type { LayerSpecification } from "maplibre-gl";
import { featureFilter } from "@maplibre/maplibre-gl-style-spec";
import { legendFilters, withLayerVisibility } from "@/lib/geo/mapLayerVisibility";
import MapLegendItem from "@/app/ui/MapLayerControls";

it("toggles only the matching legend category, including rural, unknown, and county categories", () => {
  const samples = [{ eligible: 1, rural: 0 }, { eligible: 1, rural: 1 }, { eligible: 0, rural: 1 }, { eligible: -1, rural: -1 }];
  const shown = (hidden: Parameters<typeof legendFilters>[1]) => {
    const filter = featureFilter(legendFilters("eligible", hidden)["tract-fill"], "filter").filter;
    return samples.map((properties) => filter({ zoom: 10 }, { type: 3, properties }));
  };
  expect(shown([])).toEqual([true, true, true, true]);
  expect(shown(["tract-yes"])).toEqual([false, true, true, true]);
  expect(shown(["tract-rural"])).toEqual([true, false, true, true]);
  expect(shown(["tract-no", "tract-unavailable"])).toEqual([true, true, false, false]);
  expect(shown(["tract-yes", "tract-rural", "tract-no", "tract-unavailable"])).toEqual([false, false, false, false]);
  const county = featureFilter(legendFilters("eligible", ["county-yes"])["county-fill"], "filter").filter;
  expect(county({ zoom: 4 }, { type: 3, properties: { zones: 1 } })).toBe(false);
  expect(county({ zoom: 4 }, { type: 3, properties: { zones: 0 } })).toBe(true);
});

it("keeps hidden layers off across rebuilt styles while retaining paint, filters, and selected outlines", () => {
  const layers: LayerSpecification[] = [
    { id: "tract-fill", type: "fill", source: "tracts", paint: { "fill-color": "#00bfff" }, filter: ["==", "eligible", 1] },
    { id: "tract-line", type: "line", source: "tracts" },
    { id: "tract-selected", type: "line", source: "tracts" },
    { id: "basemap", type: "background" },
  ];
  const rebuilt = withLayerVisibility(layers, ["tract-yes"], "eligible");
  expect(rebuilt[0]).toMatchObject({ paint: { "fill-color": "#00bfff" }, filter: legendFilters("eligible", ["tract-yes"])["tract-fill"] });
  expect(rebuilt[1]).toMatchObject({ filter: legendFilters("eligible", ["tract-yes"])["tract-line"] });
  expect(rebuilt[2]).toBe(layers[2]); expect(rebuilt[3]).toBe(layers[3]);
  expect(withLayerVisibility(rebuilt, [], "eligible")[0]).toMatchObject({ filter: legendFilters("eligible", [])["tract-fill"] });
  expect(layers[0].layout).toBeUndefined();
});

it("offers labeled native checkboxes that independently hide and restore a layer", async () => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  function Harness() {
    const [checked, setChecked] = useState(true);
    return createElement(MapLegendItem, { label: "Eligible for 2027", swatch: { background: "#00bfff" }, checked, onToggle: () => setChecked((value) => !value) });
  }
  try {
    await act(async () => root.render(createElement(Harness)));
    const inputs = [...host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
    expect(inputs).toHaveLength(1); expect(inputs[0].checked).toBe(true);
    expect(inputs[0].closest("label")?.textContent).toBe("Eligible for 2027");
    expect(inputs[0].closest("label")?.querySelector(".swatch")).not.toBeNull();
    await act(async () => inputs[0].click());
    expect(inputs[0].checked).toBe(false);
    await act(async () => inputs[0].click()); expect(inputs[0].checked).toBe(true);
  } finally { await act(async () => root.unmount()); host.remove(); }
});
