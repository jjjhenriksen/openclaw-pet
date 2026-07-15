import { definePluginEntry, type OpenClawPluginDefinition } from "openclaw/plugin-sdk/plugin-entry";
import { toBridgeSnapshot } from "./bridge.js";
import { createPetController, type PetConfig } from "./pet-controller.js";
import { normalizeOverlaySize, startOverlay, stopOverlay } from "./overlay-service.js";
import { BRIDGE_SNAPSHOT_METHOD, SourceCoordinator, type DisplaySourceAsset } from "./source-coordinator.js";

function safeToolName(data: Record<string, unknown>): string | undefined {
  const value = data.toolName ?? data.name;
  return typeof value === "string" && /^[a-zA-Z0-9_:-]{1,48}$/.test(value) ? value : undefined;
}

const plugin: OpenClawPluginDefinition = definePluginEntry({
  id: "openclaw-pet",
  name: "OpenClaw Pet",
  description: "A privacy-preserving desktop pet that reflects OpenClaw activity.",
  register(api) {
    const config = (api.pluginConfig ?? {}) as PetConfig;
    const controllerAssetDir = config.assetDir ?? config.sources?.find((source) => !source.gateway)?.assetDir;
    const pet = createPetController({ ...config, assetDir: controllerAssetDir });
    const sources = new SourceCoordinator({ config, getLocalSnapshot: () => pet.snapshot(), logger: api.logger });
    let overlaySize = normalizeOverlaySize(config?.overlay?.size) ?? 224;
    const sourceSizes = new Map<string, number>();
    let overlayStateDir = process.env.TMPDIR ?? "/tmp";
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
        getSize: getSourceSize,
        logger: api.logger,
      });
    };

    const displayStatus = () => ({
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

    api.on("model_call_started", () => { void launchOverlay(process.env.TMPDIR ?? "/tmp"); pet.modelStarted(); });
    api.on("before_tool_call", (event) => { void launchOverlay(process.env.TMPDIR ?? "/tmp"); pet.toolStarted(safeToolName({ toolName: event.toolName })); });
    api.on("after_tool_call", (event) => pet.toolFinished(Boolean(event.error)));
    api.on("agent_end", (event) => pet.agentEnded(event.success === false));
    api.on("gateway_start", async () => { await launchOverlay(process.env.TMPDIR ?? "/tmp"); });
    api.agent.events.registerAgentEventSubscription({
      id: "openclaw-pet-activity",
      description: "Drive the desktop pet from sanitized agent lifecycle and tool events.",
      streams: ["lifecycle", "tool", "error", "acp", "item", "command_output", "patch"],
      handle: (event) => {
        const phase = String(event.data.phase ?? event.data.status ?? event.data.type ?? "").toLowerCase();
        if (event.stream === "acp") {
          const eventType = String(event.data.eventType ?? "").toLowerCase();
          if (eventType === "tool_call") {
            if (phase.includes("result") || phase.includes("complete")) pet.toolFinished(false);
            else pet.toolStarted(safeToolName(event.data));
            return;
          }
          if (eventType === "error") { pet.agentEnded(true); return; }
          pet.progress("Working");
          return;
        }
        if (event.stream === "item") {
          pet.progress("Working");
          return;
        }
        if (event.stream === "tool") {
          if (phase.includes("fail") || phase.includes("error")) pet.toolFinished(true);
          else if (phase.includes("end") || phase.includes("result") || phase.includes("complete")) pet.toolFinished(false);
          else pet.toolStarted(safeToolName(event.data));
          return;
        }
        if (event.stream === "error") { pet.agentEnded(true); return; }
        if (phase.includes("end") || phase.includes("complete") || phase.includes("finish")) pet.agentEnded(false);
        else pet.modelStarted();
      },
    });

    api.registerCommand({
      name: "pet",
      description: "Show or reset the desktop pet.",
      acceptsArgs: true,
      handler: async (ctx) => {
        await launchOverlay(overlayStateDir);
        const args = ctx.args?.trim() ?? "";
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
        const sourceSummary = display.sources.map((source) => `${source.label} ${source.size}px`).join(", ");
        return { text: `${pet.statusText()} Display: ${sourceSummary || `${overlaySize}px`}; ${sources.assets().length} source(s).` };
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
