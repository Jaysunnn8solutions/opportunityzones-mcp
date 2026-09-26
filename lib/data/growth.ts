/** The 2018-zone lift results (pipeline/oz1/growth.ts), read on the server. */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { GrowthOutput } from "@/pipeline/oz1/growth";
import { dataDir } from "./tracts";

export type Growth = GrowthOutput;

let cache: Growth | null | undefined;

export function loadGrowth(): Growth | null {
  if (cache !== undefined) return cache;
  const file = path.join(dataDir(), "oz1", "growth.json");
  cache = existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as Growth) : null;
  return cache;
}
