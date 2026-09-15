import { describe, expect, it, vi } from "vitest";
import { ANIMATIONS, createPetController, validateAssets } from "./pet-controller.js";
import { creatureSvg, LOBSTER_FLAVORS } from "./creatures.js";

describe("pet animation contract", () => {
  it("preserves the fixed Codex-compatible atlas layout", () => {
    expect(Object.keys(ANIMATIONS)).toHaveLength(9);
    expect(ANIMATIONS.idle).toMatchObject({ row: 0, frames: 6 });
    expect(ANIMATIONS.review).toMatchObject({ row: 8, frames: 6 });
  });

  it("reports a safe error when assets are not configured", () => {
    expect(validateAssets()).toMatchObject({ valid: false, lastError: "assetDir is required" });
  });

  it("renders lobster flavor and trait settings into the local SVG", () => {
    const blue = creatureSvg("lobster", { flavor: "blue", personality: "sleepy", build: "slender", clawSize: "mighty", accessory: "crown", tailFan: false, freckles: true });
    expect(blue).toContain("#4a7dfc");
    expect(blue).toContain('stroke="#fff"');
    expect(blue).toContain("stroke-width=\"6\"");
    expect(blue).toContain("#f4c531");
    expect(blue).not.toContain("M45 84q15 14");
  });

  it("retains the configured tail fan layer", () => {
    const withTail = creatureSvg("lobster", { flavor: "rubberduck", tailFan: true });
    const withoutTail = creatureSvg("lobster", { flavor: "rubberduck", tailFan: false });
    expect(withTail).toContain('ellipse cx="16" cy="84"');
    expect(withTail).toContain('ellipse cx="104" cy="84"');
    expect(withoutTail).not.toContain('ellipse cx="16" cy="84"');
  });

  it("renders rubberduck-specific bill and belly layers", () => {
    const rubberduck = creatureSvg("lobster", { flavor: "rubberduck" });
    const crimson = creatureSvg("lobster", { flavor: "crimson" });
    expect(rubberduck).toContain('rect x="47" y="41"');
    expect(rubberduck).toContain('ellipse cx="60" cy="71"');
    expect(crimson).not.toContain('rect x="47" y="41"');
  });

  it.each(LOBSTER_FLAVORS)("renders the complete %s Lobsterdex palette", (flavor) => {
    const svg = creatureSvg("lobster", { flavor });
    expect(svg).toMatch(/^<svg width="480" height="420" viewBox="0 0 120 105"/);
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toMatch(/<\/g><\/svg>$/);
    const replacements = ["flatpack", "loading", "actual", "balloon", "ascii", "portal", "pixel"];
    if (replacements.includes(flavor)) {
      expect(svg).toContain(`data-layer="${flavor}"`);
    } else {
      expect(svg).toContain('class="lob-standard-dome"');
      expect(svg).toContain('class="lob-claw lob-claw--l"');
      expect(svg).toContain('class="lob-claw lob-claw--r"');
    }
  });

  it.each(LOBSTER_FLAVORS)("retains the shared layer stack for %s", (flavor) => {
    const svg = creatureSvg("lobster", { flavor });
    if (["flatpack", "loading", "actual", "balloon", "ascii", "portal", "pixel"].includes(flavor)) return;
    const layers = [...svg.matchAll(/data-layer="([^"]+)"/g)].map((match) => match[1]);
    expect(layers).toEqual(expect.arrayContaining(["antennae", "claws", "body", "highlight", "eyes", "face"]));
    expect(svg.match(/data-layer="claws"/g)).toHaveLength(2);
    expect(layers.indexOf("body")).toBeGreaterThan(layers.indexOf("antennae"));
    expect(layers.indexOf("highlight")).toBeGreaterThan(layers.indexOf("body"));
    expect(layers.indexOf("eyes")).toBeGreaterThan(layers.indexOf("highlight"));
    expect(layers.indexOf("face")).toBeGreaterThan(layers.indexOf("eyes"));
    if (flavor === "retro" || flavor === "goldenretro") {
      expect(svg).toContain('data-layer="claws" class="lob-claw lob-claw--r"');
    }
  });

  it("renders every canonical special-layer family", () => {
    const expectedLayers: Record<string, string> = {
      lumen: "lumen", magma: "magma", oilslick: "oilslick", aurora: "aurora", nebula: "nebula", banana: "banana",
      bee: "bee", rubberduck: "rubberduck", watermelon: "watermelon", clawtron: "clawtron", selene: "selene", geode: "split",
      glass: "glass", sourdough: "sourdough", zombie: "zombie", plush: "plush", disco: "disco", blueprint: "blueprint",
      phosphor: "phosphor", heisenbug: "heisenbug", notexture: "notexture", eclipse: "eclipse", chimera: "chimera", tinfoil: "tinfoil",
      split: "split", flatpack: "flatpack", loading: "loading", actual: "actual", balloon: "balloon", ascii: "ascii", portal: "portal", pixel: "pixel",
    };
    for (const [flavor, layer] of Object.entries(expectedLayers)) {
      expect(creatureSvg("lobster", { flavor: flavor as typeof LOBSTER_FLAVORS[number] })).toContain(`data-layer="${layer}"`);
    }
  });

  it("keeps optional layers opt-in and correctly ordered", () => {
    const withAll = creatureSvg("lobster", { flavor: "rubberduck", tailFan: true, freckles: true, accessory: "crown" });
    const withoutOptional = creatureSvg("lobster", { flavor: "crimson", tailFan: false, freckles: false, accessory: "none" });
    expect(withAll).toContain('ellipse cx="16" cy="84"');
    expect(withAll).toContain('circle cx="38" cy="59"');
    expect(withAll).toContain('fill="#f4c531"');
    expect(withAll.indexOf('ellipse cx="16" cy="84"')).toBeLessThan(withAll.indexOf('data-layer="body"'));
    expect(withoutOptional).not.toContain('ellipse cx="16" cy="84"');
    expect(withoutOptional).not.toContain('circle cx="38" cy="59"');
  });

  it("keeps the Lobsterdex palette inventory at 42 entries", () => {
    expect(LOBSTER_FLAVORS).toHaveLength(42);
    expect(new Set(LOBSTER_FLAVORS).size).toBe(42);
  });

  it("keeps overlapping runs active until all runs complete", () => {
    vi.useFakeTimers();
    const pet = createPetController({ idleDelayMs: 1 });
    try {
      pet.modelStarted(); pet.modelStarted();
      expect(pet.snapshot()).toMatchObject({ animation: "review", activeRuns: 2 });
      pet.agentEnded(false);
      vi.advanceTimersByTime(5);
      expect(pet.snapshot()).toMatchObject({ animation: "review", activeRuns: 1, activityLabel: "Thinking" });
      pet.agentEnded(false);
      expect(pet.snapshot()).toMatchObject({ animation: "jumping", activeRuns: 0 });
      vi.advanceTimersByTime(1);
      expect(pet.snapshot()).toMatchObject({ animation: "idle", activeRuns: 0 });
      expect(pet.reset()).toMatchObject({ animation: "idle", activeRuns: 0 });
    } finally {
      vi.useRealTimers();
    }
  });
});
