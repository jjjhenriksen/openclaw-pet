import { describe, expect, it, vi } from "vitest";
import { ANIMATIONS, createPetController, validateAssets } from "./pet-controller.js";
import { creatureSvg } from "./creatures.js";

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
    expect(blue).toContain("stroke-width=\"6\"");
    expect(blue).toContain("#f4c531");
    expect(blue).not.toContain("M45 84q15 14");
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
