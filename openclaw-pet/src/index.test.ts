import { describe, expect, it, vi } from "vitest";
import { ANIMATIONS, createPetController, validateAssets } from "./pet-controller.js";
import { creatureSvg, LOBSTER_FLAVORS } from "./creatures.js";

const REPLACEMENTS = new Set(["flatpack", "loading", "actual", "balloon", "ascii", "portal", "pixel"]);

describe("pet animation contract", () => {
  it("preserves the fixed Codex-compatible atlas layout", () => {
    expect(Object.keys(ANIMATIONS)).toHaveLength(9);
    expect(ANIMATIONS.idle).toMatchObject({ row: 0, frames: 6 });
    expect(ANIMATIONS.review).toMatchObject({ row: 8, frames: 6 });
  });

  it("reports a safe error when assets are not configured", () => {
    expect(validateAssets()).toMatchObject({ valid: false, lastError: "assetDir is required" });
  });

  it("uses the canonical OpenClaw SVG renderer contract", () => {
    const svg = creatureSvg("lobster", { flavor: "blue" });
    expect(svg).toMatch(/^<svg width="480" height="420" class="lobster-pet lobster-pet__svg lobster-pet--palette-blue"/);
    expect(svg).toContain('viewBox="0 0 120 105"');
    expect(svg).toContain('class="lob-standard-dome"');
    expect(svg).toContain('class="lob-claw lob-claw--l"');
    expect(svg).toContain('class="lob-claw lob-claw--r"');
    expect(svg).toContain("lobster-pet--palette-ghost");
    expect(svg).toContain("stroke-width=\"4\"");
  });

  it("retains the configured tail fan layer behind the body", () => {
    const withTail = creatureSvg("lobster", { flavor: "rubberduck", tailFan: true });
    const withoutTail = creatureSvg("lobster", { flavor: "rubberduck", tailFan: false });
    expect(withTail).toContain('class="lob-tail"');
    expect(withTail.indexOf('class="lob-tail"')).toBeLessThan(withTail.indexOf('class="lob-standard-dome"'));
    expect(withoutTail).not.toContain('class="lob-tail"');
  });

  it("keeps the source-specific rubberduck overlay", () => {
    const rubberduck = creatureSvg("lobster", { flavor: "rubberduck" });
    const crimson = creatureSvg("lobster", { flavor: "crimson" });
    expect(rubberduck).toContain('fill="#ff9a2e"');
    expect(rubberduck).toContain('ellipse cx="60" cy="71"');
    expect(crimson).not.toContain('ellipse cx="60" cy="71"');
  });

  it.each(LOBSTER_FLAVORS)("renders canonical %s geometry", (flavor) => {
    const svg = creatureSvg("lobster", { flavor });
    expect(svg).toContain(`lobster-pet--palette-${flavor}`);
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    if (REPLACEMENTS.has(flavor)) {
      const geometryClass = flavor === "pixel" ? "lob-pixel-frame" : flavor === "loading" ? "lob-skeleton" : `lob-${flavor}`;
      expect(svg).toContain(`class="${geometryClass}"`);
    } else {
      expect(svg).toContain('class="lob-standard-dome"');
    }
  });

  it("covers the complete canonical special-layer contract", () => {
    const signatures: Record<string, string> = {
      lumen: "lob-lumen", magma: "lob-magma", oilslick: "lob-oilsheen", aurora: "lob-aurora",
      nebula: "lob-nebula-stars", banana: "lob-standard-dome", bee: "lob-bee-wings", rubberduck: 'fill="#ff9a2e"',
      watermelon: "lob-watermelon", clawtron: "lob-mecha", selene: "lob-selene-moon", geode: "lob-geode-facets",
      glass: "lob-glass-glints", sourdough: "lob-standard-dome", zombie: "lob-standard-dome", plush: "lob-plush-button",
      disco: "lob-disco", blueprint: "lob-blueprint", phosphor: "lob-scanlines", heisenbug: "lob-glitch-ghosts",
      notexture: "lob-notexture", eclipse: "lob-eclipse", chimera: "lob-chimera", tinfoil: "lob-tinfoil",
      ghost: "lobster-pet--palette-ghost", cottoncandy: "lobster-pet--palette-cottoncandy",
      cryptid: "lob-cryptid-frame", invisible: "lobster-pet--palette-invisible", split: "lob-split-half",
    };
    for (const [flavor, signature] of Object.entries(signatures)) {
      expect(creatureSvg("lobster", { flavor: flavor as (typeof LOBSTER_FLAVORS)[number] }), flavor).toContain(signature);
    }
  });

  it("keeps canonical layer order and optional layers", () => {
    const svg = creatureSvg("lobster", { flavor: "crimson", tailFan: true, accessory: "crown" });
    expect(svg.indexOf('class="lob-tail"')).toBeLessThan(svg.indexOf('class="lob-standard-dome"'));
    expect(svg.indexOf('class="lob-standard-dome"')).toBeLessThan(svg.indexOf('class="lob-eye-open"'));
    expect(svg).toContain('fill="#f6c945"');
    expect(creatureSvg("lobster", { flavor: "crimson", tailFan: false, accessory: "none" })).not.toContain('class="lob-tail"');
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
