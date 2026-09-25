import { z } from "zod";
import { getTract } from "../data/tracts";
import { geocodeAddress } from "../sources/censusGeocoder/client";
import { SourceError } from "../sources/http";
import { DESCRIPTION_SUFFIX, error, placeLine, readOnlyLive, STATUS_SOURCES, statusLines, text, unavailable } from "./shared";

export const checkAddressConfig = {
  title: "Check an address",
  description:
    "Find the census tract for a U.S. street address with the Census Geocoder, then report its Opportunity Zone status: " +
    "2027 designation eligibility (Treasury), rural status with the reason, whether it is in a 2018 zone, and stacking " +
    "designations (HUD QCT/DDA, NMTC). Returns the tract GEOID and coordinates for get_tract and nearby. The address is " +
    "sent only to the Census Bureau and is not stored or logged." +
    DESCRIPTION_SUFFIX,
  inputSchema: z
    .object({ address: z.string().min(5).max(200).describe("One-line U.S. street address, e.g. '1 Main St, Springfield, IL 62701'.") })
    .strict(),
  annotations: readOnlyLive,
};

export async function checkAddressHandler({ address }: { address: string }) {
  let matches;
  try {
    matches = await geocodeAddress(address);
  } catch (err) {
    if (err instanceof SourceError && err.kind === "rejected") return error("The address could not be looked up. Check it is a U.S. street address.");
    return error(unavailable("Census Geocoder", err));
  }
  if (matches.length === 0) {
    return error("The Census Geocoder found no match for that address. Try the full street address with city, state and ZIP.");
  }
  const [m, ...others] = matches;
  const t = getTract(m.geoid);
  const lines = [
    `# ${m.matchedAddress ?? "Matched address"}`,
    `Tract ${m.geoid} at ${m.lat.toFixed(5)}, ${m.lon.toFixed(5)} (use these with nearby).`,
  ];
  if (!t) {
    lines.push("", "This tract is not in Treasury's 2027 tract list, so no Opportunity Zone status is available for it.");
  } else {
    lines.push("", placeLine(t), "", ...statusLines(t));
  }
  if (others.length > 0) {
    lines.push("", "Other candidate matches:", ...others.map((o) => `- ${o.matchedAddress ?? "(unnamed)"}: tract ${o.geoid}`));
  }
  return text(lines.join("\n"), ["censusGeocoder", ...STATUS_SOURCES]);
}
