/**
 * What each map layer means, for the hover explanations on the map and the
 * Map layers page. Two kinds of statement, kept apart:
 *  - `short` restates the law, and cites rules in lib/content/rules.ts, whose
 *    quotes are checked word for word against the official texts;
 *  - `mapped` says how this map draws the layer from its data, which is this
 *    tool's own method, and names the dataset in pipeline/sources.ts.
 */

import type { RuleId } from "./rules";

export type MapLayerId = "eligible" | "zone2027" | "oz2018" | "qct" | "dda" | "nmtc";

export interface MapLayerInfo {
  id: MapLayerId;
  title: string;
  /** One or two sentences, restating only what the cited rules say. */
  short: string;
  rules: RuleId[];
  /** How the map colours a tract for this layer (this tool's method). */
  mapped: string;
  /** The dataset in pipeline/sources.ts behind the layer. */
  sourceId: string;
}

export const MAP_LAYERS: Record<MapLayerId, MapLayerInfo> = {
  eligible: {
    id: "eligible",
    title: "2027 eligible",
    short:
      "A low-income census tract that can be nominated for the 2027 round of Opportunity Zones. Eligible is not designated: only tracts a governor nominates and Treasury certifies become zones.",
    rules: ["eligibility", "designatedNotEligible", "ruralFund"],
    mapped: "Coloured when Treasury's list of eligible tracts includes the tract. Hatching marks the tracts Treasury's list flags as rural.",
    sourceId: "oz2Eligible",
  },
  zone2027: {
    id: "zone2027",
    title: "2027 zone",
    short: "A tract designated as a 2027 Opportunity Zone. Zones certified in 2026 run from January 1, 2027, to December 31, 2036.",
    rules: ["designatedNotEligible", "zonePeriod"],
    mapped: "Coloured from Treasury's published designations. Where a state's list is not out yet, its eligible tracts show as pending.",
    sourceId: "oz2Designated",
  },
  oz2018: {
    id: "oz2018",
    title: "2018 zone",
    short:
      "A zone designated in 2018. It stays designated through December 31, 2028, but property bought there after December 31, 2026, generally does not qualify.",
    rules: ["zones2018", "boughtAfterStart"],
    mapped: "The 2018 zones are 2010 census tracts. A 2020 tract is coloured when at least half of its population lives in one. How the 2018 zones fared against comparable tracts is on the 2018 results page (/2018-zones).",
    sourceId: "oz1Designated",
  },
  qct: {
    id: "qct",
    title: "HUD Qualified Census Tract (QCT)",
    short:
      "A tract HUD designates for the low-income housing credit (LIHTC): at least half of households below 60% of area median gross income, or a poverty rate of at least 25%. A separate program from Opportunity Zones.",
    rules: ["hudQct"],
    mapped: "Coloured when the tract is on HUD's 2026 list of Qualified Census Tracts.",
    sourceId: "hudQct",
  },
  dda: {
    id: "dda",
    title: "HUD Difficult Development Area (DDA)",
    short:
      "An area HUD designates for the low-income housing credit (LIHTC) as having high construction, land and utility costs relative to area median gross income. A separate program from Opportunity Zones.",
    rules: ["hudDda"],
    mapped: "DDAs are drawn by ZIP-code area in metro areas and by larger areas outside them, not by tract. A tract is coloured when any of its land lies in a 2026 DDA.",
    sourceId: "hudDda",
  },
  nmtc: {
    id: "nmtc",
    title: "New Markets Tax Credit (NMTC) low-income community",
    short:
      "A tract that is a low-income community for the New Markets Tax Credit, a separate program: a poverty rate of at least 20%, or a median family income of at most 80% of its benchmark.",
    rules: ["otherProgramsNmtc"],
    mapped: "Coloured when the CDFI Fund's eligibility file (2016-2020 ACS) marks the tract as a low-income community.",
    sourceId: "nmtcLic",
  },
};
