/**
 * The status badges used everywhere a tract is shown: one visual language
 * for designation, rural, the 2018 zones and the stacking incentives.
 */

export interface BadgeInput {
  designation: "designated" | "not-designated" | "pending" | "not-eligible" | "unknown";
  rural: boolean | null;
  zone2018Share: number | null;
  qct?: number | null;
  dda?: number | null;
  nmtc?: number | null;
}

const LABEL: Record<BadgeInput["designation"], [string, string]> = {
  designated: ["Designated 2027 zone", "b-zone"],
  pending: ["Eligible · designation pending", "b-eligible"],
  "not-designated": ["Eligible · not designated", "b-muted"],
  "not-eligible": ["Not eligible for 2027", "b-muted"],
  unknown: ["2027 status unknown", "b-muted"],
};

export default function Badges({ designation, rural, zone2018Share, qct, dda, nmtc }: BadgeInput) {
  const [label, cls] = LABEL[designation];
  return (
    <div className="badges">
      <span className={`badge ${cls}`}>{label}</span>
      {rural && <span className="badge b-rural">Rural</span>}
      {zone2018Share != null && zone2018Share >= 0.5 && <span className="badge b-2018">2018 zone (to 2028)</span>}
      {qct === 1 && <span className="badge b-incentive">HUD QCT</span>}
      {dda != null && dda > 0 && <span className="badge b-incentive">HUD DDA{dda === 1 ? " (part)" : ""}</span>}
      {nmtc === 1 && <span className="badge b-incentive">NMTC area</span>}
    </div>
  );
}
