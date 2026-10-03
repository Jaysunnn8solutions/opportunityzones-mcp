import { z } from "zod";
import { failure, json, limitRequest, readBody, sameOrigin, session } from "@/lib/access/http";
import { AccessError } from "@/lib/access/store";
import { authorizeFilters, searchRows } from "@/lib/access/search";
import { coverage, baseline } from "@/lib/research/catalog";
import { RESEARCH_COLUMNS } from "@/lib/research/workbench";
import { compileCriteria } from "@/lib/explore/evidence";
import { loadTractData } from "@/lib/data/tracts";
import { readFileSync } from "node:fs";
import path from "node:path";
import { canResearchTract } from "@/lib/data/researchScope";
import { RESEARCH_SCOPE_NOTICE } from "@/lib/oz/researchScope";

const schema = z.object({ action: z.enum(["impact", "coverage", "baseline", "match", "boundary"]), state: z.string().regex(/^\d{2}$/).optional(), column: z.string().refine((v) => RESEARCH_COLUMNS.includes(v)).optional(), geoid: z.string().regex(/^\d{11}$/).optional(), geoids: z.array(z.string().regex(/^\d{11}$/)).max(500).optional(), scope: z.enum(["tract", "county", "state", "selection"]).optional(), filters: z.unknown().optional(), vintage: z.enum(["2010", "2020"]).optional() }).strict();
let crosswalkCache: { pairs: Array<[string, string, number, number, number]>; generated: string } | undefined;
export async function POST(req: Request) {
  try {
    sameOrigin(req); const account = (await session(req)); (await limitRequest(req, "read", account));
    const parsed = schema.safeParse(await readBody(req, 32_000)); if (!parsed.success) throw new AccessError("Choose valid research parameters.", 400);
    const body = parsed.data;
    if (body.action === "coverage") return json({ groups: coverage(body.column ?? "population", body.state), version: loadTractData().manifest.generated });
    if (body.action === "baseline") {
      if (!body.geoid) throw new AccessError("Choose a tract first.", 400);
      if (loadTractData().payload.indexOf(body.geoid) < 0) throw new AccessError("This tract is absent from the published dataset.", 404);
      if (!canResearchTract(body.geoid) || body.geoids?.some((id) => !canResearchTract(id))) throw new AccessError(RESEARCH_SCOPE_NOTICE, 403);
      if ((body.geoids?.length ?? 0) > (account ? 500 : 2)) throw new AccessError("Sign in to summarize a larger explicit selection.", 401);
      return json(baseline(body.column ?? "population", body.geoid, body.scope ?? "tract", body.geoids ?? []));
    }
    if (body.action === "match") {
      if (!account && (body.geoids?.length ?? 0) > 2) throw new AccessError("A free account is required to match more than two tracts at once.", 401);
      const { payload } = loadTractData(); const ids = [...new Set(body.geoids ?? [])];
      return json({ matched: ids.filter((id) => canResearchTract(id)), absent: ids.filter((id) => payload.indexOf(id) < 0), excluded: ids.filter((id) => payload.indexOf(id) >= 0 && !canResearchTract(id)), scopeNotice: RESEARCH_SCOPE_NOTICE });
    }
    if (body.action === "impact") {
      const filters = authorizeFilters(body.filters, !!account); const { data, groups } = searchRows(body.state ?? "", filters, "geoid"); const evaluate = compileCriteria(groups[0], filters);
      let included = 0, excluded = 0, unknown = 0;
      for (const row of data.rows) { const evidence = evaluate(row); if (evidence.some((e) => e.result === "Does not meet")) excluded++; else if (evidence.some((e) => e.result === "Unknown")) unknown++; else included++; }
      return json({ included, excluded, unknown, total: data.rows.length, version: data.generated });
    }
    if (!body.geoid) throw new AccessError("Enter a tract identifier.", 400);
    const crosswalk = crosswalkCache ??= JSON.parse(readFileSync(path.join(process.cwd(), "data", "research-crosswalk.json"), "utf8")) as NonNullable<typeof crosswalkCache>;
    const index = body.vintage === "2010" ? 0 : 1;
    if (index === 1 && !canResearchTract(body.geoid)) throw new AccessError(RESEARCH_SCOPE_NOTICE, 403);
    const pairs = crosswalk.pairs.filter((pair) => pair[index] === body.geoid && canResearchTract(pair[1]));
    const totals = pairs.reduce((a, p) => [a[0] + p[2], a[1] + p[3], a[2] + p[4]], [0, 0, 0]);
    return json({ pairs, totals, generated: crosswalk.generated, source: "blockRelationship", note: "2010/2020 block relationship allocation. Weights approximate within-block distribution; an unchanged identifier alone does not establish an unchanged boundary. Connecticut uses the documented planning-region identifier crosswalk." });
  } catch (error) { return failure(error); }
}
