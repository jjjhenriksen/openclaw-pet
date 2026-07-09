import { definePluginEntry, type OpenClawPluginDefinition } from "openclaw/plugin-sdk/plugin-entry";
import { createPetController, type PetConfig } from "./pet-controller.js";
import { startOverlay, stopOverlay } from "./overlay-service.js";

function safeToolName(data: Record<string, unknown>): string | undefined {
  const value = data.toolName ?? data.name;
  return typeof value === "string" && /^[a-zA-Z0-9_:-]{1,48}$/.test(value) ? value : undefined;
}

const plugin: OpenClawPluginDefinition = definePluginEntry({
  id: "openclaw-pet",
  name: "OpenClaw Pet",
  description: "A privacy-preserving desktop pet that reflects OpenClaw activity.",
  register(api) {
    const config = api.pluginConfig as PetConfig;
    const pet = createPetController(config);
    const launchOverlay = async (stateDir: string) => {
      const state = pet.initialize();
      if (!state.valid || config?.enabled === false || config?.overlay?.enabled === false) return;
      await startOverlay({
        stateDir,
        assetDir: state.assetDir!,
        size: config?.overlay?.size ?? 224,
        corner: config?.overlay?.corner ?? "bottom-right",
        clickThrough: config?.overlay?.clickThrough ?? false,
        getSnapshot: () => pet.snapshot(),
        logger: api.logger,
      });
    };

    api.registerGatewayMethod("openclaw-pet.status", async ({ respond }) => { await launchOverlay(process.env.TMPDIR ?? "/tmp"); respond(true, pet.snapshot()); }, { scope: "operator.read" });
    api.registerGatewayMethod("openclaw-pet.reset", async ({ respond }) => { await launchOverlay(process.env.TMPDIR ?? "/tmp"); respond(true, pet.reset()); }, { scope: "operator.write" });

    api.on("model_call_started", () => { void launchOverlay(process.env.TMPDIR ?? "/tmp"); pet.modelStarted(); });
    api.on("before_tool_call", (event) => { void launchOverlay(process.env.TMPDIR ?? "/tmp"); pet.toolStarted(safeToolName({ toolName: event.toolName })); });
    api.on("after_tool_call", (event) => pet.toolFinished(Boolean(event.error)));
    api.on("agent_end", (event) => pet.agentEnded(event.success === false));
    api.on("gateway_start", async () => { await launchOverlay(process.env.TMPDIR ?? "/tmp"); });
    api.agent.events.registerAgentEventSubscription({
      id: "openclaw-pet-activity",
      description: "Drive the desktop pet from sanitized agent lifecycle and tool events.",
      streams: ["lifecycle", "tool", "error"],
      handle: (event) => {
        const phase = String(event.data.phase ?? event.data.status ?? event.data.type ?? "").toLowerCase();
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
        await launchOverlay(process.env.TMPDIR ?? "/tmp");
        return ctx.args?.trim() === "reset" ? { text: pet.reset().message } : { text: pet.statusText() };
      },
    });

    api.registerService({
      id: "openclaw-pet-overlay",
      async start(ctx) { await launchOverlay(ctx.stateDir); },
      async stop() { await stopOverlay(); },
    });

    if (api.registrationMode === "full") {
      setTimeout(() => { void launchOverlay(process.env.TMPDIR ?? "/tmp"); }, 0);
    }
  },
});
export default plugin;
