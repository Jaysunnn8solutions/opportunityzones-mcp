import { describe, expect, it } from "vitest";
import { versionLabel } from "./version";

describe("versionLabel", () => {
  it("joins the release, commit and build date", () => {
    expect(versionLabel("0.2.0", "062eb86", "2026-09-26")).toBe("v0.2.0 · 062eb86 · 2026-09-26");
  });

  it("leaves out what is unknown", () => {
    expect(versionLabel("0.2.0", "", "")).toBe("v0.2.0");
  });
});
