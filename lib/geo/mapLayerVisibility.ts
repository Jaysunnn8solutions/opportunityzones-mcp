import type { FilterSpecification, LayerSpecification } from "maplibre-gl";

export type LegendItem = "tract-yes" | "tract-rural" | "tract-no" | "tract-unavailable" | "county-yes" | "county-no";

export function legendFilters(flag: string, hidden: readonly LegendItem[]): Record<string, FilterSpecification> {
  const hatches = flag === "eligible" || flag === "zone2027";
  const yes = ["==", ["get", flag], 1];
  const rural = ["==", ["get", "rural"], 1];
  const entries: Array<[LegendItem, unknown[]]> = [
    ["tract-yes", hatches ? ["all", yes, ["!", rural]] : yes],
    ...(hatches ? [["tract-rural", ["all", yes, rural]] as [LegendItem, unknown[]]] : []),
    ["tract-no", ["==", ["get", flag], 0]],
    ["tract-unavailable", ["==", ["coalesce", ["get", flag], -1], -1]],
  ];
  const combine = (items: Array<[LegendItem, unknown[]]>) => {
    const enabled = items.filter(([key]) => !hidden.includes(key)).map(([, condition]) => condition);
    return (enabled.length ? ["any", ...enabled] : ["==", ["get", "GEOID"], "__none__"]) as FilterSpecification;
  };
  const tracts = combine(entries);
  const counties = combine([["county-yes", ["==", ["get", "zones"], 1]], ["county-no", ["!=", ["get", "zones"], 1]]]);
  return {
    "tract-fill": tracts, "tract-line": tracts,
    "tract-rural-hatch": combine(entries.filter(([key]) => key === "tract-rural")),
    "county-fill": counties, "county-line": counties,
  };
}

/** Only the overlays are affected; basemap, selection, and source data stay intact. */
export function withLayerVisibility(layers: LayerSpecification[], hidden: readonly LegendItem[], flag: string): LayerSpecification[] {
  const filters = legendFilters(flag, hidden);
  return layers.map((layer) => filters[layer.id] ? { ...layer, filter: filters[layer.id] } as LayerSpecification : layer);
}
