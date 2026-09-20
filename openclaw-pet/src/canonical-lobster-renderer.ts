import type { LobsterFlavor, LobsterSettings } from "./pet-controller.js";
import { nothing, svg } from "./canonical-svg-template.js";
import {
  ACCESSORY_SPRITES,
  ANTENNAE_SPRITES,
  BINDLE,
  FRECKLE_SPOTS,
  GLITCH_GHOSTS,
  GRUMPY_FACE,
  HEADWEAR,
  PALETTE_OVERLAYS,
  PATTERNED_PALETTES,
  PIXEL_LOBSTER,
  RETRO_ANTENNAE,
  RETRO_FACE,
  RETRO_MEGA_CLAW,
  SAILOR_CAP,
  SELENE_MOON,
  SPLIT_HALF,
  TAIL_FAN,
} from "./canonical-sprites.js";
import {
  ACTUAL_LOBSTER,
  ASCII_LOBSTER,
  BALLOON_LOBSTER,
  FLATPACK_LOBSTER,
  LOADING_LOBSTER,
  PORTAL_LOBSTER,
  TINFOIL_PARTS,
} from "./canonical-wild.js";
import { CANONICAL_LOBSTER_STYLE } from "./canonical-lobster-style.js";

const RETRO = new Set<LobsterFlavor>(["retro", "goldenretro"]);
const SYNODIC_MONTH_DAYS = 29.53059;
const KNOWN_NEW_MOON_MS = Date.parse("2000-01-06T18:14:00.000Z");
const FRAME_CLASS: Partial<Record<LobsterFlavor, string>> = {
  heisenbug: "lob-heisenbug-frame",
  cryptid: "lob-cryptid-frame",
  balloon: "lob-balloon-frame",
};

const PALETTES: Record<LobsterFlavor, { shell: string; claw: string; shell2?: string }> = {
  crimson:{shell:"#ff4f40",claw:"#ff775f"}, blue:{shell:"#4a7dfc",claw:"#7fa4ff"}, gold:{shell:"#f4b840",claw:"#f9d47a"},
  lumen:{shell:"#1d2f4e",claw:"#2e4a77"}, magma:{shell:"#241214",claw:"#3a1d18"}, oilslick:{shell:"#15171d",claw:"#23262e"},
  aurora:{shell:"#dce6f0",claw:"#e9f0f7"}, nebula:{shell:"#34255c",claw:"#4a3a7d"}, banana:{shell:"#f7e27d",claw:"#f3d55b"},
  mood:{shell:"var(--accent, #7f77dd)",claw:"var(--accent-hover, #9a93e8)"}, bee:{shell:"#f4c531",claw:"#2b2b23"}, rubberduck:{shell:"#ffd93b",claw:"#ffb03b"},
  watermelon:{shell:"#3f9d63",claw:"#4fb072"}, clawtron:{shell:"#8d99a6",claw:"#a2aeba"}, selene:{shell:"#c9ced8",claw:"#d8dde5"},
  geode:{shell:"#6b6474",claw:"#7d7588"}, ghost:{shell:"#dce8f2",claw:"#ecf3fa"}, glass:{shell:"#cfe4f4",claw:"#e0eef8"},
  split:{shell:"#ff4f40",claw:"#ff775f",shell2:"#46536b"}, sourdough:{shell:"#d9a662",claw:"#e6bc82"}, zombie:{shell:"#9db08a",claw:"#86a17a"},
  plush:{shell:"#e8967a",claw:"#f2b09a"}, balloon:{shell:"#ff5c8a",claw:"#ff7ea1"}, cryptid:{shell:"#6e6257",claw:"#7d7263"},
  flatpack:{shell:"#d9c9a8",claw:"#d9c9a8"}, tinfoil:{shell:"#9aa4ad",claw:"#a8b2bb"}, actual:{shell:"#a63c28",claw:"#8f3220"},
  cottoncandy:{shell:"#f6a8c9",claw:"#a5c6f0"}, disco:{shell:"#b8c4d8",claw:"#cbd5e6"}, chimera:{shell:"#ff4f40",claw:"#ff775f"},
  pixel:{shell:"#d84c3e",claw:"#ef8f6a"}, blueprint:{shell:"#123a66",claw:"#123a66"}, phosphor:{shell:"#0d2415",claw:"#0f2b19"},
  ascii:{shell:"var(--lob-ascii-ink, #d8dee6)",claw:"var(--lob-ascii-ink, #d8dee6)"}, portal:{shell:"#4a9df8",claw:"#ff9a2e"}, notexture:{shell:"#ff00dc",claw:"#111111"},
  loading:{shell:"#3a4150",claw:"#454d5e"}, eclipse:{shell:"#14161d",claw:"#1d2026"}, heisenbug:{shell:"#262a33",claw:"#343945"},
  invisible:{shell:"rgba(127,140,160,0.07)",claw:"rgba(127,140,160,0.07)"}, retro:{shell:"#e8262c",claw:"#f04a3e"}, goldenretro:{shell:"#e8b422",claw:"#f6cf5a"},
};

