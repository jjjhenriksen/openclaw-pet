import type { CreatureKind, LobsterFlavor, LobsterSettings } from "./pet-controller.js";

/** The complete Lobsterdex palette contract, kept in canonical display order. */
export const LOBSTER_FLAVORS = [
  "crimson", "blue", "gold", "lumen", "magma", "oilslick", "aurora", "nebula", "banana", "mood", "bee", "rubberduck",
  "watermelon", "clawtron", "selene", "geode", "ghost", "glass", "split", "sourdough", "zombie", "plush", "balloon", "cryptid",
  "flatpack", "tinfoil", "actual", "cottoncandy", "disco", "chimera", "pixel", "blueprint", "phosphor", "ascii", "portal", "notexture",
  "loading", "eclipse", "heisenbug", "invisible", "retro", "goldenretro",
] as const satisfies readonly LobsterFlavor[];

const lobsterPalettes: Record<LobsterFlavor, [string, string]> = {
  crimson: ["#ff4f40", "#ff775f"], blue: ["#4a7dfc", "#7fa4ff"], gold: ["#f4b840", "#f9d47a"], lumen: ["#1d2f4e", "#2e4a77"],
  magma: ["#7d332a", "#b04d3d"], oilslick: ["#303746", "#566174"], aurora: ["#dce6f0", "#9fd6d0"], nebula: ["#34255c", "#7f61c5"],
  banana: ["#f7e27d", "#f3d55b"], mood: ["#7f77dd", "#9a93e8"], bee: ["#f4c531", "#2b2b23"], rubberduck: ["#ffd93b", "#ffb03b"],
  watermelon: ["#3f9d63", "#e76f51"], clawtron: ["#8d99a6", "#a2aeba"], selene: ["#c9ced8", "#8d98aa"], geode: ["#6b6474", "#b18bd4"],
  ghost: ["#dce8f2", "#ecf3fa"], glass: ["#cfe4f4", "#e0eef8"], split: ["#ff4f40", "#4a7dfc"], sourdough: ["#d9a662", "#e6bc82"],
  zombie: ["#9db08a", "#86a17a"], plush: ["#e8967a", "#f2b09a"], balloon: ["#ff5c8a", "#ff7ea1"], cryptid: ["#6e6257", "#7d7263"],
  flatpack: ["#d9c9a8", "#b9a47b"], tinfoil: ["#9aa4ad", "#a8b2bb"], actual: ["#a63c28", "#8f3220"], cottoncandy: ["#f6a8c9", "#a5c6f0"],
  disco: ["#b8c4d8", "#ec77c8"], chimera: ["#b0685a", "#4a7dfc"], pixel: ["#d84c3e", "#ef8f6a"], blueprint: ["#123a66", "#4f83b5"],
  phosphor: ["#2f8d57", "#7fe39e"], ascii: ["#d8dee6", "#aab5c4"], portal: ["#4a9df8", "#ff9a2e"], notexture: ["#ff00dc", "#111111"],
  loading: ["#3a4150", "#454d5e"], eclipse: ["#14161d", "#1d2026"], heisenbug: ["#262a33", "#343945"], invisible: ["#91a0b5", "#91a0b5"],
  retro: ["#e8262c", "#f04a3e"], goldenretro: ["#e8b422", "#f6cf5a"],
};

const lobsterDefaults: Required<Omit<LobsterSettings, "flavor">> = {
  personality: "friendly", antennae: "perky", build: "round", clawSize: "regular", accessory: "none", tailFan: true, freckles: false,
};

