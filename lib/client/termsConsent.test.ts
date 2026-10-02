import { describe, expect, it } from "vitest";
import { entryDestination, isPublicLegalPage } from "./termsConsent";

describe("versioned terms acknowledgment", () => {
  it("permits internal research destinations but rejects open redirects", () => {
    expect(entryDestination("/map")).toBe("/map");
    for (const path of [null, "//example.com", "/\\example.com", "https://example.com", "/api/consent", "/entry", "/%2fexample.com"]) expect(entryDestination(path)).toBe("/");
  });
  it("allows the legal document but does not exempt research routes", () => {
    expect(isPublicLegalPage("/legal")).toBe(true);
    expect(isPublicLegalPage("/legal/")).toBe(true);
    for (const path of ["/", "/map", "/compare", "/tract/13001950100", "/legal-extra"]) expect(isPublicLegalPage(path)).toBe(false);
  });
});
