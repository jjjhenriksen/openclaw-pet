import { parseBridgeSnapshot, PET_BRIDGE_VERSION, toSanitizedPetState, type PetBridgeSnapshot, type SanitizedPetState } from "./bridge.js";
import { validateAssets, type CreatureKind, type LobsterSettings, type PetConfig, type PetSnapshot, type PetSourceConfig } from "./pet-controller.js";
import { isCreatureKind } from "./creatures.js";

export const BRIDGE_SNAPSHOT_METHOD = "openclaw-pet.bridge.snapshot";
export const DEFAULT_REMOTE_POLL_INTERVAL_MS = 1_000;
export const DEFAULT_REMOTE_TIMEOUT_MS = 5_000;
export const MAX_BRIDGE_RESPONSE_BYTES = 32 * 1024;

export type DisplaySourceAsset = {
  id: string;
  label: string;
  assetDir?: string;
  creature?: CreatureKind;
  lobster?: LobsterSettings;
  size?: number;
};

export type DisplaySourceState = {
  id: string;
  label: string;
  available: boolean;
  creature?: CreatureKind;
  lobster?: LobsterSettings;
  state: SanitizedPetState;
};

export type DisplaySnapshot = {
  sources: DisplaySourceState[];
};

type ResolvedSource = DisplaySourceAsset & {
  gateway?: NonNullable<PetSourceConfig["gateway"]>;
};

export type RemoteSnapshotFetcher = (source: {
  url: string;
  token?: string;
  timeoutMs: number;
}) => Promise<unknown>;

export type SourceCoordinatorLogger = {
  info?: (message: string) => void;
  warn: (message: string) => void;
};

type SourceCoordinatorOptions = {
  config: PetConfig;
  getLocalSnapshot: () => PetSnapshot;
  logger: SourceCoordinatorLogger;
  fetchRemote?: RemoteSnapshotFetcher;
  env?: NodeJS.ProcessEnv;
  validateAssetDir?: (assetDir: string) => boolean;
};

type RemoteRuntimeState = {
  available: boolean;
  snapshot: PetBridgeSnapshot;
  timer?: NodeJS.Timeout;
  warned: boolean;
};

const idleState: SanitizedPetState = {
  animation: "idle",
  changedAt: 0,
  activityLabel: "Waiting for source",
  activity: [],
  runs: [],
};

function normalizeSourceId(value: string): string | undefined {
  return /^[a-zA-Z0-9_-]{1,32}$/.test(value) ? value : undefined;
}

function normalizeSourceLabel(value: string | undefined, fallback: string): string {
  if (!value) return fallback;
  const normalized = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return normalized.length > 0 && normalized.length <= 64 ? normalized : fallback;
}

function normalizeSourceSize(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 96 && value <= 768
    ? value
    : undefined;
}

function isLoopbackHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1" || normalized === "[::1]";
}

function normalizeGateway(gateway: PetSourceConfig["gateway"]): PetSourceConfig["gateway"] | undefined {
  if (!gateway) return undefined;
  try {
    const url = new URL(gateway.url);
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
    if (gateway.tokenEnv && url.protocol === "http:" && !isLoopbackHost(url.hostname)) return undefined;
    return gateway;
  } catch {
    return undefined;
  }
}

export function resolvePetSources(config: PetConfig): ResolvedSource[] {
  const configured = config.sources?.length
    ? config.sources
    : config.assetDir || config.creature
      ? [{ id: "local", label: "Local", assetDir: config.assetDir }]
      : [];
  const seen = new Set<string>();
  const result: ResolvedSource[] = [];
  for (const source of configured) {
    const id = normalizeSourceId(source.id);
    const assetDir = source.assetDir ?? config.assetDir;
    const creature = source.creature ?? config.creature;
    const lobster = source.lobster ?? config.lobster;
    const size = normalizeSourceSize(source.size);
    const gateway = normalizeGateway(source.gateway);
    if (source.gateway && !gateway) continue;
    if (!id || seen.has(id) || (typeof assetDir !== "string" && !isCreatureKind(creature))) continue;
    seen.add(id);
    result.push({
      id,
      label: normalizeSourceLabel(source.label, id),
      ...(assetDir ? { assetDir } : {}),
      ...(isCreatureKind(creature) ? { creature } : {}),
      ...(creature === "lobster" && lobster ? { lobster } : {}),
      ...(size ? { size } : {}),
      ...(gateway ? { gateway } : {}),
    });
  }
  return result;
}

async function defaultFetchRemote(source: { url: string; token?: string; timeoutMs: number }): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), source.timeoutMs);
  timeout.unref();
  try {
    const response = await fetch(source.url, {
      cache: "no-store",
      redirect: "error",
      signal: controller.signal,
      headers: source.token ? { authorization: `Bearer ${source.token}` } : undefined,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const declaredLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_BRIDGE_RESPONSE_BYTES) throw new Error("bridge response too large");
    if (!response.body) throw new Error("empty bridge response");
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BRIDGE_RESPONSE_BYTES) {
        await reader.cancel();
        throw new Error("bridge response too large");
      }
      chunks.push(value);
    }
    const body = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return JSON.parse(new TextDecoder().decode(body));
  } finally {
    clearTimeout(timeout);
  }
}

