import { describe, expect, it, vi } from "vitest";
import plugin from "./index.js";
import { BRIDGE_SNAPSHOT_METHOD } from "./source-coordinator.js";

function registerPlugin(pluginConfig: unknown = { overlay: { enabled: false } }) {
  const gatewayMethods = new Map<string, { handler: (options: any) => unknown; options: unknown }>();
  let httpRoute: any;
  let command: any;
  let agentEventSubscription: any;
  const api = {
    pluginConfig,
    registrationMode: "discovery",
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    registerGatewayMethod(method: string, handler: (options: any) => unknown, options: unknown) {
      gatewayMethods.set(method, { handler, options });
    },
    registerHttpRoute(route: any) { httpRoute = route; },
    registerCommand(value: any) { command = value; },
    registerService: vi.fn(),
    on: vi.fn(),
    agent: { events: { registerAgentEventSubscription: vi.fn((subscription: any) => { agentEventSubscription = subscription; }) } },
  };
  plugin.register?.(api as never);
  return {
    gatewayMethods,
    getHttpRoute: () => httpRoute,
    getCommand: () => command,
    getAgentEventSubscription: () => agentEventSubscription,
  };
}

describe("plugin bridge registration", () => {
  it("exposes the same sanitized snapshot over read-scoped RPC and authenticated HTTP", async () => {
    const registered = registerPlugin();
    const bridge = registered.gatewayMethods.get(BRIDGE_SNAPSHOT_METHOD);
    expect(bridge?.options).toEqual({ scope: "operator.read" });
    let rpcPayload: unknown;
    await bridge?.handler({ respond: (ok: boolean, payload: unknown) => { expect(ok).toBe(true); rpcPayload = payload; } });

    const route = registered.getHttpRoute();
    expect(route).toMatchObject({
      path: "/api/openclaw-pet/v1/snapshot",
      auth: "gateway",
      match: "exact",
      gatewayRuntimeScopeSurface: "trusted-operator",
    });
    let status = 0;
    let headers: Record<string, string> = {};
    let body = "";
    const response = {
      writeHead(nextStatus: number, nextHeaders: Record<string, string>) { status = nextStatus; headers = nextHeaders; return this; },
      end(chunk?: string) { body = chunk ?? ""; return this; },
    };
    expect(route.handler({ method: "GET" }, response)).toBe(true);
    expect(status).toBe(200);
    expect(headers["cache-control"]).toBe("no-store");
    expect(JSON.parse(body)).toEqual(rpcPayload);
    expect(body).not.toContain("assetDir");
    expect(body).not.toContain("lastError");
    expect(body).not.toContain("message");
  });

  it("keeps resize write-scoped and disabled on a source-only host", async () => {
    const registered = registerPlugin({ overlay: { enabled: true } });
    const resize = registered.gatewayMethods.get("openclaw-pet.resize");
    expect(resize?.options).toEqual({ scope: "operator.write" });
    const respond = vi.fn();
    await resize?.handler({ params: { size: 288 }, respond });
    expect(respond).toHaveBeenCalledWith(false, undefined, {
      code: "INVALID_REQUEST",
      message: "This host is not configured as an OpenClaw Pet display.",
    });
  });

  it("does not publish model text from progress events over the bridge", async () => {
    const registered = registerPlugin();
    const subscription = registered.getAgentEventSubscription();
    expect(subscription.streams).toContain("assistant");
    expect(subscription.streams).not.toContain("thinking");

    subscription.handle({
      stream: "assistant",
      data: {
        delta: "raw model output should stay local",
      },
    });
    subscription.handle({
      stream: "item",
      data: {
        text: "raw model reasoning should stay local",
        title: "secret item title should stay local",
        status: "secret item status should stay local",
      },
    });
    subscription.handle({
      stream: "acp",
      data: {
        eventType: "progress",
        title: "secret acp title should stay local",
        status: "secret acp status should stay local",
      },
    });

    const bridge = registered.gatewayMethods.get(BRIDGE_SNAPSHOT_METHOD);
    let payload: unknown;
    await bridge?.handler({ respond: (_ok: boolean, nextPayload: unknown) => { payload = nextPayload; } });
    const wire = JSON.stringify(payload);
    expect(wire).not.toContain("raw model output");
    expect(wire).not.toContain("raw model reasoning");
    expect(wire).not.toContain("should stay local");
    expect(wire).not.toContain("secret item");
    expect(wire).not.toContain("secret acp");
    expect(wire).toContain("Agent is replying");
  });

  it("uses the lifecycle stream as the sole run boundary", () => {
    const registered = registerPlugin();
    const subscription = registered.getAgentEventSubscription();

    subscription.handle({ stream: "lifecycle", data: { phase: "start" } });
    subscription.handle({ stream: "lifecycle", data: { phase: "end" } });

    const bridge = registered.gatewayMethods.get(BRIDGE_SNAPSHOT_METHOD);
    let payload: any;
    void bridge?.handler({ respond: (_ok: boolean, nextPayload: unknown) => { payload = nextPayload; } });
    expect(payload).toMatchObject({ animation: "jumping", activeRuns: 0, activityLabel: "Task complete" });
    expect(registered.getAgentEventSubscription().streams).not.toContain("error");
  });
});
