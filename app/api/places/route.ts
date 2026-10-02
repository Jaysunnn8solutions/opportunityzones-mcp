import gazetteer from "@/data/place-names.json";
import { createPlaceIndex, findCities, type GazetteerRow } from "@/lib/geo/placeNames";
import { stateSummaries } from "@/lib/data/stateViews";
import { failure, limitRequest, readBody, sameOrigin } from "@/lib/access/http";

const index = createPlaceIndex(gazetteer.rows as GazetteerRow[]);
const headers = { "Cache-Control": "no-store" };

/** POST keeps search text out of URLs and access logs. Bundled data only. */
export async function POST(req: Request) {
  try { sameOrigin(req); limitRequest(req, "read"); } catch (error) { return failure(error); }
  let query: unknown;
  try { query = ((await readBody(req, 2000)) as { query?: unknown }).query; } catch {
    return Response.json({ error: "Expected a JSON search query." }, { status: 400, headers });
  }
  if (typeof query !== "string" || query.trim().length < 2 || query.length > 200) {
    return Response.json({ error: "Search must be 2–200 characters." }, { status: 400, headers });
  }
  return Response.json({ ...findCities(index, query, stateSummaries()), source: "U.S. Census Bureau, 2024 Gazetteer Files, Places", notice: "City points center the map; they do not define tract eligibility. Informational, not investment, tax, or legal advice." }, { headers });
}
