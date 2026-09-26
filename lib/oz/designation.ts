/**
 * Where a tract stands in the 2027 designation round, in words a person can
 * act on.
 *
 * Eligibility (Treasury's list) is not designation. Each governor nominates
 * from the state's eligible tracts, up to the cap in § 1400Z-1(d) (25 percent
 * of eligible low-income communities, or up to 25 where a state has fewer than
 * 100), and Treasury certifies them for zones that take effect on 2027-01-01.
 * Treasury may certify states in batches (pipeline/oz2/designated.ts), so a
 * tract is "not designated" only once its own state's list is out; until then
 * it is "pending", never "not designated".
 */

import { stateCap } from "./eligibility";

export type DesignationStatus = "designated" | "not-designated" | "pending" | "not-eligible" | "unknown";

export interface DesignationOutlook {
  status: DesignationStatus;
  /** Eligible tracts in the tract's state or territory. */
  stateEligible: number;
  /** The most the state may designate. */
  stateCap: number;
  /** When Treasury certified the state's list (YYYY-MM-DD), or null if not yet. */
  certifiedOn: string | null;
  /** One or two sentences, no advice. */
  text: string;
}

function longDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
}

/**
 * @param eligible 1/0/null from Treasury's eligible list.
 * @param designated 1/0/null from the published designations (null: pending or not published).
 * @param certifiedOn When the state's list was certified, or null.
 */
export function designationOutlook(
  eligible: number | null,
  stateName: string | null,
  stateEligible: number,
  designated: number | null = null,
  certifiedOn: string | null = null
): DesignationOutlook {
  const cap = stateCap(stateEligible);
  const base = { stateEligible, stateCap: cap, certifiedOn };
  const where = stateName ?? "The state";
  const when = certifiedOn ? ` (certified ${longDate(certifiedOn)})` : "";

  if (designated === 1) {
    return {
      ...base,
      status: "designated",
      text:
        `Designated 2027 Opportunity Zone${when}. The new zones run from January 1, 2027, for ten years.` +
        (eligible === 0 ? " Note: Treasury's eligible list does not include this tract; check the certified list." : ""),
    };
  }
  if (eligible === 0) {
    return {
      ...base,
      status: "not-eligible",
      text:
        "Cannot be designated in the 2027 round: only tracts on Treasury's eligible list can be, and the exception for " +
        "tracts next to a zone was repealed.",
    };
  }
  if (eligible === 1 && designated === 0) {
    return {
      ...base,
      status: "not-designated",
      text: `Eligible, but not designated: ${stateName ? `${stateName}'s` : "the state's"} 2027 list${when} does not include it.`,
    };
  }
  if (eligible === 1) {
    return {
      ...base,
      status: "pending",
      text:
        `Eligible; 2027 designation pending. ${where} may designate up to ${cap.toLocaleString("en-US")} of its ` +
        `${stateEligible.toLocaleString("en-US")} eligible tracts; the governor nominates and Treasury certifies, for zones ` +
        "that take effect January 1, 2027. The list is not yet published for this state.",
    };
  }
  return {
    ...base,
    status: "unknown",
    text: "2027 eligibility could not be determined from Treasury's file, so its place in the designation round is unknown.",
  };
}