function escapeStyle(value: string): string {
  return value.replace(/["<>]/g, "");
}

function moonPhaseFraction(date: Date): number {
  const daysSinceEpoch = (date.getTime() - KNOWN_NEW_MOON_MS) / 86_400_000;
  return (((daysSinceEpoch % SYNODIC_MONTH_DAYS) + SYNODIC_MONTH_DAYS) % SYNODIC_MONTH_DAYS) / SYNODIC_MONTH_DAYS;
}

export function canonicalLobsterSvg(settings: LobsterSettings = {}): string {
  const flavor = settings.flavor ?? "crimson";
  const palette = PALETTES[flavor];
  const retro = RETRO.has(flavor);
  const isFlatpack = flavor === "flatpack";
  const isLoading = flavor === "loading";
  const isActual = flavor === "actual";
  const isBalloon = flavor === "balloon";
  const isAscii = flavor === "ascii";
  const isPortal = flavor === "portal";
  const isPixel = flavor === "pixel";
  const isReplacementGeometry = isBalloon || isAscii || isPortal;
  const eyesClosed = false;
  const openEyeStyle = eyesClosed ? "display:none" : "";
  // The overlay is a standalone catalog/creature render. The upstream
  // renderer hides the closed-eye fallback for standalone renders; leaving it
  // visible draws the blink lids over every open eye.
  const closedEyeStyle = "display:none";
  const shell = escapeStyle(palette.shell);
  const claw = escapeStyle(palette.claw);
  const style = [
    "--lob-scale:2",
    `--lob-shell:${shell}`,
    `--lob-claw:${claw}`,
    `--lob-ascii-ink:${shell}`,
    "--lob-w:1",
    "--lob-h:1",
    "--lob-claw-l:1",
    "--lob-claw-r:1",
    ...(palette.shell2 ? [`--lob-shell2:${escapeStyle(palette.shell2)}`] : []),
    ...(flavor === "chimera"
      ? ["--lob-chimera-l:#4a7dfc", "--lob-chimera-r:#f4b840", "--lob-antennae-color:#3f9d63"]
      : []),
  ].join(";");
  const standard = svg`
    ${retro ? RETRO_ANTENNAE : ANTENNAE_SPRITES[settings.antennae ?? "perky"]}
    ${settings.tailFan && !retro ? TAIL_FAN : nothing}
    <g class="lob-claw lob-claw--l"><path d="M20 42 C5 37 0 47 5 57 C10 67 20 62 25 52 C28 45 25 42 20 42 Z" fill="var(--lob-claw)" /></g>
    ${retro ? nothing : svg`<g class="lob-claw lob-claw--r"><path d="M100 42 C115 37 120 47 115 57 C110 67 100 62 95 52 C92 45 95 42 100 42 Z" fill="var(--lob-claw)" /></g>`}
    ${flavor === "heisenbug" ? GLITCH_GHOSTS : nothing}
    <path class="lob-standard-dome" d="M60 8 C32 8 16 32 16 52 C16 72 30 90 44 95 L44 104 L54 104 L54 96 C58 97.5 62 97.5 66 96 L66 104 L76 104 L76 95 C90 90 104 72 104 52 C104 32 88 8 60 8 Z" fill="var(--lob-shell)" />
    ${flavor === "split" || flavor === "geode" ? SPLIT_HALF : nothing}
    ${flavor === "selene" ? SELENE_MOON(Math.round(moonPhaseFraction(new Date()) * 8) % 8) : nothing}
    ${PALETTE_OVERLAYS[flavor] ?? nothing}
    ${flavor === "tinfoil" ? TINFOIL_PARTS(!HEADWEAR.has(settings.accessory ?? "none")) : nothing}
    ${settings.freckles && !PATTERNED_PALETTES.has(flavor) ? FRECKLE_SPOTS : nothing}
    ${flavor === "invisible" ? nothing : svg`<ellipse cx="48" cy="28" rx="20" ry="11" fill="#ffffff" opacity="0.1" />`}
    <g class="lob-eye-open" style="${openEyeStyle}"><circle cx="45" cy="32" r="5.5" fill="#0a1014" /><circle cx="75" cy="32" r="5.5" fill="#0a1014" /><circle cx="46.5" cy="30.5" r="2.2" fill="var(--lob-glint, #00e5cc)" /><circle cx="76.5" cy="30.5" r="2.2" fill="var(--lob-glint, #00e5cc)" /></g>
    <g class="lob-eye-closed" style="${closedEyeStyle}" stroke="#0a1014" stroke-width="3" stroke-linecap="round" fill="none"><path d="M39 33 Q45 28 51 33" /><path d="M69 33 Q75 28 81 33" /></g>
  `;
  const body = isFlatpack
    ? FLATPACK_LOBSTER(openEyeStyle, closedEyeStyle)
    : isLoading
      ? LOADING_LOBSTER(openEyeStyle, closedEyeStyle)
      : isActual
        ? ACTUAL_LOBSTER(openEyeStyle, closedEyeStyle)
        : isBalloon
          ? BALLOON_LOBSTER(openEyeStyle, closedEyeStyle)
          : isAscii
            ? ASCII_LOBSTER(openEyeStyle, closedEyeStyle)
            : isPortal
              ? PORTAL_LOBSTER(openEyeStyle, closedEyeStyle)
              : isPixel
                ? PIXEL_LOBSTER(openEyeStyle, closedEyeStyle)
                : standard;
  const sleeping = settings.personality === "sleepy";
  const accessory = settings.accessory ?? "none";
  const extra = svg`
    ${retro ? svg`${RETRO_FACE}<g class="lob-claw lob-claw--r">${RETRO_MEGA_CLAW}</g>` : nothing}
    ${settings.personality === "sleepy" && !retro && !isFlatpack && !isLoading && !isActual && !isReplacementGeometry ? GRUMPY_FACE : nothing}
    ${accessory === "none" || isFlatpack ? nothing : (ACCESSORY_SPRITES[accessory] ?? nothing)}
    ${settings.personality === "showoff" && !retro && !isFlatpack ? BINDLE : nothing}
    ${settings.personality === "zoomy" && !isFlatpack && !HEADWEAR.has(accessory) && flavor !== "tinfoil" ? SAILOR_CAP : nothing}
    ${sleeping && !isReplacementGeometry ? svg`<g class="lob-eye-peek"><circle cx="45" cy="32" r="4" fill="#0a1014" /><circle cx="46" cy="30.8" r="1.6" fill="var(--lob-glint, #00e5cc)" /></g>` : nothing}
  `;
  return svg`<svg width="480" height="420" class="lobster-pet lobster-pet__svg lobster-pet--palette-${flavor}" viewBox="0 0 120 105" preserveAspectRatio="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" style="${style}"><style>${CANONICAL_LOBSTER_STYLE}</style><g class="${FRAME_CLASS[flavor] ?? ""}">${body}${extra}</g></svg>`;
}
