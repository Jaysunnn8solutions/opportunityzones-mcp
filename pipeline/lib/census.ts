/**
 * ACS client for whole-nation, tract-level pulls.
 *
 * The fetch and error-translation approach is ported from census-mcp's
 * `lib/census/api.ts` rather than called over the network: that server is a
 * conversational tool with a 200-row cap and text-table output, which is the
 * right design there and the wrong one for 85,000 tracts. Sharing the code
 * keeps the hard-won error handling without making this build depend on a live
 * deployment.
 *
 * Three behaviors of the API are load-bearing and each is handled explicitly:
 *
 *  1. `for=tract:*&in=state:XX` returns every tract in a state in one response,
 *     with no county needed. `in=state:*` is rejected with HTTP 400, so there is
 *     no national shortcut and the per-state loop is mandatory.
 *  2. A missing or bad key comes back as HTTP 200 with an HTML page, so a naive
 *     JSON.parse fails with an unreadable error. Detected before parsing.
 *  3. Unavailable estimates are sentinels, not nulls: -666666666 and friends.
 *     Left as numbers they would silently poison every index and, worse, the
 *     statutory eligibility test.
 */

import { ACS_VINTAGE, VARS_PER_REQUEST, FETCH_CONCURRENCY, STATES, type State } from "../config";
import { censusApiKey } from "./env";
import { fetchCached, log, mapLimit } from "./http";

/** One tract's estimates, keyed by ACS variable code. */
export type AcsRow = Record<string, number | null>;

/** Tract GEOID (11 digits: state + county + tract) to its estimates. */
export type AcsTable = Map<string, AcsRow>;

/**
 * Census sentinels for suppressed, unavailable or not-applicable estimates.
 * The published set includes -666666666, -999999999, -888888888 and -222222222;
 * anything at or below the least-negative of them is a flag, not a value.
 *
 * Note what this does NOT do: top-coded medians (income reported as 250001,
 * rent as 3501) are real values at the cap and are kept. Callers that care
 * about the distinction use `isTopCoded`.
 */
export const SENTINEL_CEILING = -222222222;

export function toEstimate(raw: string | null | undefined): number | null {
  if (raw == null || raw === "" || raw === "null") return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  if (n <= SENTINEL_CEILING) return null;
  return n;
}

/** Medians the ACS top-codes. A value at the cap means "at least this". */
export function isTopCoded(code: string, value: number | null): boolean {
  if (value == null) return false;
  if (code.startsWith("B19013") || code.startsWith("B19113") || code.startsWith("B19301")) {
    return value >= 250001;
  }
  if (code.startsWith("B25077")) return value >= 2000001;
  if (code.startsWith("B25064")) return value >= 3501;
  return false;
}

/**
 * Short, stable fingerprint of a variable batch, so a cache file can never be
 * reused for a different set of variables. Without it, editing the variable
 * list re-batches the codes and a stale file for "batch 0" would be served for
 * a batch that now asks for something else.
 */
