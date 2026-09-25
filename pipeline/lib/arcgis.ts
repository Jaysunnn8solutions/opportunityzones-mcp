/**
 * Attribute pulls from ArcGIS REST feature layers, for the federal sources that
 * publish through ArcGIS (HUD eGIS, EPA, DOT NTAD).
 *
 * Layers cap each response (often 2,000 rows), so every query pages with
 * `resultOffset`, ordered by the object id so pages cannot overlap or skip. The
 * total is taken from `returnCountOnly` first and asserted at the end: a page
 * silently truncated by the server would otherwise look like a complete list.
 */

import { fetchCached, log } from "./http";

export interface ArcgisQuery {
  /** Layer URL ending in /FeatureServer/<n> or /MapServer/<n>. */
  layer: string;
  outFields: readonly string[];
  where?: string;
  /** Rows per request; stay at or under the layer's maxRecordCount. */
  pageSize?: number;
  /** Prefix for cache files, unique per layer and vintage. */
  cacheKey: string;
}

type Attrs = Record<string, unknown>;

interface QueryResponse {
  features?: Array<{ attributes: Attrs }>;
  count?: number;
  error?: { code: number; message: string };
}

function parse(buf: Buffer, what: string): QueryResponse {
  const json = JSON.parse(buf.toString("utf8")) as QueryResponse;
  if (json.error) throw new Error(`ArcGIS error for ${what}: ${json.error.code} ${json.error.message}`);
  return json;
}

function queryUrl(q: ArcgisQuery, params: Record<string, string>): string {
  const u = new URL(`${q.layer}/query`);
  u.searchParams.set("where", q.where ?? "1=1");
  u.searchParams.set("f", "json");
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return u.toString();
}

/** Every row's attributes, no geometry. */
export async function queryAllAttributes(q: ArcgisQuery): Promise<Attrs[]> {
  const pageSize = q.pageSize ?? 2000;
  const countBuf = await fetchCached(queryUrl(q, { returnCountOnly: "true" }), `${q.cacheKey}-count.json`);
  const total = parse(countBuf, q.cacheKey).count;
  if (total == null) throw new Error(`ArcGIS layer ${q.cacheKey} returned no count`);

  // Advance by the rows actually returned: a layer may cap a page below the
  // requested size (tables often at 1,000), and stepping by pageSize would
  // silently skip the rest.
  const rows: Attrs[] = [];
  let offset = 0;
  while (offset < total) {
    const url = queryUrl(q, {
      outFields: q.outFields.join(","),
      returnGeometry: "false",
      orderByFields: "OBJECTID",
      resultOffset: String(offset),
      resultRecordCount: String(pageSize),
    });
    const page = parse(await fetchCached(url, `${q.cacheKey}-${offset}.json`), q.cacheKey);
    const got = page.features?.length ?? 0;
    if (got === 0) break;
    for (const f of page.features!) rows.push(f.attributes);
    offset += got;
  }
  if (rows.length !== total) {
    throw new Error(`ArcGIS layer ${q.cacheKey}: expected ${total} rows, got ${rows.length}`);
  }
  log(`arcgis ${q.cacheKey}: ${rows.length.toLocaleString("en-US")} rows`);
  return rows;
}
