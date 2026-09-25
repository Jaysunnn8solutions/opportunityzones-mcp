/**
 * Plain-language reason for Treasury's rural flag on a tract. Shared by the
 * pipeline (pipeline/oz2/rural.ts) and the runtime (lib/data/tracts.ts), so
 * the wording cannot drift between them.
 *
 * Treasury's flag is the authority. The block-based reproduction supplies the
 * why: verified where the two agree, the likely cause where they do not.
 */

export type ExplanationStatus = "verified" | "unverified" | "not-computed";

export interface Exclusion {
  reason: "city" | "urban-area";
  cityName: string;
  cityPopulation: number;
  urbanArea?: string | null;
}

export function ruralExplanation(
  treasuryRural: boolean,
  byBlocks: { rural: true } | ({ rural: false } & Exclusion) | null
): { status: ExplanationStatus; text: string } {
  if (byBlocks == null) {
    return {
      status: "not-computed",
      text: treasuryRural
        ? "Treasury classifies this tract as rural. No block data covers this island area, so the reason is not reproduced."
        : "Treasury does not classify this tract as rural. No block data covers this island area, so the reason is not reproduced.",
    };
  }
  const where = (v: Exclusion) =>
    v.reason === "city"
      ? `it contains part of ${v.cityName} (${v.cityPopulation.toLocaleString("en-US")} people in 2020)`
      : `it contains part of the ${v.urbanArea} urban area, which touches ${v.cityName} (${v.cityPopulation.toLocaleString("en-US")} people in 2020)`;
  if (byBlocks.rural && treasuryRural) {
    return { status: "verified", text: "Rural: no part of the tract lies in a city over 50,000 or in an urban area touching one." };
  }
  if (!byBlocks.rural && !treasuryRural) return { status: "verified", text: `Not rural: ${where(byBlocks)}.` };
  if (treasuryRural && !byBlocks.rural) {
    return {
      status: "unverified",
      text:
        `Treasury classifies this tract as rural. By blocks alone ${where(byBlocks)}; ` +
        "Treasury's method excludes detached parts of an urban area that do not themselves touch the city, which is the likely reason.",
    };
  }
  return {
    status: "unverified",
    text:
      "Treasury does not classify this tract as rural. No block of it lies in a city over 50,000 or in an urban area sharing a block with one; " +
      "the likely reason is an urban area that touches such a city only along a boundary.",
  };
}
