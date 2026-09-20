import type { ActivityItem, Animation, PetSnapshot, RunActivity, RunLifecycleState, RunSession } from "./pet-controller.js";

export const PET_BRIDGE_VERSION = 2 as const;

export type SanitizedActivityItem = Pick<ActivityItem, "id" | "label" | "tone">;

export type SanitizedRunActivity = {
  id: string;
  session?: RunSession;
  state: RunLifecycleState;
  toolName?: string;
  startedAt: number;
  updatedAt: number;
  attention: boolean;
  unread: boolean;
};

export type SanitizedPetState = {
  animation: Animation;
  changedAt: number;
  activityLabel: string;
  activity: SanitizedActivityItem[];
  runs: SanitizedRunActivity[];
};

export type PetBridgeSnapshot = {
  version: typeof PET_BRIDGE_VERSION;
  state: SanitizedPetState;
};

const animations = new Set<Animation>([
  "idle",
  "running-right",
  "running-left",
  "waving",
  "jumping",
  "failed",
  "waiting",
  "running",
  "review",
]);
const tones = new Set<ActivityItem["tone"]>(["active", "success", "error", "neutral"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const allowed = new Set(keys);
  return Object.keys(value).every((key) => allowed.has(key)) && keys.every((key) => key in value);
}

function safeLabel(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return normalized.length > 0 && normalized.length <= 140 ? normalized : undefined;
}

function parseRun(value: unknown): SanitizedRunActivity | undefined {
  if (!isRecord(value) || !["id", "state", "startedAt", "updatedAt", "attention", "unread"].every((key) => key in value) || Object.keys(value).some((key) => !["id", "session", "state", "toolName", "startedAt", "updatedAt", "attention", "unread"].includes(key))) return undefined;
  if (typeof value.id !== "string" || !/^run_[a-f0-9]{20}$/.test(value.id)) return undefined;
  if (typeof value.state !== "string" || !new Set(["starting", "thinking", "tool", "finishing", "completed", "failed"]).has(value.state)) return undefined;
  if (!Number.isSafeInteger(value.startedAt) || !Number.isSafeInteger(value.updatedAt) || (value.startedAt as number) < 0 || (value.updatedAt as number) < (value.startedAt as number)) return undefined;
  if (typeof value.attention !== "boolean" || typeof value.unread !== "boolean") return undefined;
  if (value.toolName !== undefined && (typeof value.toolName !== "string" || !/^[a-zA-Z0-9_:-]{1,48}$/.test(value.toolName))) return undefined;
  if (value.session !== undefined) {
    if (!isRecord(value.session) || !("kind" in value.session) || Object.keys(value.session).some((key) => !["kind", "displayName", "agentId"].includes(key))) return undefined;
    if (value.session.kind !== "cron" && value.session.kind !== "session") return undefined;
    if (value.session.displayName !== undefined && (!safeLabel(value.session.displayName) || safeLabel(value.session.displayName)!.length > 80)) return undefined;
    if (value.session.agentId !== undefined && (typeof value.session.agentId !== "string" || !/^[a-zA-Z0-9_-]{1,64}$/.test(value.session.agentId))) return undefined;
  }
  return value as SanitizedRunActivity;
}

function parseRuns(value: unknown): SanitizedRunActivity[] | undefined {
  if (!Array.isArray(value) || value.length > 16) return undefined;
  const runs = value.map(parseRun);
  return runs.every(Boolean) ? runs as SanitizedRunActivity[] : undefined;
}

function parseActivity(value: unknown): SanitizedActivityItem[] | undefined {
  if (!Array.isArray(value) || value.length > 6) return undefined;
  const result: SanitizedActivityItem[] = [];
  for (const item of value) {
    if (!isRecord(item) || !hasOnlyKeys(item, ["id", "label", "tone"])) return undefined;
    if (!Number.isSafeInteger(item.id) || (item.id as number) < 0) return undefined;
    const label = safeLabel(item.label);
    if (!label || typeof item.tone !== "string" || !tones.has(item.tone as ActivityItem["tone"])) return undefined;
    result.push({ id: item.id as number, label, tone: item.tone as ActivityItem["tone"] });
  }
  return result;
}

export function toSanitizedPetState(snapshot: PetSnapshot): SanitizedPetState {
  return {
    animation: snapshot.animation,
    changedAt: snapshot.changedAt,
    activityLabel: safeLabel(snapshot.activityLabel) ?? "Working",
    runs: (snapshot.runs ?? []).slice(0, 16).map((run) => ({
      id: run.id,
      ...(run.session ? { session: { kind: run.session.kind, ...(run.session.displayName ? { displayName: safeLabel(run.session.displayName)?.slice(0, 80) } : {}), ...(run.session.agentId ? { agentId: run.session.agentId } : {}) } } : {}),
      state: run.state,
      ...(run.toolName ? { toolName: run.toolName } : {}),
      startedAt: run.startedAt,
      updatedAt: run.updatedAt,
      attention: run.attention,
      unread: run.unread,
    })) ,
    activity: snapshot.activity.slice(0, 6).map(({ id, label, tone }, index) => ({
      id: Number.isSafeInteger(id) && id >= 0 ? id : index,
      label: safeLabel(label) ?? "Activity",
      tone: tones.has(tone) ? tone : "neutral",
    })),
  };
}

export function toBridgeSnapshot(snapshot: PetSnapshot): PetBridgeSnapshot {
  return { version: PET_BRIDGE_VERSION, state: toSanitizedPetState(snapshot) };
}

export function parseBridgeSnapshot(value: unknown): PetBridgeSnapshot | undefined {
  if (!isRecord(value) || !hasOnlyKeys(value, ["version", "state"]) || value.version !== PET_BRIDGE_VERSION || !isRecord(value.state)) return undefined;
  const state = value.state;
  if (!hasOnlyKeys(state, ["animation", "changedAt", "activityLabel", "activity", "runs"])) return undefined;
  if (typeof state.animation !== "string" || !animations.has(state.animation as Animation)) return undefined;
  if (!Number.isSafeInteger(state.changedAt) || (state.changedAt as number) < 0) return undefined;
  const activityLabel = safeLabel(state.activityLabel);
  const activity = parseActivity(state.activity);
  const runs = parseRuns(state.runs);
  if (!activityLabel || !activity || !runs) return undefined;
  return {
    version: PET_BRIDGE_VERSION,
    state: {
      animation: state.animation as Animation,
      changedAt: state.changedAt as number,
      activityLabel,
      activity,
      runs,
    },
  };
}
