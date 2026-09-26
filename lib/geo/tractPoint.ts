/**
 * A tract's interior point, from the boundary files the app serves
 * (public/boundaries/tracts/{state}.json). Server-side; each state's file is
 * decoded once per server instance.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { featuresFrom } from "./stateBoundaries";
import { interiorPoint } from "./interiorPoint";

const cache = new Map<string, Map<string, [number, number] | null>>();

export function boundariesDir(): string {
  return process.env.OZ_BOUNDARIES_DIR ?? path.join(process.cwd(), "public", "boundaries");
}

export function tractPoint(geoid: string): [number, number] | null {
  if (!/^\d{11}$/.test(geoid)) return null;
  const state = geoid.slice(0, 2);
  let points = cache.get(state);
  if (!points) {
    points = new Map();
    try {
      const json = JSON.parse(readFileSync(path.join(boundariesDir(), "tracts", `${state}.json`), "utf8"));
      for (const f of featuresFrom(json, "tracts")) {
        points.set(String(f.properties.GEOID), interiorPoint(f.geometry as { type: string; coordinates: unknown }));
      }
    } catch {
      // No boundary file for this state: no point, and the snapshot says so.
    }
    cache.set(state, points);
  }
  return points.get(geoid) ?? null;
}