function lobsterSvg(settings: LobsterSettings = {}): string {
  const flavor = settings.flavor ?? "crimson";
  const [shell, claw] = lobsterPalettes[flavor] ?? lobsterPalettes.crimson;
  const merged = { ...lobsterDefaults, ...settings };
  const scale = merged.build === "squat" ? "1.08 .9" : merged.build === "slender" ? ".9 1.08" : "1 1";
  // These coordinates intentionally mirror OpenClaw's Lobsterdex renderer.
  // The golden retro variant is the classic-logo geometry, not the standard
  // two-claw dome with a different fill.
  const retro = flavor === "retro" || flavor === "goldenretro";
  const antennae = retro
    ? "M50 16Q45 4 37 1M70 16Q75 4 83 1"
    : merged.antennae === "droopy"
      ? "M46 14Q36 8 34 18M74 14Q84 8 86 18"
      : "M46 14Q38 4 31 7M74 14Q82 4 89 7";
  const accessory = merged.accessory === "crown" ? `<path data-layer="accessory" d="m48 30 4-10 8 7 8-7 4 10Z" fill="#f4c531" stroke="#7e5520"/>` : merged.accessory === "sprout" ? `<path data-layer="accessory" d="M60 30q-2-15-10-15M58 20q8-8 12-2" stroke="#55a85b" stroke-width="4" fill="none"/>` : merged.accessory === "monocle" ? `<circle data-layer="accessory" cx="73" cy="49" r="8" fill="none" stroke="#f4c531" stroke-width="2"/>` : merged.accessory === "patch" ? `<path data-layer="accessory" d="M51 58h18v11H51Z" fill="#f4c531" stroke="#7e5520"/>` : merged.accessory === "pumpkin" ? `<g data-layer="accessory"><circle cx="60" cy="29" r="9" fill="#f28c28" stroke="#7e5520"/><path d="M60 20v-4" stroke="#55a85b" stroke-width="3"/></g>` : merged.accessory === "party" ? `<path data-layer="accessory" d="m52 29 8-13 8 13Z" fill="#72c7ff" stroke="#245a82"/>` : merged.accessory === "barnacle" ? `<circle data-layer="accessory" cx="33" cy="42" r="6" fill="#d7c08a" stroke="#7e5520"/>` : merged.accessory === "santa" ? `<g data-layer="accessory"><path d="M47 29q13-17 26 0Z" fill="#e74b4b" stroke="#7e2a20"/><circle cx="73" cy="29" r="4" fill="#fff"/></g>` : "";
  // The Lobsterdex logo uses a small left shoulder claw; its tail fan is
  // intentionally omitted from the retro identity rather than becoming two
  // feet-like blobs beneath the body.
  const tail = merged.tailFan && !retro ? `<g data-layer="tail" fill="${claw}"><ellipse cx="16" cy="84" rx="11" ry="7" transform="rotate(-32 16 84)"/><ellipse cx="104" cy="84" rx="11" ry="7" transform="rotate(32 104 84)"/></g>` : "";
  const freckles = merged.freckles ? `<g data-layer="freckles" fill="#7e2a20"><circle cx="38" cy="59" r="2"/><circle cx="82" cy="59" r="2"/><circle cx="34" cy="66" r="2"/><circle cx="86" cy="66" r="2"/></g>` : "";
  const eyes = retro
    ? `<g data-layer="eyes" stroke="#0a1014" stroke-linecap="round" fill="none"><path d="M37 24L51 28" stroke-width="3.5"/><path d="M69 28L83 24" stroke-width="3.5"/></g><circle data-layer="eyes" cx="45" cy="32" r="5.5" fill="#0a1014"/><circle data-layer="eyes" cx="75" cy="32" r="5.5" fill="#0a1014"/><circle data-layer="eyes" cx="46.5" cy="30.5" r="2.2" fill="#00e5cc"/><circle data-layer="eyes" cx="76.5" cy="30.5" r="2.2" fill="#00e5cc"/>`
    : merged.personality === "sleepy"
      ? `<path data-layer="eyes" d="M39 33Q45 28 51 33M69 33Q75 28 81 33" stroke="#0a1014" stroke-width="3" fill="none"/>`
      : `<circle data-layer="eyes" cx="45" cy="32" r="5.5" fill="#0a1014"/><circle data-layer="eyes" cx="75" cy="32" r="5.5" fill="#0a1014"/><circle data-layer="eyes" cx="46.5" cy="30.5" r="2.2" fill="#00e5cc"/><circle data-layer="eyes" cx="76.5" cy="30.5" r="2.2" fill="#00e5cc"/>`;
  const clawWidth = merged.clawSize === "dainty" ? 3 : merged.clawSize === "mighty" ? 6 : 4;
  const mouth = merged.personality === "showoff" ? "M47 75q13 12 26 0" : merged.personality === "zoomy" ? "M50 76q10 4 20 0" : "M49 76q11 8 22 0";
  const standardClaws = `<g data-layer="claws" class="lob-claw lob-claw--l"><path d="M20 42C5 37 0 47 5 57C10 67 20 62 25 52C28 45 25 42 20 42Z" fill="${claw}" stroke="#fff" stroke-width="3" stroke-linejoin="round"/></g><g data-layer="claws" class="lob-claw lob-claw--r"><path d="M100 42C115 37 120 47 115 57C110 67 100 62 95 52C92 45 95 42 100 42Z" fill="${claw}" stroke="#fff" stroke-width="3" stroke-linejoin="round"/></g>`;
  const retroLeftClaw = `<g data-layer="claws" class="lob-claw lob-claw--l"><path d="M24 57C10 51 5 58 10 67C15 75 24 71 29 63C31 59 29 57 24 57Z" fill="${claw}" stroke="#fff" stroke-width="3" stroke-linejoin="round"/></g>`;
  const megaClaw = `<g data-layer="claws" class="lob-claw lob-claw--r"><path d="M95 55C112 53 119 39 116 25C113 11 99 5 91 12C88 15 87 19 88 23C83 27 83 36 88 43C91 49 93 52 95 55Z" fill="${claw}" stroke="#fff" stroke-width="3" stroke-linejoin="round"/><path d="M92 14C97 22 99 31 95 41" stroke="${flavor === "goldenretro" ? "#b8860b" : "#b8151b"}" stroke-width="3" stroke-linecap="round" fill="none"/></g>`;
  const body = `<path data-layer="body" class="lob-standard-dome" d="M60 8C32 8 16 32 16 52C16 72 30 90 44 95L44 104L54 104L54 96C58 97.5 62 97.5 66 96L66 104L76 104L76 95C90 90 104 72 104 52C104 32 88 8 60 8Z" fill="${shell}" stroke="#fff" stroke-width="3" stroke-linejoin="round"/>`;
  const specialGeometry = flavor === "split" || flavor === "geode"
    ? `<path data-layer="split" d="M60 8C88 8 104 32 104 52C104 72 90 90 76 95L76 104L66 104L66 96C64 96.8 62 97.1 60 97.1L60 8Z" fill="${flavor === "geode" ? "#9b6ff0" : claw}" opacity=".72"/>`
    : "";
  const canonicalOverlay: Record<string, string> = {
    lumen: `<g data-layer="lumen" fill="#7ef5dd"><circle cx="36" cy="54" r="2.4"/><circle cx="50" cy="66" r="2"/><circle cx="66" cy="70" r="2.2"/><circle cx="80" cy="60" r="2"/><circle cx="88" cy="46" r="1.7"/><circle cx="60" cy="86" r="1.7"/></g>`,
    magma: `<g data-layer="magma" fill="none" stroke="#ff6a3d" stroke-width="2"><path d="M40 44L48 54L42 66L50 78"/><path d="M74 40L68 52L78 64"/><path d="M56 82L62 90"/></g>`,
    oilslick: `<g data-layer="oilslick"><ellipse cx="46" cy="60" rx="22" ry="11" fill="#7f77dd" opacity=".3" transform="rotate(-14 46 60)"/><ellipse cx="76" cy="74" rx="17" ry="8" fill="#1d9e75" opacity=".28"/></g>`,
    aurora: `<g data-layer="aurora" fill="none" stroke-linecap="round"><path d="M24 62Q48 48 70 58T102 54" stroke="#4ecfa6" stroke-width="6" opacity=".5"/><path d="M28 76Q54 62 78 72T100 68" stroke="#a184ec" stroke-width="5" opacity=".45"/></g>`,
    nebula: `<g data-layer="nebula" fill="#fff"><circle cx="38" cy="52" r="1"/><circle cx="52" cy="70" r="1.2"/><circle cx="84" cy="48" r="1.4"/><circle cx="66" cy="86" r="1"/><path d="M60 52L61.5 55.5L65 57L61.5 58.5L60 62L58.5 58.5L55 57L58.5 55.5Z"/></g>`,
    banana: `<g data-layer="banana" fill="#8a6430"><rect x="56" y="8" width="8" height="6" rx="2.5"/><circle cx="37" cy="48" r="2.5"/><circle cx="79" cy="55" r="2"/><circle cx="47" cy="70" r="1.8"/><circle cx="72" cy="79" r="2.3"/></g>`,
    bee: `<g data-layer="bee"><g fill="#fff" opacity=".45"><ellipse cx="38" cy="14" rx="8" ry="4.5"/><ellipse cx="82" cy="14" rx="8" ry="4.5"/></g><g fill="#2b2b23" opacity=".9"><path d="M19 42Q60 51 101 42L103 50Q60 60 17 50Z"/><path d="M17 58Q60 67 103 58L101 67Q60 76 19 67Z"/><path d="M24 76Q60 84 96 76L90 85Q60 92 30 85Z"/></g></g>`,
    watermelon: `<g data-layer="watermelon"><path d="M31 25Q39 13 48 11M48 22Q54 10 60 9M66 22Q72 10 80 15M82 28Q89 20 94 30" stroke="#2c7a4a" stroke-width="4" fill="none"/><ellipse cx="60" cy="69" rx="35" ry="23" fill="#e5484d"/><g fill="#28211c"><ellipse cx="42" cy="62" rx="2" ry="3.4"/><ellipse cx="58" cy="58" rx="2" ry="3.4"/><ellipse cx="76" cy="64" rx="2" ry="3.4"/><ellipse cx="49" cy="77" rx="2" ry="3.4"/><ellipse cx="68" cy="79" rx="2" ry="3.4"/></g></g>`,
    clawtron: `<g data-layer="clawtron" fill="none" stroke="#5f6a75" stroke-width="1.5"><path d="M28 56Q60 66 92 56"/><path d="M34 74Q60 82 86 74"/><circle cx="36" cy="61" r="1.4" fill="#ff4444"/><circle cx="60" cy="64" r="1.4" fill="#ff4444"/><circle cx="84" cy="61" r="1.4" fill="#ff4444"/></g>`,
    selene: `<g data-layer="selene"><circle cx="60" cy="64" r="12" fill="#26304a"/><circle cx="60" cy="64" r="11" fill="none" stroke="#f4f7fc"/></g>`,
    glass: `<g data-layer="glass" fill="none" stroke="#fff" stroke-width="2.5" opacity=".7"><path d="M34 22L28 32"/><path d="M40 16L37 22"/></g>`,
    sourdough: `<g data-layer="sourdough" fill="none" stroke="#a8763e" stroke-width="2.5"><path d="M38 23Q45 29 52 30"/><path d="M52 17Q59 24 66 25"/><path d="M67 18Q74 24 81 25"/></g>`,
    zombie: `<g data-layer="zombie" fill="none" stroke="#5a6b52" stroke-width="2"><path d="M32 24Q47 19 61 23"/><path d="M38 19L40 26M46 18L47 25M54 19L53 26"/><path d="M57 72Q72 78 87 72"/></g>`,
    plush: `<g data-layer="plush" fill="none" stroke="#c97a5e" stroke-width="1.5" stroke-dasharray="3 3"><path d="M30 32Q60 4 90 32"/><path d="M60 50Q58 72 60 96"/><circle cx="78" cy="44" r="3.5" fill="#7a4a3a"/></g>`,
    disco: `<g data-layer="disco" fill="#fff" opacity=".45"><rect x="42" y="18" width="4" height="4"/><rect x="52" y="16" width="4" height="4"/><rect x="63" y="17" width="4" height="4"/><rect x="74" y="20" width="4" height="4"/><rect x="51" y="62" width="4" height="4"/><rect x="68" y="60" width="4" height="4"/><rect x="70" y="80" width="4" height="4"/></g>`,
    blueprint: `<g data-layer="blueprint" fill="none" stroke="#cfe3ff"><path d="M60 8C32 8 16 32 16 52C16 72 30 90 44 95L44 104M76 95L76 104" stroke-width="1.5" stroke-dasharray="5 3"/><path d="M54 58H66M60 52V64"/></g>`,
    phosphor: `<g data-layer="phosphor" stroke="#3fff7d" opacity=".2"><path d="M40 20H80M30 27H90M26 34H94M21 41H99M18 48H102M17 55H103M17 62H103M18 69H102M22 76H98M31 83H89"/></g>`,
    heisenbug: `<g data-layer="heisenbug" opacity=".4"><path d="M60 8C32 8 16 32 16 52C16 72 30 90 44 95L44 104L54 104L54 96L66 96L66 104L76 104L76 95C90 90 104 72 104 52C104 32 88 8 60 8Z" transform="translate(-3 0)" fill="#ff3355"/><path d="M60 8C32 8 16 32 16 52C16 72 30 90 44 95L44 104L54 104L54 96L66 96L66 104L76 104L76 95C90 90 104 72 104 52C104 32 88 8 60 8Z" transform="translate(3 1)" fill="#22d3ee"/></g>`,
    notexture: `<g data-layer="notexture" shape-rendering="crispEdges">${Array.from({length: 8}, (_, i) => `<path d="M${28 + i * 2} ${24 + i * 7}H${92 - i * 2}" stroke="${i % 2 ? "#111" : "#ff00dc"}" stroke-width="6"/>`).join("")}</g>`,
    eclipse: `<path data-layer="eclipse" d="M29 31Q40 10 61 9Q82 9 94 31" fill="none" stroke="#ffe9b8" stroke-width="2.5"/>`,
    chimera: `<g data-layer="chimera" fill="none" stroke="#4a3f3a" stroke-width="1.8"><path d="M18 47L27 50M19 51L22 46M23 53L26 48"/><path d="M93 50L102 47M94 48L97 53M98 46L101 51"/></g>`,
    tinfoil: `<g data-layer="tinfoil" fill="none" stroke="#c9d2da" stroke-width="1.5"><path d="M27 31L38 27L45 34L55 25L64 33L75 26L91 34"/><path d="M20 51L31 45L43 54L55 45L68 54L82 44L100 53"/><path d="M23 70L36 64L47 73L60 63L74 72L90 65L98 72"/></g>`,
  };
  const paletteOverlay = flavor === "rubberduck"
    ? `<g data-layer="rubberduck"><ellipse cx="60" cy="71" rx="21" ry="14" fill="#fff" opacity=".5"/><rect x="47" y="41" width="26" height="8" rx="4" fill="#ff9a2e"/><rect x="50" y="47" width="20" height="5" rx="2.5" fill="#e98322"/></g>`
    : canonicalOverlay[flavor] ?? "";
  const highlight = flavor === "goldenretro" ? `<g data-layer="highlight"><path d="M31 27Q48 11 68 14" stroke="#fff3a6" stroke-width="4" stroke-linecap="round" opacity=".7" fill="none"/><path d="M42 67Q60 79 78 67" stroke="#f8d96b" stroke-width="3" opacity=".6" fill="none"/></g>` : `<ellipse data-layer="highlight" cx="48" cy="28" rx="20" ry="11" fill="#ffffff" opacity=".1"/>`;
  const retroFace = retro ? `<path data-layer="face" d="M49 45Q59 51 69 45L72 42" stroke="#0a1014" stroke-width="3" stroke-linecap="round" fill="none"/>` : `<path data-layer="face" d="${mouth}" stroke="#7e2a20" stroke-width="3" fill="none"/>`;
  const replacement = flavor === "flatpack"
    ? `<g data-layer="flatpack" fill="none" stroke="#8a7c5f" stroke-width="1.5" stroke-dasharray="4 3"><path d="M48 10C28 10 17 25 17 41C17 58 29 69 48 69C67 69 79 58 79 41C79 25 68 10 48 10Z" fill="${shell}"/><path d="M27 48Q50 58 75 61M68 47Q79 58 92 70M84 24L101 8M93 31L113 14" stroke-width="3"/><path d="M101 84V99H115" stroke-width="3"/></g>`
    : flavor === "loading"
      ? `<g data-layer="loading" fill="#2f3542"><rect x="24" y="18" width="72" height="64" rx="10"/><rect x="2" y="43" width="24" height="20" rx="8"/><rect x="94" y="43" width="24" height="20" rx="8"/><path d="M45 21L34 7M75 21L86 7" stroke="#39404f" stroke-width="6" stroke-linecap="round"/><path d="M31 79H41V101H31ZM46 79H56V103H46ZM64 79H74V103H64ZM79 79H89V101H79Z"/></g>`
      : flavor === "actual"
        ? `<g data-layer="actual"><g fill="none" stroke="#7f3022" stroke-width="2"><path d="M47 27Q27 5 2 3M73 27Q93 5 118 3M39 48Q22 52 10 65M38 56Q20 62 8 77M81 48Q98 52 110 65M82 56Q100 62 112 77"/></g><path d="M60 20Q38 20 34 38Q32 50 41 58Q49 64 60 64Q71 64 79 58Q88 50 86 38Q82 20 60 20Z" fill="${shell}" stroke="#6f281d"/><g fill="#a63c28"><path d="M39 54Q60 62 81 54L79 65Q60 72 41 65Z"/><path d="M41 65Q60 72 79 65L76 76Q60 82 44 76Z"/><path d="M44 76Q60 82 76 76L72 87Q60 92 48 87Z"/></g></g>`
        : flavor === "balloon"
          ? `<g data-layer="balloon" fill="${shell}"><ellipse cx="60" cy="29" rx="24" ry="19"/><ellipse cx="60" cy="61" rx="18" ry="14"/><ellipse cx="60" cy="86" rx="13" ry="10"/><g fill="#fff" opacity=".55"><ellipse cx="50" cy="22" rx="4" ry="10"/><ellipse cx="52" cy="56" rx="3" ry="7"/><ellipse cx="54" cy="82" rx="2.4" ry="5"/></g><path d="M55 96L60 91L65 96L60 101Z" fill="#d94b72"/></g>`
          : flavor === "ascii"
            ? `<g data-layer="ascii" fill="${shell}" font-family="ui-monospace,monospace" font-size="11" text-anchor="middle"><text x="60" y="17">\\ /       \\ /</text><text x="60" y="31">{  \\_____/  }</text><text x="60" y="45">(o)   (o)</text><text x="60" y="59">(  '---'  )</text><text x="60" y="73"> \\ _____ /</text><text x="60" y="87"> (_______)</text><text x="60" y="101">   | | |</text></g>`
            : flavor === "portal"
              ? `<g data-layer="portal"><ellipse cx="30" cy="50" rx="14" ry="30" fill="#0d1b33" stroke="#4a9df8" stroke-width="3" transform="rotate(-12 30 50)"/><path d="M31 30Q45 20 56 30Q62 39 60 53Q58 64 47 70L31 67Z" fill="#b0432f"/><ellipse cx="92" cy="58" rx="14" ry="30" fill="#0d1b33" stroke="#ff9a2e" stroke-width="3" transform="rotate(10 92 58)"/></g>`
              : flavor === "pixel"
                ? `<g data-layer="pixel" shape-rendering="crispEdges" fill="${shell}"><path d="M42 12H78V18H84V24H90V30H96V78H90V90H84V105H72V96H48V105H36V90H30V78H24V30H30V24H36V18H42Z"/><g fill="#ef8f6a"><rect x="36" y="24" width="24" height="6"/><rect x="30" y="30" width="18" height="12"/></g></g>`
                : "";
  // Keep the built-in source free of blur filters. The native overlay may
  // render its WebView at a different backing scale; a filtered SVG gets
  // cached as a bitmap and then enlarged, producing a fuzzy colored fringe.
  // Give the SVG a large intrinsic surface as well as a viewBox. The
  // geometry remains vector and the CSS scales it down to the pet box; this
  // avoids handing WebKit a tiny intrinsic image that it may cache at 1x.
  if (replacement) {
    return `<svg width="480" height="420" viewBox="0 0 120 105" preserveAspectRatio="xMidYMid meet" shape-rendering="geometricPrecision" xmlns="http://www.w3.org/2000/svg"><g transform="translate(60 0) scale(${scale}) translate(-60 0)">${replacement}</g></svg>`;
  }
  return `<svg width="480" height="420" viewBox="0 0 120 105" preserveAspectRatio="xMidYMid meet" shape-rendering="geometricPrecision" xmlns="http://www.w3.org/2000/svg"><g transform="translate(60 0) scale(${scale}) translate(-60 0)"><g data-layer="antennae" stroke="${claw}" stroke-width="${clawWidth}" stroke-linecap="round" fill="none"><path d="${antennae}"/>${retro ? "" : "<path d=\"M20 42L5 37M100 42l15-5\"/>"}</g>${retro ? retroLeftClaw + megaClaw : standardClaws}${tail}${body}${specialGeometry}${paletteOverlay}${highlight}${eyes}${retroFace}${freckles}${accessory}</g></svg>`;
}

