import { describe, expect, it } from "vitest";
import { countyHasZones } from "./countyZones";

describe("countyHasZones", () => {
  it("is blue for any eligible tract while the state's list is unpublished", () => {
    expect(countyHasZones([40, 3, 0, 3])).toBe(true);
    expect(countyHasZones([40, 0, 0, 0])).toBe(false);
  });

  it("follows designations once the state's list is out", () => {
    // Eligible but none designated, state certified: no zones.
    expect(countyHasZones([40, 3, 0, 0])).toBe(false);
    expect(countyHasZones([40, 3, 1, 0])).toBe(true);
  });
});