export function batchKey(codes: readonly string[]): string {
  let h = 0x811c9dc5;
  for (const ch of codes.join(",")) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Parse one Census response body into rows keyed by tract GEOID. */
export function parseTractResponse(text: string, codes: readonly string[]): AcsTable {
  if (text.trimStart().startsWith("<")) {
    const title = /<title>([^<]*)<\/title>/.exec(text)?.[1]?.trim() ?? "unknown error";
    throw new Error(
      `Census API returned an HTML error page ("${title}") with a success status. ` +
        `A missing or rejected CENSUS_API_KEY is the usual cause.`
    );
  }
  let table: unknown;
  try {
    table = JSON.parse(text);
  } catch {
    throw new Error(`Census API returned a body that is neither JSON nor HTML (${text.length} bytes)`);
  }
  if (!Array.isArray(table) || table.length === 0 || !Array.isArray(table[0])) {
    throw new Error("Census API returned an unexpected shape; expected an array of rows");
  }
  const rows = table as string[][];
  const header = rows[0];
  const at = (name: string) => header.indexOf(name);
  const iState = at("state");
  const iCounty = at("county");
  const iTract = at("tract");
  if (iState < 0 || iCounty < 0 || iTract < 0) {
    throw new Error(
      `Census response is missing geography columns (got ${header.join(",")}). ` +
        `Expected trailing state, county and tract columns.`
    );
  }
  const codeIndex = codes.map((c) => [c, at(c)] as const);
  const missing = codeIndex.filter(([, i]) => i < 0).map(([c]) => c);
  if (missing.length > 0) {
    throw new Error(`Census response omitted requested variables: ${missing.join(", ")}`);
  }

  const out: AcsTable = new Map();
  for (const r of rows.slice(1)) {
    const geoid = `${r[iState]}${r[iCounty]}${r[iTract]}`;
    const row: AcsRow = {};
    for (const [code, i] of codeIndex) row[code] = toEstimate(r[i]);
    out.set(geoid, row);
  }
  return out;
}

/**
 * Every tract in one state, for an arbitrary number of variables. Batched to
 * stay under the API's per-request field ceiling, cached per (vintage, state,
 * batch) so a failed run resumes instead of restarting.
 */
async function fetchState(
  state: State,
  vintage: number,
  codes: readonly string[]
): Promise<AcsTable> {
  const merged: AcsTable = new Map();
  const batches = chunk(codes, VARS_PER_REQUEST);

  for (const [b, batch] of batches.entries()) {
    const url =
      `https://api.census.gov/data/${vintage}/acs/acs5` +
      `?get=${batch.join(",")}&for=tract:*&in=state:${state.fips}` +
      `&key=${censusApiKey()}`;
    const buf = await fetchCached(url, `acs-${vintage}-${state.fips}-b${b}-${batchKey(batch)}.json`);
    const part = parseTractResponse(buf.toString("utf8"), batch);
    for (const [geoid, row] of part) {
      const existing = merged.get(geoid);
      if (existing) Object.assign(existing, row);
      else merged.set(geoid, row);
    }
  }
  return merged;
}

/**
 * Every tract in the nation for the given variables and vintage.
 *
 * Returns one map of ~85,000 entries. At ~80 variables that is a few hundred
 * megabytes of intermediate JSON on disk in the cache and roughly 60 MB in
 * memory — comfortable for an offline build, and the reason none of this
 * happens at request time.
 */
export async function fetchNationalTracts(
  codes: readonly string[],
  vintage: number = ACS_VINTAGE
): Promise<AcsTable> {
  if (codes.length === 0) throw new Error("fetchNationalTracts needs at least one variable");
  const batches = Math.ceil(codes.length / VARS_PER_REQUEST);
  log(
    `ACS ${vintage}: ${codes.length} variables x ${STATES.length} states ` +
      `= ${batches * STATES.length} requests (${batches} per state)`
  );

  const perState = await mapLimit(STATES, FETCH_CONCURRENCY, async (state) => {
    const table = await fetchState(state, vintage, codes);
    log(`ACS ${vintage}: ${state.usps} ${table.size} tracts`);
    return table;
  });

  const all: AcsTable = new Map();
  for (const table of perState) for (const [geoid, row] of table) all.set(geoid, row);
  log(`ACS ${vintage}: ${all.size.toLocaleString("en-US")} tracts nationally`);
  return all;
}

/**
 * State-level totals for the same variables, used as the denominators the
 * statutory income test compares a tract against.
 */
export async function fetchStateTotals(
  codes: readonly string[],
  vintage: number = ACS_VINTAGE
): Promise<Map<string, AcsRow>> {
  const out = new Map<string, AcsRow>();
  for (const [b, batch] of chunk(codes, VARS_PER_REQUEST).entries()) {
    const url =
      `https://api.census.gov/data/${vintage}/acs/acs5` +
      `?get=${batch.join(",")}&for=state:*&key=${censusApiKey()}`;
    const buf = await fetchCached(url, `acs-${vintage}-states-b${b}-${batchKey(batch)}.json`);
    const text = buf.toString("utf8");
    if (text.trimStart().startsWith("<")) {
      throw new Error("Census API returned an HTML error page for the state-level request");
    }
    const rows = JSON.parse(text) as string[][];
    const header = rows[0];
    const iState = header.indexOf("state");
    for (const r of rows.slice(1)) {
      const row = out.get(r[iState]) ?? {};
      for (const code of batch) row[code] = toEstimate(r[header.indexOf(code)]);
      out.set(r[iState], row);
    }
  }
  log(`ACS ${vintage}: state-level denominators for ${out.size} states`);
  return out;
}

/** The national figure for the same variables, the other statutory denominator. */
export async function fetchNationalTotals(
  codes: readonly string[],
  vintage: number = ACS_VINTAGE
): Promise<AcsRow> {
  const out: AcsRow = {};
  for (const [b, batch] of chunk(codes, VARS_PER_REQUEST).entries()) {
    const url =
      `https://api.census.gov/data/${vintage}/acs/acs5` +
      `?get=${batch.join(",")}&for=us:1&key=${censusApiKey()}`;
    const buf = await fetchCached(url, `acs-${vintage}-us-b${b}-${batchKey(batch)}.json`);
    const text = buf.toString("utf8");
    if (text.trimStart().startsWith("<")) {
      throw new Error("Census API returned an HTML error page for the national request");
    }
    const rows = JSON.parse(text) as string[][];
    const header = rows[0];
    for (const code of batch) out[code] = toEstimate(rows[1][header.indexOf(code)]);
  }
  return out;
}

/** Helpers shared by the shaping code. */
export function ratio(num: number | null, den: number | null): number | null {
  if (num == null || den == null || den === 0) return null;
  return Math.round((num / den) * 1e5) / 1e5;
}

export function sumCodes(row: AcsRow, codes: readonly string[]): number | null {
  let total = 0;
  let sawValue = false;
  for (const c of codes) {
    const v = row[c];
    if (v == null) continue;
    total += v;
    sawValue = true;
  }
  return sawValue ? total : null;
}
