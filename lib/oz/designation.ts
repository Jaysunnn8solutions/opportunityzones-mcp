/**
 * Where a tract stands in the 2027 designation round, in words a person can
 * act on: eligible and pending, or out of the round.
 *
 * Eligibility (Treasury's list) is not designation. Each governor nominates
 * from the state's eligible tracts, up to the cap in § 1400Z-1(d) (25 percent
 * of eligible low-income communities, or up to 25 where a state has fewer than
 * 100), and Treasury certifies them for zones that take effect on
 * 2027-01-01. Until Treasury publishes the list (pipeline/oz2/designated.ts),
 * every eligible tract is "pending": never "not designated".
 */

import { stateCap } from "./eligibility";

/** Flip when pipeline/oz2/designated.ts output is published into data/. */
export const DESIGNATIONS_PUBLISHED = false;

export type DesignationStatus = "pending" | "not-eligible" | "unknown";

export interface DesignationOutlook {
  status: DesignationStatus;
  /** Eligible tracts in the tract's state or territory. */
  stateEligible: number;
  /** The most the state may designate. */
  stateCap: number;
  /** One or two sentences, no advice. */
  text: string;
}

export function designationOutlook(eligible: number | null, stateName: string | null, stateEligible: number): DesignationOutlook {
  const cap = stateCap(stateEligible);
  const where = stateName ?? "The state";
  if (eligible === 1) {
    return {
      status: "pending",
      stateEligible,
      stateCap: cap,
      text:
        `Eligible; 2027 designation pending. ${where} may designate up to ${cap.toLocaleString("en-US")} of its ` +
        `${stateEligible.toLocaleString("en-US")} eligible tracts; the governor nominates and Treasury certifies, for zones ` +
        "that take effect January 1, 2027. The list is not yet published.",
    };
  }
  if (eligible === 0) {
    return {
      status: "not-eligible",
      stateEligible,
      stateCap: cap,
      text:
        "Cannot be designated in the 2027 round: only tracts on Treasury's eligible list can be, and the exception for " +
        "tracts next to a zone was repealed.",
    };
  }
  return {
    status: "unknown",
    stateEligible,
    stateCap: cap,
    text: "2027 eligibility could not be determined from Treasury's file, so its place in the designation round is unknown.",
  };
}
