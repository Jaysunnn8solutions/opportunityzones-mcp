// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import PlaceSearch from "@/app/ui/PlaceSearch";
import FrontDoor, { matchState } from "@/app/ui/FrontDoor";
import { ResearchSession } from "@/app/ui/ResearchSession";
import type { StateSummary } from "@/lib/data/stateViews";
import type { LookupResult, PlaceResult } from "@/lib/client/place";

const lookup = vi.hoisted(() => vi.fn<(...args: unknown[]) => Promise<LookupResult>>(async () => "no-match"));
const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/lib/client/place", async (original) => ({ ...await original<object>(), lookupPlace: lookup }));
vi.mock("@/app/ui/AccountAccess", () => ({ useAccount: () => ({ account: { member: false }, open: () => {} }) }));
const city = { geoid: "1304000", name: "Atlanta city", usps: "GA", view: [-84.414, 33.762, 10] };
const states: StateSummary[] = [{ fips: "13", name: "Georgia", usps: "GA", view: [-83, 33, 7], eligible: 100, cap: 25 }];
let root: Root;
async function mount(element: React.ReactElement) {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  await act(async () => { root.render(element); });
}
async function search() { await act(async () => { document.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); }); }
afterEach(async () => { if (root) await act(async () => root.unmount()); document.body.replaceChildren(); vi.unstubAllGlobals(); vi.clearAllMocks(); lookup.mockReset(); lookup.mockResolvedValue("no-match"); });

describe("location search choices", () => {
  it("keeps state name and abbreviation lookup local", async () => {
    expect(matchState(" ga. ", states)?.fips).toBe("13");
    expect(matchState("GEORGIA", states)?.fips).toBe("13");
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    await mount(createElement(ResearchSession, null, createElement(FrontDoor, { states })));
    const example = [...document.querySelectorAll("button")].find((button) => button.textContent === "Georgia")!;
    await act(async () => example.click()); await search();
    expect(document.querySelector(".answer-card h2")?.textContent).toBe("Georgia");
    expect(fetch).not.toHaveBeenCalled(); expect(lookup).not.toHaveBeenCalled();
  });
  it("lets users choose a city without treating it as a tract or calling the geocoder", async () => {
    const fetch = vi.fn(async () => Response.json({ matches: [city, { ...city, geoid: "4804516", usps: "TX" }], more: false })); vi.stubGlobal("fetch", fetch);
    const onCityResult = vi.fn(), onResult = vi.fn();
    await mount(createElement(PlaceSearch, { value: "Atlanta", onChange: () => {}, onResult, onCityResult }));
    await search();
    expect(document.querySelectorAll(".match-options button")).toHaveLength(2);
    expect(onCityResult).not.toHaveBeenCalled();
    await act(async () => (document.querySelector(".match-options button") as HTMLButtonElement).click());
    expect(onCityResult).toHaveBeenCalledWith(city);
    expect(onResult).not.toHaveBeenCalled(); expect(lookup).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledWith("/api/places", expect.objectContaining({ method: "POST" }));
  });
  it("retains address lookup when a query is not a city", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ matches: [], more: false })));
    await mount(createElement(PlaceSearch, { value: "55 Trinity Ave SW, Atlanta, GA", onChange: () => {}, onResult: () => {}, onCityResult: () => {} }));
    await search(); expect(lookup).toHaveBeenCalledWith("55 Trinity Ave SW, Atlanta, GA", undefined, expect.any(AbortSignal));
  });
  it("reports unavailable city lookup without sending another provider the query", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 429 })));
    await mount(createElement(PlaceSearch, { value: "Atlanta", onChange: () => {}, onResult: () => {}, onCityResult: () => {} }));
    await search(); expect(document.querySelector('[role="status"]')?.textContent).toContain("allowance");
    expect(lookup).not.toHaveBeenCalled();
  });
  it("opens the map directly when a hub address match is chosen", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ matches: [], more: false })));
    const candidate = { geoid: "13001950100", lon: -84.4, lat: 33.7, label: "Example address" };
    const place: PlaceResult = { point: [candidate.lon, candidate.lat], matched: candidate.label, profile: { geoid: candidate.geoid, state: "Georgia", county: "Example County", measures: {}, rural: { treasury: null }, designation2027: { status: "pending", text: "Eligible", stateEligible: 1, stateCap: 1 } } };
    lookup.mockResolvedValueOnce({ kind: "ambiguous", candidates: [candidate] }).mockResolvedValueOnce(place);
    await mount(createElement(ResearchSession, null, createElement(FrontDoor, { states })));
    await act(async () => [...document.querySelectorAll("button")].find((button) => button.textContent === "55 Trinity Ave SW, Atlanta, GA 30303")!.click());
    await search();
    expect(push).not.toHaveBeenCalled();
    const match = document.querySelector<HTMLButtonElement>(".match-options button")!;
    expect(match.textContent).toContain("View on map");
    await act(async () => match.click());
    expect(push).toHaveBeenCalledOnce();
    expect(push).toHaveBeenCalledWith("/map#t=13001950100&m=map&at=33.70000,-84.40000&v=-84.4,33.7,13");
    expect(document.querySelector(".answer-card")).toBeNull();
  });
  it("opens a selected hub city on the map without an intermediate card", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ matches: [city], more: false })));
    await mount(createElement(ResearchSession, null, createElement(FrontDoor, { states })));
    await act(async () => [...document.querySelectorAll("button")].find((button) => button.textContent === "Atlanta, GA")!.click());
    await search();
    expect(push).not.toHaveBeenCalled();
    await act(async () => document.querySelector<HTMLButtonElement>(".match-options button")!.click());
    expect(push).toHaveBeenCalledOnce();
    const href = push.mock.calls[0][0] as string;
    expect(href.startsWith("/map#")).toBe(true);
    expect(new URLSearchParams(href.split("#")[1]).get("m")).toBe("map");
    expect(document.querySelector(".answer-card")).toBeNull();
  });
});
