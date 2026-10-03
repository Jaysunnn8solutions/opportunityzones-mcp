import { failure, json, limitRequest, readBody, requireMember, sameOrigin } from "@/lib/access/http";
import { buildExport, generateExport, prepareExport, exportBudgets, exportRows } from "@/lib/access/exports";
import { AccessError, DAY, checkBudgets, db } from "@/lib/access/store";
import { loadTractData } from "@/lib/data/tracts";

export const runtime = "nodejs";
export async function POST(req: Request) {
  try {
    sameOrigin(req); const account = (await requireMember(req)); (await limitRequest(req, "download", account));
    const body = await readBody(req, 64_000);
    if (body.preview === true) {
      const prepared = prepareExport(body.input);
      const { payload, manifest } = loadTractData();
      const missing = Object.fromEntries(prepared.columns.map((column) => [column, prepared.geoids.reduce((sum, id) => { const index = payload.indexOf(id); return sum + (index < 0 || payload.columns.get(column)?.get(index) == null ? 1 : 0); }, 0)]));
      let allowance: { available: boolean; message: string; resetsAt: string | null } = { available: true, message: "This new export fits your current account and shared allowances.", resetsAt: null };
      try { (await checkBudgets(db(), [...exportBudgets(account.id, prepared.research ? 0 : prepared.geoids.length, !!prepared.research), { subject: "service", action: "exports", limit: 100, window: DAY }])); }
      catch (error) { if (!(error instanceof AccessError)) throw error; allowance = { available: false, message: error.message, resetsAt: new Date(Date.now() + error.retryAfter * 1000).toISOString() }; }
      if (prepared.geoids.length > 500 && !prepared.research) allowance = { available: false, message: "Narrow the search or explicitly select a subset of up to 500 rows.", resetsAt: null };
      const sample = prepared.research ? undefined : {
        columns: [{ name: "geoid", unit: "11-character text" }, { name: "county", unit: "text" }, { name: "state", unit: "text" }, { name: "designation_2027", unit: "category" }, { name: "eligible_2027", unit: "boolean" }, { name: "rural_2027", unit: "boolean" }, ...prepared.columns.map((name) => ({ name, unit: manifest.columns.find((c) => c.name === name)?.unit ?? "See dictionary" }))],
        rows: exportRows(prepared.geoids.slice(0, 3), prepared.columns),
      };
      return json({ total: prepared.total, selected: prepared.geoids.length, version: prepared.version, missing, fields: prepared.columns.length + 6, allowance, sample });
    }
    const result: ReturnType<typeof buildExport> | { body: Uint8Array; filename: string; mime: string } = (await generateExport(account.id, body.id, body.input));
    return new Response(new Uint8Array(result.body), { headers: { "Content-Type": result.mime, "Content-Disposition": `attachment; filename="${result.filename}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error) { return failure(error); }
}