// These compact SVGs are adapted from OpenClaw's lobster-pet sprite system.
// Keep the source attribution in THIRD_PARTY_NOTICES.md with this module.
const sprites: Record<CreatureKind, string> = {
  lobster: `<svg viewBox="0 0 120 105" xmlns="http://www.w3.org/2000/svg"><g stroke="#b84a3a" stroke-width="4" stroke-linecap="round" fill="none"><path d="M46 28Q38 10 25 16"/><path d="M74 28Q82 10 95 16"/><path d="M20 64 5 54M100 64l15-10"/></g><ellipse cx="60" cy="65" rx="38" ry="28" fill="#c44536"/><path d="M28 55Q5 42 6 62q1 18 24 8M92 55q23-13 22 7-1 18-24 8" fill="#d95f4b"/><circle cx="47" cy="49" r="4" fill="#0a1014"/><circle cx="73" cy="49" r="4" fill="#0a1014"/><path d="M49 76q11 8 22 0" stroke="#7e2a20" stroke-width="3" fill="none"/></svg>`,
  crab: `<svg viewBox="0 0 120 105" xmlns="http://www.w3.org/2000/svg"><g stroke="#a63a2e" stroke-width="4" stroke-linecap="round" fill="none"><path d="M22 78 8 88M28 88 16 99M98 78l14 10M92 88l12 11"/></g><g stroke="#c44536" stroke-width="3.5" stroke-linecap="round"><path d="M44 38 40 24M76 38l4-14"/></g><circle cx="40" cy="22" r="4.5" fill="#0a1014"/><circle cx="80" cy="22" r="4.5" fill="#0a1014"/><ellipse cx="60" cy="70" rx="46" ry="30" fill="#c44536"/><path d="M16 58C2 52-2 62 4 72c6 10 16 4 20-6 2-6-2-8-8-8ZM104 58c14-6 18 4 12 14-6 10-16 4-20-6-2-6 2-8 8-8Z" fill="#d95f4b"/><path d="M48 82q12 8 24 0" stroke="#7e2a20" stroke-width="3" fill="none"/></svg>`,
  snail: `<svg viewBox="0 0 120 105" xmlns="http://www.w3.org/2000/svg"><path d="M14 96q18-12 44-8h38q14 2 16 9 0 6-10 6H24q-10 0-10-7Z" fill="#c9a06a"/><g stroke="#c9a06a" stroke-width="3.5" stroke-linecap="round"><path d="M94 88q2-12-3-20M103 88q4-12 0-22"/></g><circle cx="90" cy="65" r="3.6" fill="#0a1014"/><circle cx="103" cy="63" r="3.6" fill="#0a1014"/><circle cx="50" cy="62" r="27" fill="#8a5a2b"/><path d="M50 41a21 21 0 1 1-15 36 14 14 0 1 0 11-25 8 8 0 1 0 4 14" stroke="#5f3d1c" stroke-width="4" fill="none"/></svg>`,
  duck: `<svg viewBox="0 0 120 105" xmlns="http://www.w3.org/2000/svg"><ellipse cx="58" cy="85" rx="34" ry="17" fill="#ffd23e"/><circle cx="82" cy="50" r="18" fill="#ffd23e"/><path d="M98 49q14 3 1 10-4-3-4-8Z" fill="#ff8c2e"/><circle cx="86" cy="44" r="3.6" fill="#0a1014"/><path d="M30 82q-10-8-3-17 3 11 13 14Z" fill="#f0b52e"/></svg>`,
  jellyfish: `<svg viewBox="0 0 120 105" xmlns="http://www.w3.org/2000/svg"><g stroke="#9f7dfa" stroke-width="2.5" stroke-linecap="round" fill="none" opacity=".8"><path d="M40 58q-5 16 2 32M54 61q-2 17 3 35M68 61q3 17-4 33M80 58q5 14-2 30"/></g><path d="M30 52c0-30 60-30 60 0v6q-8-6-15 0-8-6-15 0-8-6-15 0-7-6-15 0Z" fill="#b79bff" opacity=".78"/><circle cx="52" cy="45" r="2.6" fill="#0a1014"/><circle cx="66" cy="45" r="2.6" fill="#0a1014"/></svg>`,
};

export function creatureSvg(kind: CreatureKind, lobster?: LobsterSettings): string {
  return kind === "lobster" ? lobsterSvg(lobster) : sprites[kind];
}

export function isCreatureKind(value: unknown): value is CreatureKind {
  return typeof value === "string" && value in sprites;
}
