import { definePluginEntry, type OpenClawPluginDefinition } from "openclaw/plugin-sdk/plugin-entry";
import { toBridgeSnapshot } from "./bridge.js";
import { createPetEventHandler } from "./event-handler.js";
import { createCronJobNameResolver } from "./cron-job-name.js";
import { createSessionDisplayNameResolver } from "./session-label.js";
import { createPetController, type PetConfig } from "./pet-controller.js";
import { normalizeOverlaySize, startOverlay, stopOverlay } from "./overlay-service.js";
import { BRIDGE_SNAPSHOT_METHOD, SourceCoordinator, type DisplaySourceAsset } from "./source-coordinator.js";
import { parseSetupArgs, setupHelp, setupPreview } from "./setup-flow.js";
import { buildLocalSessionUrl } from "./session-url.js";

const plugin: OpenClawPluginDefinition = definePluginEntry({
  id: "openclaw-pet",
  name: "OpenClaw Pet",
  description: "A privacy-preserving desktop pet that reflects OpenClaw activity.",
  register(api) {
    const config = (api.pluginConfig ?? {}) as PetConfig;
    const localSource = config.sources?.find((source) => !source.gateway);
    const controllerAssetDir = config.assetDir ?? localSource?.assetDir;
    const controllerCreature = config.creature ?? localSource?.creature;
    const pet = createPetController({ ...config, assetDir: controllerAssetDir, creature: controllerCreature });
    const sources = new SourceCoordinator({ config, getLocalSnapshot: () => pet.snapshot(), logger: api.logger });
    let overlaySize = normalizeOverlaySize(config?.overlay?.size) ?? 160;
    const sourceSizes = new Map<string, number>();
    let overlayStateDir = process.env.TMPDIR ?? "/tmp";
    let tuckedAway = false;
    const runTargets = new Map<string, { sessionKey: string; agentId?: string }>();
    const rememberRunTarget = (runId: string, target: { sessionKey: string; agentId?: string }) => {
      runTargets.set(runId, target);
      while (runTargets.size > 32) runTargets.delete(runTargets.keys().next().value!);
    };
    const controlUiPort = Number((api as unknown as { config?: { gateway?: { port?: unknown } } }).config?.gateway?.port) || 18789;
    const resolveOpenRun = (opaqueRunId: string): string | undefined => {
      for (const [runId, target] of runTargets) {
        if (pet.opaqueIdForRun(runId) !== opaqueRunId) continue;
        return buildLocalSessionUrl(target.sessionKey, target.agentId, controlUiPort);
      }
      return undefined;
    };
    const getSourceSize = (sourceId?: string): number => {
      if (!sourceId) return overlaySize;
      const source = sources.assets().find((candidate) => candidate.id === sourceId);
      return sourceSizes.get(sourceId) ?? source?.size ?? overlaySize;
    };
    const displayAssets = (): DisplaySourceAsset[] => sources.assets().map((source) => ({
      ...source,
      size: getSourceSize(source.id),
    }));
    const sourceSizeStatus = () => sources.assets().map((source) => ({
      id: source.id,
      size: getSourceSize(source.id),
      customSize: sourceSizes.has(source.id),
    }));
    const launchOverlay = async (stateDir: string) => {
      overlayStateDir = stateDir;
      if (tuckedAway) return;
      if (config?.enabled === false || config?.overlay?.enabled === false) return;
      const assets = displayAssets();
      if (assets.length === 0) return;
      sources.start();
      await startOverlay({
        stateDir,
        assets,
        size: overlaySize,
        corner: config?.overlay?.corner ?? "bottom-right",
        showStatus: config?.overlay?.showStatus ?? true,
        clickThrough: config?.overlay?.clickThrough ?? false,
        getSnapshot: () => sources.snapshot(),
        acknowledgeRun: (runId) => pet.acknowledgeRun(runId),
        resolveOpenRun,
        getSize: getSourceSize,
        logger: api.logger,
      });
    };

    const displayStatus = () => ({
      tuckedAway,
      enabled: config?.enabled !== false && config?.overlay?.enabled !== false && sources.assets().length > 0,
      size: overlaySize,
      sources: sources.snapshot().sources.map(({ id, label, available }) => ({
        id,
        label,
        available,
        size: getSourceSize(id),
        customSize: sourceSizes.has(id),
      })),
    });
    const resize = async (
      value: unknown,
      sourceId?: string,
    ): Promise<{ ok: true; size: number; sourceId?: string; sourceCount: number; sources: ReturnType<typeof sourceSizeStatus> } | { ok: false; message: string }> => {
      const assets = sources.assets();
      if (config?.enabled === false || config?.overlay?.enabled === false || assets.length === 0) {
        return { ok: false, message: "This host is not configured as an OpenClaw Pet display." };
      }
      const size = normalizeOverlaySize(value);
      if (!size) return { ok: false, message: "size must be an integer from 96 through 768." };
      if (sourceId) {
        const source = assets.find((candidate) => candidate.id === sourceId);
        if (!source) return { ok: false, message: `Unknown pet source "${sourceId}".` };
        sourceSizes.set(source.id, size);
      } else {
        overlaySize = size;
        for (const source of assets) sourceSizes.set(source.id, size);
      }
      await launchOverlay(overlayStateDir);
      return { ok: true, size, ...(sourceId ? { sourceId } : {}), sourceCount: assets.length, sources: sourceSizeStatus() };
    };

    api.registerGatewayMethod(BRIDGE_SNAPSHOT_METHOD, ({ respond }) => {
      respond(true, toBridgeSnapshot(pet.snapshot()));
    }, { scope: "operator.read" });
    api.registerHttpRoute({
      path: "/api/openclaw-pet/v1/snapshot",
      auth: "gateway",
      match: "exact",
      gatewayRuntimeScopeSurface: "trusted-operator",
      handler: (req, res) => {
        if (req.method !== "GET" && req.method !== "HEAD") {
          res.writeHead(405, { allow: "GET, HEAD" }).end();
          return true;
        }
        res.writeHead(200, {
          "cache-control": "no-store",
          "content-type": "application/json",
          "x-content-type-options": "nosniff",
        });
        if (req.method === "HEAD") res.end();
        else res.end(JSON.stringify(toBridgeSnapshot(pet.snapshot())));
        return true;
      },
    });
    api.registerGatewayMethod("openclaw-pet.status", async ({ respond }) => {
      await launchOverlay(overlayStateDir);
      respond(true, { ...pet.snapshot(), display: displayStatus() });
    }, { scope: "operator.read" });
    api.registerGatewayMethod("openclaw-pet.reset", async ({ respond }) => {
      await launchOverlay(overlayStateDir);
      respond(true, pet.reset());
    }, { scope: "operator.write" });
    api.registerGatewayMethod("openclaw-pet.resize", async ({ params, respond }) => {
      const options = params && typeof params === "object" ? params as Record<string, unknown> : {};
      const sourceId = typeof options.sourceId === "string"
        ? options.sourceId
        : typeof options.source === "string"
          ? options.source
          : undefined;
      const result = await resize(options.size, sourceId);
      if (!result.ok) {
        respond(false, undefined, { code: "INVALID_REQUEST", message: result.message });
        return;
      }
      respond(true, result);
    }, { scope: "operator.write" });

    api.on("gateway_start", async () => { await launchOverlay(process.env.TMPDIR ?? "/tmp"); });
    api.agent.events.registerAgentEventSubscription({
      id: "openclaw-pet-activity",
      description: "Drive the desktop pet from sanitized agent lifecycle and tool events.",
      streams: ["lifecycle", "assistant", "tool", "acp", "item", "command_output", "patch"],
      handle: createPetEventHandler({
        pet,
        logger: api.logger,
        rememberRunTarget,
        resolveSessionDisplayName: createSessionDisplayNameResolver((sessionKey) =>
          api.runtime.gateway.request("sessions.describe", {
            key: sessionKey,
            includeDerivedTitles: false,
            includeLastMessage: false,
          }, { timeoutMs: 1000 })),
        resolveCronJobName: createCronJobNameResolver(async (jobId) =>
          api.runtime.gateway.request("cron.get", { id: jobId }, { timeoutMs: 1000 })),
      }),
    });

    api.registerCommand({
      name: "pet",
      description: "Show or reset the desktop pet.",
      acceptsArgs: true,
      handler: async (ctx) => {
        const args = ctx.args?.trim() ?? "";
        if (args === "setup" || args.startsWith("setup ")) {
          const parsed = parseSetupArgs(args.slice("setup".length).trim());
          return { text: parsed.ok ? setupPreview(parsed.options) : parsed.message };
        }
        if (args === "help") return { text: setupHelp() };
        if (args === "tuck") {
          tuckedAway = true;
          await stopOverlay();
          return { text: "Pet tucked away. Run /pet wake to show it again." };
        }
        if (args === "wake") {
          tuckedAway = false;
          await launchOverlay(overlayStateDir);
          return { text: "Pet awake. " + pet.statusText() };
        }
        await launchOverlay(overlayStateDir);
        if (args === "reset") return { text: pet.reset().message };
        const sourceResizeMatch = args.match(/^resize\s+([a-zA-Z0-9_-]{1,32})\s+(\d+)$/);
        if (sourceResizeMatch) {
          const result = await resize(sourceResizeMatch[2], sourceResizeMatch[1]);
          return { text: result.ok ? `Pet source ${result.sourceId} resized to ${result.size}px.` : `Pet resize failed: ${result.message}` };
        }
        const resizeMatch = args.match(/^resize\s+(\d+)$/);
        if (resizeMatch) {
          const result = await resize(resizeMatch[1]);
          return { text: result.ok ? `All pet displays resized to ${result.size}px.` : `Pet resize failed: ${result.message}` };
        }
        const display = displayStatus();
        const sourceSummary = display.sources.map((source) => `${source.label} ${source.available ? "available" : "unavailable"} ${source.size}px`).join(", ");
        return { text: `${pet.statusText()} Display: ${sourceSummary || `${overlaySize}px`}; ${sources.assets().length} source(s); overlay ${tuckedAway ? "tucked away" : "awake"}.` };
      },
    });

    api.registerService({
      id: "openclaw-pet-overlay",
      async start(ctx) { await launchOverlay(ctx.stateDir); },
      async stop() { sources.stop(); await stopOverlay(); },
    });

    if (api.registrationMode === "full") {
      setTimeout(() => { void launchOverlay(process.env.TMPDIR ?? "/tmp"); }, 0);
    }
  },
});
export default plugin;
