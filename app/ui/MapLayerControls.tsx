"use client";
import type { CSSProperties } from "react";

export default function MapLegendItem({ label, swatch, checked, onToggle }: { label: string; swatch?: CSSProperties; checked: boolean; onToggle: () => void }) {
  return <label className="map-legend-item"><input type="checkbox" checked={checked} onChange={onToggle} /><span className="swatch" style={swatch} aria-hidden="true" /><span>{label}</span></label>;
}