export class SourceCoordinator {
  private readonly sources: ResolvedSource[];
  private readonly displaySources: ResolvedSource[];
  private readonly getLocalSnapshot: () => PetSnapshot;
  private readonly logger: SourceCoordinatorLogger;
  private readonly fetchRemote: RemoteSnapshotFetcher;
  private readonly env: NodeJS.ProcessEnv;
  private readonly remote = new Map<string, RemoteRuntimeState>();
  private running = false;
  private generation = 0;

  constructor(options: SourceCoordinatorOptions) {
    this.sources = resolvePetSources(options.config);
    if (options.config.sources?.length) {
      const resolvedIds = new Set(this.sources.map((source) => source.id));
      for (const source of options.config.sources) {
        if (resolvedIds.has(source.id)) continue;
        const id = normalizeSourceId(source.id) ?? "<invalid>";
        options.logger.warn(`OpenClaw Pet source ${id} is invalid and will be skipped. Check id, assetDir, and gateway URL/token transport.`);
      }
    }
    this.displaySources = this.sources.filter((source) => {
      const valid = options.validateAssetDir?.(source.assetDir ?? "") ?? validateAssets(source.assetDir, source.creature).valid;
      if (!valid) options.logger.warn(`OpenClaw Pet source ${source.id} has invalid display assets and will be skipped.`);
      return valid;
    });
    this.getLocalSnapshot = options.getLocalSnapshot;
    this.logger = options.logger;
    this.fetchRemote = options.fetchRemote ?? defaultFetchRemote;
    this.env = options.env ?? process.env;
    for (const source of this.displaySources) {
      if (!source.gateway) continue;
      this.remote.set(source.id, {
        available: false,
        snapshot: { version: PET_BRIDGE_VERSION, state: { ...idleState } },
        warned: false,
      });
    }
  }

  assets(): DisplaySourceAsset[] {
    return this.displaySources.map(({ id, label, assetDir, creature, lobster, size }) => ({
      id,
      label,
      ...(assetDir ? { assetDir } : {}),
      ...(creature ? { creature } : {}),
      ...(lobster ? { lobster } : {}),
      ...(size ? { size } : {}),
    }));
  }

  snapshot(): DisplaySnapshot {
    const localState = toSanitizedPetState(this.getLocalSnapshot());
    return {
      sources: this.displaySources.map((source) => {
        const remote = this.remote.get(source.id);
        if (!remote) return { id: source.id, label: source.label, available: true, state: localState };
        return { id: source.id, label: source.label, available: remote.available, state: remote.snapshot.state };
      }),
    };
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    const generation = ++this.generation;
    for (const source of this.displaySources) {
      if (source.gateway) void this.pollAndSchedule(source, generation);
    }
  }

  stop(): void {
    if (!this.running && this.remote.size === 0) return;
    this.running = false;
    this.generation += 1;
    for (const runtime of this.remote.values()) {
      clearTimeout(runtime.timer);
      runtime.timer = undefined;
    }
  }

  async pollOnce(sourceId: string): Promise<boolean> {
    const source = this.displaySources.find((candidate) => candidate.id === sourceId && candidate.gateway);
    if (!source?.gateway) return false;
    const runtime = this.remote.get(source.id);
    if (!runtime) return false;
    try {
      const token = source.gateway.tokenEnv ? this.env[source.gateway.tokenEnv] : undefined;
      const raw = await this.fetchRemote({
        url: source.gateway.url,
        token,
        timeoutMs: Math.max(250, Math.min(30_000, source.gateway.timeoutMs ?? DEFAULT_REMOTE_TIMEOUT_MS)),
      });
      const snapshot = parseBridgeSnapshot(raw);
      if (!snapshot) throw new Error("invalid bridge snapshot");
      runtime.snapshot = snapshot;
      runtime.available = true;
      if (runtime.warned) this.logger.info?.(`OpenClaw Pet source ${source.id} is available again.`);
      runtime.warned = false;
      return true;
    } catch {
      runtime.available = false;
      if (!runtime.warned) this.logger.warn(`OpenClaw Pet source ${source.id} is unavailable.`);
      runtime.warned = true;
      return false;
    }
  }

  private async pollAndSchedule(source: ResolvedSource, generation: number): Promise<void> {
    await this.pollOnce(source.id);
    if (!this.running || generation !== this.generation || !source.gateway) return;
    const runtime = this.remote.get(source.id);
    if (!runtime) return;
    const interval = Math.max(250, Math.min(60_000, source.gateway.pollIntervalMs ?? DEFAULT_REMOTE_POLL_INTERVAL_MS));
    runtime.timer = setTimeout(() => { void this.pollAndSchedule(source, generation); }, interval);
    runtime.timer.unref();
  }
}
