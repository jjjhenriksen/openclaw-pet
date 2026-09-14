import type { CreatureKind, LobsterFlavor, LobsterSettings } from "./pet-controller.js";

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
  const antennae = merged.antennae === "droopy" ? "M46 28Q38 19 25 25M74 28Q82 19 95 25" : "M46 28Q38 10 25 16M74 28Q82 10 95 16";
  const accessory = merged.accessory === "crown" ? `<path d="m48 30 4-10 8 7 8-7 4 10Z" fill="#f4c531" stroke="#7e5520"/>` : merged.accessory === "sprout" ? `<path d="M60 30q-2-15-10-15M58 20q8-8 12-2" stroke="#55a85b" stroke-width="4" fill="none"/>` : merged.accessory === "monocle" ? `<circle cx="73" cy="49" r="8" fill="none" stroke="#f4c531" stroke-width="2"/>` : merged.accessory === "patch" ? `<path d="M51 58h18v11H51Z" fill="#f4c531" stroke="#7e5520"/>` : merged.accessory === "pumpkin" ? `<circle cx="60" cy="29" r="9" fill="#f28c28" stroke="#7e5520"/><path d="M60 20v-4" stroke="#55a85b" stroke-width="3"/>` : merged.accessory === "party" ? `<path d="m52 29 8-13 8 13Z" fill="#72c7ff" stroke="#245a82"/>` : merged.accessory === "barnacle" ? `<circle cx="33" cy="42" r="6" fill="#d7c08a" stroke="#7e5520"/>` : merged.accessory === "santa" ? `<path d="M47 29q13-17 26 0Z" fill="#e74b4b" stroke="#7e2a20"/><circle cx="73" cy="29" r="4" fill="#fff"/>` : "";
  const tail = merged.tailFan ? `<path d="M45 84q15 14 30 0l-4 15-11-7-11 7Z" fill="${claw}"/>` : "";
  const freckles = merged.freckles ? `<g fill="#7e2a20"><circle cx="38" cy="59" r="2"/><circle cx="82" cy="59" r="2"/><circle cx="34" cy="66" r="2"/><circle cx="86" cy="66" r="2"/></g>` : "";
  const eyes = merged.personality === "sleepy" ? `<path d="M43 49q4 4 8 0M69 49q4 4 8 0" stroke="#0a1014" stroke-width="3" fill="none"/>` : `<circle cx="47" cy="49" r="4" fill="#0a1014"/><circle cx="73" cy="49" r="4" fill="#0a1014"/>`;
  const clawWidth = merged.clawSize === "dainty" ? 3 : merged.clawSize === "mighty" ? 6 : 4;
  const mouth = merged.personality === "showoff" ? "M47 75q13 12 26 0" : merged.personality === "zoomy" ? "M50 76q10 4 20 0" : "M49 76q11 8 22 0";
  return `<svg viewBox="0 0 120 105" xmlns="http://www.w3.org/2000/svg"><g transform="translate(60 0) scale(${scale}) translate(-60 0)"><g stroke="${claw}" stroke-width="${clawWidth}" stroke-linecap="round" fill="none"><path d="${antennae}"/><path d="M20 64 5 54M100 64l15-10"/></g>${accessory}<ellipse cx="60" cy="65" rx="38" ry="28" fill="${shell}"/><path d="M28 55Q5 42 6 62q1 18 24 8M92 55q23-13 22 7-1 18-24 8" fill="${claw}"/>${eyes}<path d="${mouth}" stroke="#7e2a20" stroke-width="3" fill="none"/>${freckles}${tail}</g></svg>`;
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
