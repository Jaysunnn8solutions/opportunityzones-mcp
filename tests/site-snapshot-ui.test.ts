// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import SiteSnapshot from "@/app/ui/SiteSnapshot";

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  window.history.replaceState({}, "", "/tract/13001000100");
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
const click = async (label: string) => {
  const button = [...host.querySelectorAll("button")].find((b) => b.textContent === label);
  expect(button).toBeDefined(); await act(async () => button!.click());
};

it("only requests the clicked source, leaves other checks unrequested, and retries independently", async () => {
  let finishFlood!: (r: Response) => void;
  const requests: string[] = [];
  const fetcher = vi.fn(async (_url, init) => {
    const key = JSON.parse(init.body).source; requests.push(key);
    if (key === "flood") return new Promise<Response>((resolve) => { finishFlood = resolve; });
    return Response.json({ items: [{ key, label: "Earthquake", headline: null, unavailable: "Source could not be reached", source: "USGS" }] });
  });
  vi.stubGlobal("fetch", fetcher);
  await act(async () => root.render(createElement(SiteSnapshot, { geoid: "13001000100" })));
  expect(fetcher).not.toHaveBeenCalled();
  expect(host.textContent).toContain("not tract-wide statistics");
  await click("Check flood zone");
  await click("Check earthquake");
  expect(requests).toEqual(["flood", "earthquake"]);
  expect(host.querySelector('[aria-label="Wildfire"]')?.textContent).toContain("Not requested");
  expect(host.querySelector('[aria-label="Amenities within 1 mile"] button')).toBeNull();
  await click("Retry earthquake");
  expect(requests).toEqual(["flood", "earthquake", "earthquake"]);
  await act(async () => finishFlood(Response.json({ items: [{ key: "flood", label: "Flood zone", headline: "Zone AE", detail: "Mapped flood zone", source: "FEMA", checkedAt: Date.now() }] })));
  expect(host.querySelector('[aria-label="Flood zone"]')?.textContent).toContain("Zone AE");
  expect(host.querySelector('[aria-label="Earthquake"]')?.textContent).toContain("Check unavailable");
});

it("loads available sources independently and never requests the unconnected amenities service", async () => {
  const sources: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (_url, init) => { const source = JSON.parse(init.body).source; sources.push(source); return Response.json({ items: [{ key: source, headline: "Published result" }] }); }));
  await act(async () => root.render(createElement(SiteSnapshot, { geoid: "13001000100" })));
  await click("Load all available checks");
  expect(sources.sort()).toEqual(["earthquake", "epa", "flood", "traffic", "wildfire"]);
  expect(host.querySelectorAll('[role="status"] strong')).toHaveLength(6);
});
