import { isCreatureKind, LOBSTER_FLAVORS } from "./creatures.js";
import { normalizeOverlaySize } from "./overlay-service.js";
import { validateAssets, type CreatureKind, type LobsterFlavor, type PetConfig } from "./pet-controller.js";

export const CREATURE_CHOICES: readonly CreatureKind[] = ["lobster", "crab", "snail", "duck", "jellyfish"];
const CORNERS = new Set(["bottom-right", "bottom-left", "top-right", "top-left"]);
const BOOLEAN_VALUES = new Set(["true", "false"]);

export type SetupOptions = {
  creature: CreatureKind;
  assetDir?: string;
  size: number;
  corner: "bottom-right" | "bottom-left" | "top-right" | "top-left";
  showStatus: boolean;
  clickThrough: boolean;
  flavor?: LobsterFlavor;
};

function quote(value: string): string {
  return JSON.stringify(value);
}

export function setupHelp(): string {
  return [
    "OpenClaw Pet setup (preview only; it never writes config):",
    `  Built-in creatures: ${CREATURE_CHOICES.join(", ")}`,
    "  /pet setup <creature> [size=224] [corner=bottom-right] [showStatus=true] [clickThrough=false] [flavor=crimson]",
    "  /pet setup custom <absolute-asset-dir> [size=224] [corner=bottom-right]",
    "  Quote custom asset paths containing spaces.",
    "Paste the generated JSON under plugins.entries.openclaw-pet.config, then restart the Gateway.",
  ].join("\n");
}

export function parseSetupArgs(args: string): { ok: true; options: SetupOptions } | { ok: false; message: string } {
  const tokens: string[] = [];
  let remaining = args.trim();
  while (remaining) {
    const match = /^(?:"([^"]*)"|'([^']*)'|([^\s"']+))(?:\s+|$)/.exec(remaining);
    if (!match) return { ok: false, message: "Use matching quotes around paths containing spaces." };
    tokens.push(match[1] ?? match[2] ?? match[3]);
    remaining = remaining.slice(match[0].length);
  }
  if (tokens.length === 0) return { ok: false, message: setupHelp() };
  const mode = tokens.shift()!;
  let creature: CreatureKind;
  let assetDir: string | undefined;
  if (mode === "custom") {
    assetDir = tokens.shift();
    if (!assetDir || (!assetDir.startsWith("/") && !/^[A-Za-z]:[\\/]/.test(assetDir))) return { ok: false, message: "custom setup needs an absolute asset directory path." };
    creature = "lobster";
  } else if (isCreatureKind(mode)) {
    creature = mode;
  } else {
    return { ok: false, message: `Unknown creature "${mode}". Choose one of: ${CREATURE_CHOICES.join(", ")}.` };
  }

  const values: Record<string, string> = {
    size: "224", corner: "bottom-right", showStatus: "true", clickThrough: "false", flavor: "crimson",
  };
  for (const token of tokens) {
    const separator = token.indexOf("=");
    if (separator < 1) return { ok: false, message: `Expected option=value, got "${token}".` };
    const key = token.slice(0, separator);
    const value = token.slice(separator + 1);
    if (!Object.hasOwn(values, key) || !value) return { ok: false, message: `Unknown setup option "${key}".` };
    values[key] = value;
  }
  const size = normalizeOverlaySize(values.size);
  if (!size) return { ok: false, message: "size must be an integer from 96 through 768." };
  if (!CORNERS.has(values.corner)) return { ok: false, message: "corner must be bottom-right, bottom-left, top-right, or top-left." };
  if (!BOOLEAN_VALUES.has(values.showStatus) || !BOOLEAN_VALUES.has(values.clickThrough)) return { ok: false, message: "showStatus and clickThrough must be true or false." };
  if (creature !== "lobster" && values.flavor !== "crimson") return { ok: false, message: "flavor is only available for the lobster creature." };
  if (!LOBSTER_FLAVORS.includes(values.flavor as LobsterFlavor)) return { ok: false, message: `Unknown lobster flavor "${values.flavor}".` };
  const options: SetupOptions = {
    creature, assetDir, size, corner: values.corner as SetupOptions["corner"],
    showStatus: values.showStatus === "true", clickThrough: values.clickThrough === "true",
    ...(creature === "lobster" ? { flavor: values.flavor as LobsterFlavor } : {}),
  };
  if (assetDir) {
    const validation = validateAssets(assetDir);
    if (!validation.valid) return { ok: false, message: `Asset check failed: ${validation.message}` };
  }
  return { ok: true, options };
}

export function setupPreview(options: SetupOptions): string {
  const config: PetConfig = {
    ...(options.assetDir ? { assetDir: options.assetDir } : { creature: options.creature }),
    ...(options.creature === "lobster" ? { lobster: { flavor: options.flavor ?? "crimson" } } : {}),
    overlay: { enabled: true, size: options.size, corner: options.corner, showStatus: options.showStatus, clickThrough: options.clickThrough },
  };
  return [
    "OpenClaw Pet setup preview (no files changed):",
    `- selection: ${options.assetDir ? `custom assets (${options.assetDir})` : options.creature}`,
    `- assets: ${options.assetDir ? "validated" : "built-in and ready"}`,
    `- overlay: ${options.size}px at ${options.corner}; status ${options.showStatus ? "on" : "off"}; click-through ${options.clickThrough ? "on" : "off"}`,
    "Paste this JSON under plugins.entries.openclaw-pet.config:",
    JSON.stringify(config, null, 2),
    "Then restart the Gateway and run /pet status.",
  ].join("\n");
}
