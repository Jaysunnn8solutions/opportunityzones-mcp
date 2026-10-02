// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import axe from "axe-core";
import OAuthConsent from "@/app/ui/OAuthConsent";
const state = vi.hoisted(() => ({ member: false, open: vi.fn() }));
vi.mock("@/app/ui/AccountAccess", () => ({ useAccount: () => ({ account: { member: state.member, termsCurrent: state.member }, open: state.open }) }));
it("keeps approval explicit after sign-in, labels the callback, and announces failures accessibly", async () => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  state.member = false; state.open.mockReset(); const approvals: unknown[] = [];
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    if (body.preview) return Response.json({ client: { name: "Test client" }, destination: "https://client.example" });
    approvals.push(body); return Response.json({ error: "Test connection unavailable. Try again." }, { status: 503 });
  }));
  const host = document.createElement("main"); document.body.append(host); const root = createRoot(host);
  const parameters = { client_id: "test-client" };
  const render = () => root.render(createElement("div", null, createElement("h1", null, "Review this connection"), createElement(OAuthConsent, { parameters })));
  try {
    await act(async () => render());
    const button = host.querySelector<HTMLButtonElement>("button")!; const checkbox = host.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    expect(button.disabled).toBe(true); expect(checkbox.checked).toBe(false);
    expect(host.textContent).toContain("https://client.example");
    await act(async () => { checkbox.click(); button.click(); }); expect(state.open).toHaveBeenCalledOnce(); expect(approvals).toHaveLength(0);
    state.member = true; await act(async () => render()); expect(approvals).toHaveLength(0); expect(button.textContent).toBe("Agree and connect");
    await act(async () => button.click()); expect(approvals).toHaveLength(1); expect(approvals[0]).toMatchObject({ accepted: true });
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("Try again");
    const result = await axe.run(host, { rules: { "color-contrast": { enabled: false } } }); expect(result.violations.map((item) => item.id)).toEqual([]);
  } finally { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); }
});
