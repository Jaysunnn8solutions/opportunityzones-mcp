/**
 * Which tracts border which, from the boundary files the app serves
 * (public/boundaries/tracts/{state}.json). The files are TopoJSON, so two
 * tracts are neighbours when they share an arc of boundary (touching at a
 * single corner does not count). Tracts in a neighbouring state are not
 * included. Server-side; each state is worked out once per server instance.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { neighbors } from "topojson-client";
import { boundariesDir } from "./tractPoint";

const cache = new Map<string, Map<string, string[]>>();

interface Topology {
  type: "Topology";
  objects: { tracts: { type: "GeometryCollection"; geometries: Array<{ properties?: { GEOID?: string } }> } };
}

/** GEOID -> the GEOIDs of the tracts sharing a boundary with it, for one state. Empty if there is no file. */
export function stateNeighbors(state: string): Map<string, string[]> {
  if (!/^\d{2}$/.test(state)) return new Map();
  let out = cache.get(state);
  if (out) return out;
  out = new Map();
  try {
    const topo = JSON.parse(readFileSync(path.join(boundariesDir(), "tracts", `${state}.json`), "utf8")) as Topology;
    out = neighborsFromTopology(topo);
  } catch {
    // No boundary file (or not TopoJSON): no neighbours, and callers show none.
  }
  cache.set(state, out);
  return out;
}

/** Exported for tests. */
export function neighborsFromTopology(topo: Topology): Map<string, string[]> {
  const geoms = topo.objects.tracts.geometries;
  const ids = geoms.map((g) => String(g.properties?.GEOID ?? ""));
  const adj = neighbors(geoms as never) as number[][];
  const out = new Map<string, string[]>();
  adj.forEach((list, i) => out.set(ids[i], list.map((j) => ids[j])));
  return out;
}
