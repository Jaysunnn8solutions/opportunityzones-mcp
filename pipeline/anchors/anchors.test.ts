import { describe, expect, it } from "vitest";
import { parseBatchResult } from "./anchors";

// Shaped like the Census batch geocoder's response: quoted fields, the
// coordinate pair as one "lon,lat" field, and no header row.
const response = [
  '"010001","1108 ROSS CLARK CIRCLE, DOTHAN, AL, 36301","Match","Exact","1108 ROSS CLARK CIR, DOTHAN, AL, 36301","-85.36,31.21","123","L","01","069","040600","1000"',
  '"010005","2505 U S HIGHWAY 431 NORTH, BOAZ, AL, 35957","No_Match"',
  '"010006","1 MAIN ST, X, AL, 35000","Tie"',
  "",
].join("\n");

describe("parseBatchResult", () => {
  const out = parseBatchResult(response);

  it("keeps matched rows with their tract GEOID and coordinates", () => {
    expect(out.get("010001")).toEqual({ lon: -85.36, lat: 31.21, geoid: "01069040600" });
  });

  it("drops unmatched and tied rows", () => {
    expect(out.has("010005")).toBe(false);
    expect(out.has("010006")).toBe(false);
  });
});
