"use client";
import type { PlaceResult } from "@/lib/client/place";
import { dateLabel, displayValue } from "@/lib/client/presentation";
import { selectedMeasures, sourceFor } from "@/lib/research/measures";
import { PlaceReportLink } from "./ResearchActions";

/** Large comparisons use one tract per row so 25 selections remain readable. */
export default function ComparisonRows({ ids, places, keys, brief, onRemove }: {
  ids: string[]; places: Record<string, PlaceResult | null>; keys: string[]; brief: boolean; onRemove: (id: string) => void;
}) {
  const measures = selectedMeasures(keys);
  return <table className="comparison-table comparison-rows"><caption>Selected tract facts · {ids.length} tracts · selection order</caption>
    <thead><tr><th scope="col">Census tract</th><th scope="col">2027 designation status</th>{measures.map((measure) => <th scope="col" key={measure.column}>{measure.label}<small>{measure.period}</small></th>)}<th scope="col">Dataset built</th></tr></thead>
    <tbody>{ids.map((id) => { const place = places[id]; return <tr key={id}>
      <th scope="row"><strong>{id}</strong><small>{place?.profile.county}, {place?.profile.state}</small><div className="no-print">{place && <PlaceReportLink place={place} from={brief ? "/brief" : "/compare"}>Full report</PlaceReportLink>}<button type="button" className="link" aria-label={`Remove tract ${id}`} onClick={() => onRemove(id)}>Remove</button></div></th>
      <td>{place?.profile.designation2027.text ?? "Unavailable"}</td>
      {measures.map((measure) => { const source = place && sourceFor(place.profile, measure.column); return <td key={measure.column}>{displayValue(place?.profile.measures[measure.column]?.value, measure.unit)}<small>{source ? <a href={source.url} target="_blank" rel="noreferrer">{source.publisher} · {source.vintage}</a> : "Source metadata unavailable"}</small></td>; })}
      <td>{dateLabel(place?.profile.publishedAt)}</td>
    </tr>; })}</tbody>
  </table>;
}
