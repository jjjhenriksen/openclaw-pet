import type { CreatureKind } from "./pet-controller.js";

// These compact SVGs are adapted from OpenClaw's lobster-pet sprite system.
// Keep the source attribution in THIRD_PARTY_NOTICES.md with this module.
const sprites: Record<CreatureKind, string> = {
  lobster: `<svg viewBox="0 0 120 105" xmlns="http://www.w3.org/2000/svg"><g stroke="#b84a3a" stroke-width="4" stroke-linecap="round" fill="none"><path d="M46 28Q38 10 25 16"/><path d="M74 28Q82 10 95 16"/><path d="M20 64 5 54M100 64l15-10"/></g><ellipse cx="60" cy="65" rx="38" ry="28" fill="#c44536"/><path d="M28 55Q5 42 6 62q1 18 24 8M92 55q23-13 22 7-1 18-24 8" fill="#d95f4b"/><circle cx="47" cy="49" r="4" fill="#0a1014"/><circle cx="73" cy="49" r="4" fill="#0a1014"/><path d="M49 76q11 8 22 0" stroke="#7e2a20" stroke-width="3" fill="none"/></svg>`,
  crab: `<svg viewBox="0 0 120 105" xmlns="http://www.w3.org/2000/svg"><g stroke="#a63a2e" stroke-width="4" stroke-linecap="round" fill="none"><path d="M22 78 8 88M28 88 16 99M98 78l14 10M92 88l12 11"/></g><g stroke="#c44536" stroke-width="3.5" stroke-linecap="round"><path d="M44 38 40 24M76 38l4-14"/></g><circle cx="40" cy="22" r="4.5" fill="#0a1014"/><circle cx="80" cy="22" r="4.5" fill="#0a1014"/><ellipse cx="60" cy="70" rx="46" ry="30" fill="#c44536"/><path d="M16 58C2 52-2 62 4 72c6 10 16 4 20-6 2-6-2-8-8-8ZM104 58c14-6 18 4 12 14-6 10-16 4-20-6-2-6 2-8 8-8Z" fill="#d95f4b"/><path d="M48 82q12 8 24 0" stroke="#7e2a20" stroke-width="3" fill="none"/></svg>`,
  snail: `<svg viewBox="0 0 120 105" xmlns="http://www.w3.org/2000/svg"><path d="M14 96q18-12 44-8h38q14 2 16 9 0 6-10 6H24q-10 0-10-7Z" fill="#c9a06a"/><g stroke="#c9a06a" stroke-width="3.5" stroke-linecap="round"><path d="M94 88q2-12-3-20M103 88q4-12 0-22"/></g><circle cx="90" cy="65" r="3.6" fill="#0a1014"/><circle cx="103" cy="63" r="3.6" fill="#0a1014"/><circle cx="50" cy="62" r="27" fill="#8a5a2b"/><path d="M50 41a21 21 0 1 1-15 36 14 14 0 1 0 11-25 8 8 0 1 0 4 14" stroke="#5f3d1c" stroke-width="4" fill="none"/></svg>`,
  duck: `<svg viewBox="0 0 120 105" xmlns="http://www.w3.org/2000/svg"><ellipse cx="58" cy="85" rx="34" ry="17" fill="#ffd23e"/><circle cx="82" cy="50" r="18" fill="#ffd23e"/><path d="M98 49q14 3 1 10-4-3-4-8Z" fill="#ff8c2e"/><circle cx="86" cy="44" r="3.6" fill="#0a1014"/><path d="M30 82q-10-8-3-17 3 11 13 14Z" fill="#f0b52e"/></svg>`,
  jellyfish: `<svg viewBox="0 0 120 105" xmlns="http://www.w3.org/2000/svg"><g stroke="#9f7dfa" stroke-width="2.5" stroke-linecap="round" fill="none" opacity=".8"><path d="M40 58q-5 16 2 32M54 61q-2 17 3 35M68 61q3 17-4 33M80 58q5 14-2 30"/></g><path d="M30 52c0-30 60-30 60 0v6q-8-6-15 0-8-6-15 0-8-6-15 0-7-6-15 0Z" fill="#b79bff" opacity=".78"/><circle cx="52" cy="45" r="2.6" fill="#0a1014"/><circle cx="66" cy="45" r="2.6" fill="#0a1014"/></svg>`,
};

export function creatureSvg(kind: CreatureKind): string {
  return sprites[kind];
}

export function isCreatureKind(value: unknown): value is CreatureKind {
  return typeof value === "string" && value in sprites;
}
