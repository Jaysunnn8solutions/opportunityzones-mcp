// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import MapArrivalScroll from "@/app/ui/MapArrivalScroll";

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
let frames: Map<number, FrameRequestCallback>;
let nextFrame: number;
const scroll = vi.fn();
async function finishFrames() {
  await act(async () => {
    while (frames.size) {
      const current = [...frames.values()]; frames.clear();
      for (const callback of current) callback(0);
    }
  });
}
beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  window.history.replaceState({}, "", "/map#t=13001950100&m=map");
  frames = new Map(); nextFrame = 0; scroll.mockClear();
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { frames.set(++nextFrame, callback); return nextFrame; });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
  vi.stubGlobal("scrollTo", scroll);
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
async function mount() {
  await act(async () => root.render(createElement("main", null, createElement(MapArrivalScroll),
    createElement("aside", { className: "explorer-filters" }), createElement("section", { className: "explorer-results" }),
    createElement("a", { href: "/map#m=map", onClick: (event) => event.preventDefault() }, "Find areas"),
    createElement("button", null, "Filter"))));
}
it("resets the page and both desktop panes after restored scroll positions on arrival", async () => {
  await mount();
  const panes = [...host.querySelectorAll<HTMLElement>("aside, section")];
  for (const pane of panes) { pane.scrollTop = 900; pane.scrollLeft = 40; }
  await finishFrames();
  expect(panes.map((pane) => [pane.scrollTop, pane.scrollLeft])).toEqual([[0, 0], [0, 0]]);
  expect(scroll).toHaveBeenCalledWith({ top: 0, left: 0, behavior: "instant" });
  expect(window.location.hash).toContain("t=13001950100");
});
it("resets same-page map links but leaves filter clicks and new-tab links alone", async () => {
  await mount(); await finishFrames(); scroll.mockClear();
  const pane = host.querySelector<HTMLElement>("section")!;
  pane.scrollTop = 700;
  await act(async () => host.querySelector("button")!.click()); await finishFrames();
  expect(pane.scrollTop).toBe(700); expect(scroll).not.toHaveBeenCalled();
  const link = host.querySelector("a")!;
  await act(async () => link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, ctrlKey: true })));
  await finishFrames(); expect(pane.scrollTop).toBe(700);
  await act(async () => link.click()); await finishFrames();
  expect(pane.scrollTop).toBe(0); expect(scroll).toHaveBeenCalledOnce();
});
it("cancels pending resets when leaving the map", async () => {
  await mount(); await act(async () => root.render(null)); await finishFrames();
  expect(scroll).not.toHaveBeenCalled();
});
