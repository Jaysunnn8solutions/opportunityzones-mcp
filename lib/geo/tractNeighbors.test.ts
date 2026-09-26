import { topology } from "topojson-server";
import { describe, expect, it } from "vitest";
import { neighborsFromTopology } from "./tractNeighbors";

const square = (x: number, y: number, id: string) => ({
  type: "Feature" as const,
  properties: { GEOID: id },
  geometry: { type: "Polygon" as const, coordinates: [[[x, y], [x + 1, y], [x + 1, y + 1], [x, y + 1], [x, y]]] },
});

describe("tract neighbours", () => {
  it("links tracts that share an edge, not those that only touch at a corner", () => {
    const topo = topology({ tracts: { type: "FeatureCollection", features: [square(0, 0, "A"), square(1, 0, "B"), square(2, 1, "C")] } } as never);
    const n = neighborsFromTopology(topo as never);
    expect(n.get("A")).toEqual(["B"]);
    expect(n.get("B")).toEqual(["A"]);
    expect(n.get("C")).toEqual([]);
  });
});
