import { describe, expect, it } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { parseSetupArgs, setupHelp, setupPreview } from "./setup-flow.js";

describe("pet setup flow", () => {
  it("lists built-in choices and renders an explicit overlay config", () => {
    const parsed = parseSetupArgs("lobster size=288 corner=top-left showStatus=false clickThrough=true flavor=blue");
    expect(parsed).toEqual({ ok: true, options: { creature: "lobster", size: 288, corner: "top-left", showStatus: false, clickThrough: true, flavor: "blue" } });
    const preview = setupPreview((parsed as { ok: true; options: any }).options);
    expect(preview).toContain('"creature": "lobster"');
    expect(preview).toContain('"size": 288');
    expect(preview).toContain('"corner": "top-left"');
    expect(setupHelp()).toContain("lobster, crab, snail, duck, jellyfish");
  });

  it("validates custom assets before producing a preview", () => {
    const dir = mkdtempSync(join(tmpdir(), "openclaw-pet-"));
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "pet.json"), "{}");
    writeFileSync(join(dir, "spritesheet.webp"), Buffer.from("not-webp"));
    expect(parseSetupArgs(`custom ${dir}`)).toMatchObject({ ok: false, message: expect.stringContaining("Asset check failed") });
  });

  it("rejects unsafe or ambiguous setup options", () => {
    expect(parseSetupArgs("dragon")).toMatchObject({ ok: false, message: expect.stringContaining("Unknown creature") });
    expect(parseSetupArgs("duck size=95")).toMatchObject({ ok: false, message: expect.stringContaining("96 through 768") });
    expect(parseSetupArgs("duck corner=middle")).toMatchObject({ ok: false, message: expect.stringContaining("corner") });
  });
});
