import { describe, expect, it } from "vitest";
import { parseSaved, stepFromHash } from "./saved";

describe("guided check saving", () => {
  it("reads the step from the URL hash, and only a known step", () => {
    expect(stepFromHash("#step=sale-date")).toBe("sale-date");
    expect(stepFromHash("#step=nope")).toBeNull();
    expect(stepFromHash("")).toBeNull();
  });

  it("round-trips what was saved", () => {
    const saved = {
      answers: { persona: "individual", money: "gain", gainKind: null, saleDate: "2026-07-06", hasPlace: false, stateChosen: true, asset: null, fund: null },
      current: "benefits",
      visited: ["who", "money", "benefits"],
      place: null,
      placeInput: "",
      stateFips: "13",
    };
    const back = parseSaved(JSON.stringify(saved))!;
    expect(back.answers.saleDate).toBe("2026-07-06");
    expect(back.current).toBe("benefits");
    expect(back.stateFips).toBe("13");
  });

  it("ignores anything malformed rather than failing", () => {
    expect(parseSaved(null)).toBeNull();
    expect(parseSaved("not json")).toBeNull();
    const odd = parseSaved(JSON.stringify({ answers: { money: 5, fund: "maybe", saleDate: "soon", hasPlace: "yes" }, current: "hack", visited: ["who", "x"] }))!;
    expect(odd.answers.money).toBeNull();
    expect(odd.answers.fund).toBeNull();
    expect(odd.answers.saleDate).toBe("");
    expect(odd.answers.hasPlace).toBe(false);
    expect(odd.current).toBe("who");
    expect(odd.visited).toEqual(["who"]);
  });
});
