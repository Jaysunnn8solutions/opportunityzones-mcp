import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function luminance(hex: string) {
  const rgb = hex.slice(1).match(/../g)!.map((pair) => parseInt(pair, 16) / 255).map((v) => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
  return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
}
function ratio(a: string, b: string) { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); }

describe("core text color pairs", () => {
  const css = readFileSync(path.resolve(import.meta.dirname, "../app/globals.css"), "utf8");
  const blocks = [...css.matchAll(/:root[^{}]*\{([^}]+)\}/g)].filter((match) => match[1].includes("--ink:")).slice(0, 2);
  for (const [index, block] of blocks.entries()) {
    const colors = Object.fromEntries([...block[1].matchAll(/--([\w-]+):\s*(#[\da-f]{6})\s*;/gi)].map((match) => [match[1], match[2]]));
    it(`${index ? "dark" : "light"} theme text and primary buttons meet 4.5:1`, () => {
      for (const [foreground, background] of [["ink", "paper"], ["ink", "panel"], ["muted", "paper"], ["muted", "panel"], ["muted", "wash"], ["accent", "paper"], ["accent", "panel"], ["accent-ink", "accent"]]) {
        expect(ratio(colors[foreground], colors[background]), `${foreground} on ${background}`).toBeGreaterThanOrEqual(4.5);
      }
    });
  }
});
