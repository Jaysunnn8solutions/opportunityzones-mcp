// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import LegalAccess from "@/app/ui/LegalAccess";
import { TERMS_VERSION } from "@/lib/content/siteTerms";
import { CONSENT_UNAVAILABLE } from "@/lib/client/termsConsent";

vi.mock("next/navigation", () => ({ usePathname: () => "/entry/agreement" }));
vi.mock("@/app/ui/EntryAtmosphere", () => ({ default: () => null }));
let root: Root, container: HTMLDivElement;
beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
const button = (label: string) => [...container.querySelectorAll<HTMLButtonElement>("button")].find((node) => node.textContent === label)!;
it("keeps entry closed on outage and retries availability without recording acceptance", async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ error: "The production origin is not configured." }, { status: 503 }))
    .mockResolvedValueOnce(Response.json({ accepted: false, version: TERMS_VERSION }));
  vi.stubGlobal("fetch", fetcher);
  await act(async () => root.render(createElement(LegalAccess, null, "PRIVATE_RESEARCH")));
  await act(async () => container.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
  expect(button("I agree and enter").disabled).toBe(true);
  expect(container.querySelector('[role="alert"]')?.textContent).toBe(CONSENT_UNAVAILABLE);
  expect(container.textContent).not.toContain("production origin");
  expect(container.textContent).not.toContain("PRIVATE_RESEARCH");
  expect(container.querySelector('a[href="/legal"]')).not.toBeNull();
  await act(async () => button("Check availability again").click());
  expect(button("I agree and enter").disabled).toBe(false);
  expect(fetcher.mock.calls.every(([, init]) => !init.method)).toBe(true);
  expect(container.querySelector('[role="alert"]')).toBeNull();
});
it("handles storage becoming unavailable after the initial readiness check", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json({ accepted: false, version: TERMS_VERSION }))
    .mockResolvedValueOnce(Response.json({ error: "private configuration detail" }, { status: 503 })));
  await act(async () => root.render(createElement(LegalAccess, null, "PRIVATE_RESEARCH")));
  await act(async () => container.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
  await act(async () => button("I agree and enter").click());
  expect(button("I agree and enter").disabled).toBe(true);
  expect(container.textContent).toContain(CONSENT_UNAVAILABLE);
  expect(container.textContent).not.toContain("private configuration detail");
  expect(container.textContent).not.toContain("PRIVATE_RESEARCH");
});
