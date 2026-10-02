// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ResearchSession } from "@/app/ui/ResearchSession";
import { useResearchRecipe, PROJECT_STORAGE } from "@/app/ui/useResearchRecipe";
import { AccountAccess } from "@/app/ui/AccountAccess";
import ExportResearch from "@/app/ui/ExportResearch";
import { chatHandoff } from "@/lib/research/handoff";
import { EMPTY_SPEC } from "@/lib/research/workbench";

vi.mock("@simplewebauthn/browser", () => ({ startAuthentication: async () => ({ testCredential: true }), startRegistration: async () => ({ testCredential: true }) }));
let root: Root;
let container: HTMLDivElement;
const settle = async () => { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 45)); }); };
beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear(); container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new Event("close")); };
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
async function click(text: string) {
  const button = [...container.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === text);
  expect(button, text).toBeDefined();
  await act(async () => button!.click()); await settle();
}
function RecipeEditor() {
  const recipe = useResearchRecipe();
  return createElement("div", null,
    createElement("button", { onClick: () => { recipe.setIds(["01001020100"]); recipe.setState("01"); recipe.setTitle("Private project"); recipe.setNotes("Private note"); } }, "Choose research"),
    createElement("button", { onClick: () => recipe.save("build-a") }, "Save research"),
    createElement("button", { onClick: () => recipe.setKeys(["population"]) }, "Change measures"),
    createElement("output", null, JSON.stringify({ ids: recipe.ids, state: recipe.state, saved: recipe.saved, title: recipe.title })));
}
function NavigationHarness() {
  const [page, setPage] = useState(0);
  return createElement(ResearchSession, null, createElement("button", { onClick: () => setPage(page + 1) }, "Next page"), createElement(RecipeEditor, { key: page }));
}
describe("connected research workflow", () => {
  it("preserves selection and private draft across route component remounts, saving only on explicit action", async () => {
    await act(async () => root.render(createElement(NavigationHarness)));
    await click("Choose research");
    expect(localStorage.getItem(PROJECT_STORAGE)).toBeNull();
    await click("Next page");
    expect(container.querySelector("output")?.textContent).toContain("01001020100");
    expect(container.querySelector("output")?.textContent).toContain("Private project");
    await click("Save research");
    const saved = JSON.parse(localStorage.getItem(PROJECT_STORAGE)!);
    expect(saved[0].notes).toBe("Private note"); expect(saved[0].datasetVersion).toBe("build-a");
    expect(container.querySelector("output")?.textContent).toContain('"saved":true');
    await click("Change measures");
    expect(container.querySelector("output")?.textContent).toContain('"saved":false');
    expect(JSON.parse(localStorage.getItem(PROJECT_STORAGE)!)[0].spec.columns).toHaveLength(6);
  });
  it("returns to the pending export after mock sign-in without creating a download", async () => {
    let member = false;
    const requests: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      requests.push(url);
      if (url !== "/api/account") throw new Error("No automatic export request is allowed");
      if (!init?.method) return Response.json({ member, termsCurrent: member });
      const body = JSON.parse(String(init.body));
      if (body.action === "options") return Response.json({ options: {} });
      if (body.action === "verify") { member = true; return Response.json({ ok: true }); }
      throw new Error("Unexpected action");
    }));
    await act(async () => root.render(createElement(ResearchSession, null, createElement(AccountAccess, null, createElement(ExportResearch, { input: { geoids: ["01001020100"], columns: ["population"] } })))));
    await settle(); await click("Export research"); await click("Free account / sign in");
    expect(container.querySelector<HTMLDialogElement>(".export-dialog")?.open).toBe(false);
    expect(container.querySelector<HTMLDialogElement>(".account-dialog")?.open).toBe(true);
    await click("Sign in with a passkey");
    expect(container.querySelector<HTMLDialogElement>(".account-dialog")?.open).toBe(false);
    expect(container.querySelector<HTMLDialogElement>(".export-dialog")?.open).toBe(true);
    expect([...container.querySelectorAll<HTMLInputElement>(".export-columns input:checked")]).toHaveLength(1);
    expect(requests.every((url) => url === "/api/account")).toBe(true);
  });
  it("cancels a pending export when sign-in is dismissed", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ member: false })));
    await act(async () => root.render(createElement(ResearchSession, null, createElement(AccountAccess, null, createElement(ExportResearch, { input: { state: "01" } })))));
    await settle(); await click("Export research"); await click("Free account / sign in");
    await act(async () => container.querySelector<HTMLDialogElement>(".account-dialog")!.close());
    expect(container.querySelector<HTMLDialogElement>(".export-dialog")?.open).toBe(false);
  });
  it("strips private and unrecognized fields from chat text and website links", () => {
    const text = chatHandoff({ ...EMPTY_SPEC, geoids: ["01001020100"], notes: "private-note", title: "private-title", point: [1, 2], token: "credential" } as typeof EMPTY_SPEC, "https://research.example/some-path");
    expect(text).not.toMatch(/private-note|private-title|credential|"point"/);
    expect(text).toContain("https://research.example/workbench#spec=");
    expect(text).toContain("Do not silently omit selections");
    expect(() => chatHandoff({ ...EMPTY_SPEC, geoids: Array.from({ length: 26 }, (_, i) => String(10001040100 + i)) }, "https://research.example")).toThrow(/25/);
  });
});
