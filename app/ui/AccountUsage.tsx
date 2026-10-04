import { useId, useState } from "react";
import { EXPORT_ROW_LIMIT, type AllowanceSummary } from "@/lib/access/allowance";

export default function AccountUsage({ allowances, asOf }: { allowances?: AllowanceSummary; asOf?: number }) {
  const heading = useId();
  const [plannedRows, setPlannedRows] = useState("25");
  if (!allowances) return <p role="status">Usage is unavailable. Refresh your account before downloading.</p>;
  const count = (value: number) => value.toLocaleString("en-US");
  const inherited = allowances.some((item) => item.browserUsed > item.accountUsed);
  return <section className="account-usage" aria-labelledby={heading}>
    <h3 id={heading}>Download usage & remaining allowance</h3>
    <p>Up to {count(EXPORT_ROW_LIMIT)} tract rows per export. Both rolling windows apply to each new download.</p>
    <div className="table-wrap" role="region" aria-label="Download usage, scroll horizontally" tabIndex={0}>
      <table className="rules"><caption>Current export allowances</caption><thead><tr><th scope="col">Window</th><th scope="col">Measure</th><th scope="col">Used / limit</th><th scope="col">Remaining</th></tr></thead>
        <tbody>{allowances.map((item) => <tr key={item.key}>
          <th scope="row">{item.period}</th><td>{item.label}</td>
          <td><strong>{count(item.used)} / {count(item.limit)}</strong><meter min={0} max={item.limit} value={Math.min(item.used, item.limit)} aria-label={`${item.label} used in ${item.period}`} />{item.browserUsed > item.accountUsed && <small>Account: {count(item.accountUsed)} · browser: {count(item.browserUsed)}</small>}</td>
          <td><strong>{count(item.remaining)}</strong>{item.nextReleaseAt && <small>Usage begins expiring {new Date(item.nextReleaseAt).toLocaleString("en-US")}</small>}</td>
        </tr>)}</tbody>
      </table>
    </div>
    {inherited && <p className="hint">Prior activity in this browser reduces the remaining allowance. The stricter account or browser limit applies; the two counts are not added together.</p>}
    <div className="allowance-planner"><label className="scope-field">Estimate a new download · tract rows<input type="number" min={1} max={EXPORT_ROW_LIMIT} step={1} value={plannedRows} onChange={(event) => setPlannedRows(event.target.value)} /></label><p role="status">{!/^\d+$/.test(plannedRows) || Number(plannedRows) < 1 || Number(plannedRows) > EXPORT_ROW_LIMIT ? `Enter 1–${EXPORT_ROW_LIMIT} rows.` : `This would use 1 export and ${Number(plannedRows).toLocaleString("en-US")} rows. ${allowances.every((item) => item.remaining >= (item.action === "exports" ? 1 : Number(plannedRows))) ? "Fits your current account and browser allowances." : "Exceeds a current allowance; wait for usage to expire or choose fewer rows."}`}</p><p className="hint">An estimate only; no allowance is reserved or used.</p></div>
    <p className="hint">Each download counts toward both its export and row limits. Usage expires individually after 24 hours or 30 days, rather than resetting at midnight. Exact file retries within one hour do not count again. Shared service capacity also applies.{asOf ? ` Updated ${new Date(asOf).toLocaleString("en-US")}.` : ""}</p>
  </section>;
}
