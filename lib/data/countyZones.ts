/**
 * The zoomed-out map's county rule, shared by the server (lib/data/status.ts)
 * and the browser (the map), so it has no server imports.
 */

/**
 * [tracts, eligible tracts, designated 2027 tracts, eligible tracts still
 * pending]. Pending means the county's state has no published 2027 list yet,
 * so its eligible tracts could still be designated.
 */
export type CountyCounts = [tracts: number, eligible: number, designated: number, pending: number];

/**
 * Whether a county is shown as having zones: any designated 2027 tract, or,
 * while its state's list is unpublished, any eligible tract.
 */
export function countyHasZones([, , designated, pending]: CountyCounts): boolean {
  return designated > 0 || pending > 0;
}
