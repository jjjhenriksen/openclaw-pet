import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const ANIMATIONS = {
  idle: { row: 0, frames: 6, durations: [280, 110, 110, 140, 140, 320] },
  "running-right": { row: 1, frames: 8, durations: [120, 120, 120, 120, 120, 120, 120, 220] },
  "running-left": { row: 2, frames: 8, durations: [120, 120, 120, 120, 120, 120, 120, 220] },
  waving: { row: 3, frames: 4, durations: [140, 140, 140, 280] },
  jumping: { row: 4, frames: 5, durations: [140, 140, 140, 140, 280] },
  failed: { row: 5, frames: 8, durations: [140, 140, 140, 140, 140, 140, 140, 240] },
  waiting: { row: 6, frames: 6, durations: [150, 150, 150, 150, 150, 260] },
  running: { row: 7, frames: 6, durations: [120, 120, 120, 120, 120, 220] },
  review: { row: 8, frames: 6, durations: [150, 150, 150, 150, 150, 280] },
} as const;

export type Animation = keyof typeof ANIMATIONS;
export type PetSourceConfig = {
  id: string;
  label?: string;
  assetDir?: string;
  size?: number;
  gateway?: {
    url: string;
    tokenEnv?: string;
    pollIntervalMs?: number;
    timeoutMs?: number;
  };
};
export type PetConfig = {
  assetDir?: string;
  sources?: PetSourceConfig[];
  enabled?: boolean;
  idleDelayMs?: number;
  scope?: "global";
  overlay?: {
    enabled?: boolean;
    size?: number;
    corner?: "bottom-right" | "bottom-left" | "top-right" | "top-left";
    showStatus?: boolean;
    clickThrough?: boolean;
  };
};
export type ActivityItem = { id: number; label: string; tone: "active" | "success" | "error" | "neutral"; at: number };
export type PetSnapshot = { valid: boolean; assetDir?: string; animation: Animation; changedAt: number; activeRuns: number; activityCount: number; lastEvent: string; activityLabel: string; activity: ActivityItem[]; lastError?: string; message: string };

function webpDimensions(buffer: Buffer): { width: number; height: number } | null {
  if (buffer.subarray(0, 4).toString() !== "RIFF" || buffer.subarray(8, 12).toString() !== "WEBP") return null;
  const kind = buffer.subarray(12, 16).toString();
  if (kind === "VP8X" && buffer.length >= 30) return { width: 1 + buffer.readUIntLE(24, 3), height: 1 + buffer.readUIntLE(27, 3) };
  if (kind === "VP8 " && buffer.length >= 30) return { width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff };
  if (kind === "VP8L" && buffer.length >= 25) { const bits = buffer.readUInt32LE(21); return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 }; }
  return null;
}

export function validateAssets(assetDir?: string): Pick<PetSnapshot, "valid" | "assetDir" | "lastError" | "message"> {
  if (!assetDir) return { valid: false, lastError: "assetDir is required", message: "Pet disabled: configure assetDir." };
  const manifest = join(assetDir, "pet.json"), sheet = join(assetDir, "spritesheet.webp");
  if (!existsSync(manifest) || !existsSync(sheet)) return { valid: false, lastError: "missing required pet files", message: "Pet disabled: pet.json and spritesheet.webp are required." };
  try { JSON.parse(readFileSync(manifest, "utf8")); } catch { return { valid: false, lastError: "invalid pet.json", message: "Pet disabled: pet.json is not valid JSON." }; }
  const dimensions = webpDimensions(readFileSync(sheet));
  if (!dimensions || dimensions.width !== 1536 || dimensions.height < 1872 || dimensions.height % 208 !== 0) return { valid: false, lastError: "invalid sprite atlas dimensions", message: "Pet disabled: spritesheet.webp must be 1536 pixels wide with 208-pixel animation rows." };
  return { valid: true, assetDir, message: "Pet is ready." };
}

export function createPetController(config: PetConfig = {}) {
  let validation = validateAssets(config.assetDir);
  let animation: Animation = "idle";
  let changedAt = Date.now();
  let activeRuns = 0;
  let activityCount = 0;
  let lastEvent = "startup";
  let activityLabel = "Ready";
  let activity: ActivityItem[] = [{ id: 0, label: "Ready", tone: "neutral", at: Date.now() }];
  let idleTimer: NodeJS.Timeout | undefined;
  const set = (next: Animation, event = lastEvent, label = activityLabel) => { animation = next; changedAt = Date.now(); lastEvent = event; activityLabel = label; };
  const record = (label: string, tone: ActivityItem["tone"]) => { activity = [{ id: Date.now(), label, tone, at: Date.now() }, ...activity].slice(0, 6); };
  const showActiveRun = () => { clearTimeout(idleTimer); set("review", "model-active", "Thinking"); };
  const scheduleIdle = () => {
    clearTimeout(idleTimer);
    if (activeRuns > 0) return;
    idleTimer = setTimeout(() => set("idle", "idle", "Ready"), config.idleDelayMs ?? 2500);
  };
  return {
    initialize: () => (validation = validateAssets(config.assetDir)),
    snapshot: (): PetSnapshot => ({ ...validation, animation, changedAt, activeRuns, activityCount, lastEvent, activityLabel, activity, message: validation.valid ? `Pet is ${animation}; last event: ${lastEvent}.` : validation.message }),
    statusText: () => { const s = validation.valid ? { ...validation, animation, activeRuns, activityCount, lastEvent } : validation; return s.valid ? `Pet: ${animation}; last event: ${lastEvent}; activity count: ${activityCount}.` : s.message; },
    reset: () => { activeRuns = 0; clearTimeout(idleTimer); set("idle", "manual-reset", "Ready"); record("Reset to ready", "neutral"); return { ...validation, animation, changedAt, activeRuns, activityCount, lastEvent, activityLabel, activity, message: "Pet reset to idle." }; },
    modelStarted: () => { activityCount += 1; activeRuns += 1; clearTimeout(idleTimer); set("review", "model-started", "Thinking"); record("Model is thinking", "active"); },
    toolStarted: (toolName?: string) => { activityCount += 1; clearTimeout(idleTimer); const label = toolName ? `Running ${toolName}` : "Running tool"; set("running", "tool-started", label); record(label, "active"); },
    progress: (label: string) => { activityCount += 1; clearTimeout(idleTimer); set("review", "progress", label); record(label, "active"); },
    toolFinished: (failed: boolean) => { activityCount += 1; const label = failed ? "Tool failed" : "Tool complete"; set(failed ? "failed" : "waiting", failed ? "tool-failed" : "tool-finished", label); record(label, failed ? "error" : "success"); if (activeRuns > 0) showActiveRun(); else if (!failed) scheduleIdle(); },
    agentEnded: (failed: boolean) => { activityCount += 1; activeRuns = Math.max(0, activeRuns - 1); const label = failed ? "Task failed" : "Task complete"; record(label, failed ? "error" : "success"); if (activeRuns > 0) { showActiveRun(); return; } set(failed ? "failed" : "jumping", failed ? "agent-failed" : "agent-finished", label); scheduleIdle(); },
  };
}
