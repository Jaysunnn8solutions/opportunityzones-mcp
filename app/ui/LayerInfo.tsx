"use client";

import { MAP_LAYERS, type MapLayerId } from "@/lib/content/mapLayers";
import { Cite } from "./Cite";

/** A short, cited explanation of one map layer, with a link to the full page in a new tab. */
export function LayerInfoCard({ id, onClose }: { id: MapLayerId; onClose?: () => void }) {
  const l = MAP_LAYERS[id];
  return (
    <div className="layer-info" role="note" aria-label={`About ${l.title}`}>
      <div className="layer-info-head">
        <strong>{l.title}</strong>
        {onClose && (
          <button type="button" className="mcp-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        )}
      </div>
      <p>
        {l.short} <Cite rules={l.rules} />
      </p>
      <p className="layer-info-mapped">
        <strong>On this map:</strong> {l.mapped}
      </p>
      <a href={`/map-layers#${id}`} target="_blank" rel="noopener">
        More about {l.title} ↗
      </a>
    </div>
  );
}
