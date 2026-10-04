// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import Comparison from "@/app/ui/Comparison";
import { ResearchSession, useResearchState } from "@/app/ui/ResearchSession";
import ResearchEvidence from "@/app/ui/ResearchEvidence";
import ResearchFiles from "@/app/ui/ResearchFiles";
import { useResearchRecipe } from "@/app/ui/useResearchRecipe";
import { NO_FILTERS } from "@/lib/explore/filter";

vi.mock("@/app/ui/AccountAccess", () => ({ useAccount: () => ({ account: { member: true, termsCurrent: true }, open: vi.fn(), resumeAfterSignIn: vi.fn() }) }));
vi.mock("@/lib/client/place", async (original) => ({ ...await original<typeof import("@/lib/client/place")>(), lookupPlace: vi.fn(async (geoid: string) => ({ point: null, matched: null, profile: { geoid, state: "Georgia", county: "Test County", rural: { treasury: false }, designation2027: { status: "pending" }, measures: { population: { value: 4200, source: "acs5" } }, sources: { acs5: { name: "ACS", publisher: "Census", geography: "tract", vintage: "2020–2024", url: "https://www.census.gov/programs-surveys/acs" } }, publishedAt: "2026-09-27" } })) }));
vi.mock("@/app/ui/ExportResearch", () => ({ default: ({ label, disabled, input }: { label: string; disabled?: boolean; input: unknown }) => createElement("button", { disabled, "data-export": JSON.stringify(input) }, label) }));
const ids = Array.from({ length: 25 }, (_, i) => String(13001000100 + i));
let host: HTMLDivElement; let root: ReturnType<typeof createRoot>;
const settle = async () => { await act(async () => { await new Promise((done) => setTimeout(done, 30)); }); };
beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  window.history.replaceState({}, "", `/compare#tracts=${ids.join(",")}&measures=population`);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => setTimeout(() => callback(0), 0)); vi.stubGlobal("cancelAnimationFrame", clearTimeout);
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
it("shows all 25 tracts side by side, keeps data and selection controls visible, and exports the explicit selection", async () => {
  await act(async () => root.render(createElement(ResearchSession, null, createElement(Comparison)))); await settle();
  const table = host.querySelector(".comparison-table")!;
  expect(table.querySelectorAll("thead th")).toHaveLength(26);
  expect(table.textContent).toContain("4,200");
  expect(table.textContent).toContain("Census · 2020–2024");
  expect(host.querySelector('.comparison-overview')?.textContent).toContain('Your selection at a glance');
  expect(host.querySelector('.comparison-overview')?.textContent).toContain('105,000');
  expect(host.querySelector('.comparison-overview')?.textContent).toContain('25 of 25 tracts');
  expect(host.querySelector('.comparison-overview')?.closest('details')).toBeNull();
  expect(host.textContent).not.toContain('Differences in the published numbers');
  expect(host.querySelector('input[type="file"]')).toBeNull();
  expect(host.querySelector('.comparison-search')).toBeNull();
  expect(host.querySelector('.selection-chips')?.closest('details')).toBeNull();
  expect(host.querySelector('.measure-choices')?.closest('details')).toBeNull();
  expect(host.querySelector('[data-export]')?.hasAttribute('disabled')).toBe(false);
  expect(JSON.parse(host.querySelector('[data-export]')!.getAttribute('data-export')!).geoids).toEqual(ids);
  await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Remove selected tract 13001000100"]')!.click()); await settle();
  expect(host.querySelectorAll('.comparison-table thead th')).toHaveLength(25);
  expect(host.querySelector('.comparison-overview')?.textContent).toContain('100,800');
  await act(async () => [...host.querySelectorAll('button')].find((b) => b.textContent === 'Clear comparison list')!.click());
  expect(host.textContent).toContain('Your comparison is empty');
  expect(host.querySelector('.comparison-overview')).toBeNull();
});

it("includes the same visible overview in the printable brief", async () => {
  await act(async () => root.render(createElement(ResearchSession, null, createElement(Comparison, { brief: true })))); await settle();
  const overview = host.querySelector('.comparison-overview')!;
  expect(overview.textContent).toContain('105,000');
  expect(overview.closest('.no-print, details')).toBeNull();
});

function EvidenceHarness() {
  const [, setFilters] = useResearchState('explore-filters', NO_FILTERS);
  return createElement('div', null, createElement('button', { onClick: () => setFilters({ ...NO_FILTERS, rural: 'not-rural' }) }, 'Set criteria'), createElement(ResearchEvidence, { geoid: ids[0] }));
}
it("evaluates nationwide criteria for selected tracts even without a state selection", async () => {
  const fetcher = vi.fn(async () => Response.json({ evidence: { [ids[0]]: [{ id: 'rural', label: 'Rural classification', requirement: 'Not rural', actual: 'Not rural', result: 'Meets' }] } }));
  vi.stubGlobal('fetch', fetcher);
  await act(async () => root.render(createElement(ResearchSession, null, createElement(EvidenceHarness))));
  await act(async () => host.querySelector('button')!.click());
  expect(fetcher).toHaveBeenCalledWith('/api/explore/13', expect.objectContaining({ method: 'POST' }));
  expect(host.textContent).toContain('Meets');
  expect(host.textContent).not.toContain('outside the selected search state');
});

function FileHarness() { const recipe = useResearchRecipe(); return createElement(ResearchFiles, { onImport: recipe.apply }); }
it("reopens saved research in the workspace without sending the file or automatically changing comparison", async () => {
  window.history.replaceState({}, '', '/workbench');
  const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
  await act(async () => root.render(createElement(ResearchSession, null, createElement(FileHarness))));
  const input = host.querySelector<HTMLInputElement>('input[type="file"]')!;
  const saved = { format: 'opportunity-zone-research', version: 1, savedAt: '', geoids: ids.slice(0, 2), state: '13', filters: NO_FILTERS, focus: 'overview', measures: ['population'], privateNotes: 'discard me' };
  Object.defineProperty(input, 'files', { configurable: true, value: [{ size: 400, text: async () => JSON.stringify(saved) }] });
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
  expect(host.textContent).toContain('2 tract selections loaded');
  expect(host.textContent).not.toContain('discard me');
  expect(host.querySelector('a[href="/compare"]')).not.toBeNull();
  expect(fetcher).not.toHaveBeenCalled();
});
