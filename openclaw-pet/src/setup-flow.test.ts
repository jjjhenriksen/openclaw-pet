import { describe, expect, it } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
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

it("rejects unknown flavors and inherited object keys", () => {
  expect(parseSetupArgs("lobster flavor=typo")).toMatchObject({ ok: false });
  expect(parseSetupArgs("lobster constructor=anything")).toMatchObject({ ok: false });
  expect(parseSetupArgs("lobster __proto__=anything")).toMatchObject({ ok: false });
});

it("accepts a quoted custom asset path containing spaces", () => {
  const dir = mkdtempSync(join(tmpdir(), "pet assets "));
  try {
    writeFileSync(join(dir, "pet.json"), "{}");
    const header = Buffer.alloc(30);
    header.write("RIFF", 0); header.write("WEBP", 8); header.write("VP8X", 12);
    header.writeUIntLE(1535, 24, 3); header.writeUIntLE(1871, 27, 3);
    writeFileSync(join(dir, "spritesheet.webp"), header);
    expect(parseSetupArgs(`custom "${dir}" size=224`)).toMatchObject({ ok: true, options: { assetDir: dir } });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

it("reports unreadable sprite assets instead of throwing", () => {
  const dir = mkdtempSync(join(tmpdir(), "pet-unreadable-"));
  try {
    writeFileSync(join(dir, "pet.json"), "{}");
    mkdirSync(join(dir, "spritesheet.webp"));
    expect(parseSetupArgs(`custom ${dir}`)).toMatchObject({ ok: false, message: expect.stringContaining("Asset check failed") });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
