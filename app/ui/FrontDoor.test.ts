import { describe, expect, it } from "vitest";
import { matchState } from "./FrontDoor";

const states = [
  { fips: "13", name: "Georgia", usps: "GA", eligible: 942, cap: 236, view: null },
  { fips: "72", name: "Puerto Rico", usps: "PR", eligible: 800, cap: 200, view: null },
];

describe("matchState", () => {
  it("matches a state by name or postal code, in any case", () => {
    expect(matchState("georgia", states)?.fips).toBe("13");
    expect(matchState(" GA ", states)?.fips).toBe("13");
    expect(matchState("Puerto Rico", states)?.fips).toBe("72");
  });

  it("leaves addresses and tract numbers to the lookup", () => {
    expect(matchState("55 Trinity Ave SW, Atlanta, GA 30303", states)).toBeNull();
    expect(matchState("13121003500", states)).toBeNull();
    expect(matchState("", states)).toBeNull();
  });
});
