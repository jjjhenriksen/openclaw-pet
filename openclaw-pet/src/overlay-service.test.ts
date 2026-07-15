import { EventEmitter } from "node:events";
import type { IncomingMessage, RequestListener, ServerResponse } from "node:http";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  buildOverlayCommand,
  calculateOverlayDimensions,
  createOverlayManager,
  createOverlayService,
  normalizeOverlaySize,
  selectOverlayHelper,
  toOverlayState,
  type OverlayChildHandle,
  type OverlayServerHandle,
  type StartOverlayParams,
} from "./overlay-service.js";
import type { DisplaySnapshot } from "./source-coordinator.js";

const snapshot: DisplaySnapshot = {
  sources: [{
    id: "local",
    label: "Local",
    available: true,
    state: {
      animation: "review",
      changedAt: 1234,
      activityLabel: "Running safe-tool",
      activity: [{ id: 7, label: "Running safe-tool", tone: "active" }],
    },
  }],
};

const remoteSnapshot: DisplaySnapshot = {
  sources: [
    snapshot.sources[0],
    {
      id: "remote",
      label: "Remote",
      available: true,
      state: {
        animation: "idle",
        changedAt: 5678,
        activityLabel: "Ready",
        activity: [{ id: 8, label: "Ready", tone: "neutral" }],
      },
    },
  ],
};

function params(warn = vi.fn()): StartOverlayParams {
  return {
    stateDir: "/tmp/openclaw-pet",
    assets: [{ id: "local", label: "Local", assetDir: "/private/pet-assets" }],
    size: 224,
    corner: "bottom-right",
    getSnapshot: () => snapshot,
    logger: { warn },
  };
}

function flush(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

class FakeServer extends EventEmitter {
  listening = false;
  closeCalls = 0;
  closeAllConnectionsCalls = 0;
  listenHost: string | undefined;
  private listenCallback: (() => void) | undefined;
  private closeCallback: ((error?: Error) => void) | undefined;

  constructor(private readonly autoListen: boolean, private readonly autoClose: boolean) {
    super();
  }

  listen(_port: number, host: string, callback: () => void): this {
    this.listening = true;
    this.listenHost = host;
    this.listenCallback = callback;
    if (this.autoListen) queueMicrotask(() => this.completeListen());
    return this;
  }

  completeListen(): void {
    const callback = this.listenCallback;
    this.listenCallback = undefined;
    callback?.();
  }

  address(): { address: string; family: string; port: number } | null {
    return this.listening ? { address: "127.0.0.1", family: "IPv4", port: 43123 } : null;
  }

  close(callback: (error?: Error) => void): this {
    this.closeCalls += 1;
    this.listening = false;
    this.closeCallback = callback;
    if (this.autoClose) queueMicrotask(() => this.completeClose());
    return this;
  }

  completeClose(): void {
    const callback = this.closeCallback;
    this.closeCallback = undefined;
    callback?.();
  }

  closeAllConnections(): void {
    this.closeAllConnectionsCalls += 1;
  }
}

class FakeChild extends EventEmitter {
  stderr = new EventEmitter();
  exitCode: number | null = null;
  signalCode: NodeJS.Signals | null = null;
  readonly killSignals: NodeJS.Signals[] = [];

  constructor(
    readonly failOnSpawn = false,
    private readonly exitOnSignal: NodeJS.Signals | null = "SIGTERM",
  ) {
    super();
  }

  beginSpawn(): void {
    if (this.failOnSpawn) this.emit("error", new Error("synthetic spawn failure"));
    else this.emit("spawn");
  }

  kill(signal: NodeJS.Signals | number = "SIGTERM"): boolean {
    const normalized = typeof signal === "string" ? signal : "SIGTERM";
    this.killSignals.push(normalized);
    if (this.exitOnSignal === normalized) queueMicrotask(() => this.completeExit(null, normalized));
    return true;
  }

  completeExit(code: number | null = 0, signal: NodeJS.Signals | null = null): void {
    if (this.exitCode !== null || this.signalCode !== null) return;
    this.exitCode = code;
    this.signalCode = signal;
    this.emit("exit", code, signal);
  }
}

function harness(options: {
  autoListen?: boolean;
  autoClose?: boolean;
  children?: FakeChild[];
} = {}) {
  const servers: FakeServer[] = [];
  const children: FakeChild[] = [];
  const childQueue = [...(options.children ?? [])];
  const delays: Array<() => void> = [];
  const listeners: RequestListener[] = [];
  const spawnHelper = vi.fn(() => {
    const child = childQueue.shift() ?? new FakeChild();
    children.push(child);
    queueMicrotask(() => child.beginSpawn());
    return child as unknown as OverlayChildHandle;
  });
  const createHttpServer = vi.fn((listener: RequestListener) => {
    listeners.push(listener);
    const server = new FakeServer(options.autoListen ?? true, options.autoClose ?? true);
    servers.push(server);
    return server as unknown as OverlayServerHandle;
  });
  const service = createOverlayService({
    platform: "darwin",
    distDir: "/plugin/dist",
    helperExists: () => true,
    createHttpServer,
    spawnHelper,
    delay: () => new Promise<void>((resolve) => delays.push(resolve)),
    terminateGraceMs: 10,
    forceKillWaitMs: 10,
  });
  return { service, servers, children, spawnHelper, createHttpServer, delays, listeners };
}

describe("overlay platform selection", () => {
  it("selects distinct macOS and Windows helper names", () => {
    expect(selectOverlayHelper("darwin", "/plugin/dist")).toEqual({
      executable: join("/plugin/dist", "pet-overlay-macos"),
      platformName: "macOS",
    });
    expect(selectOverlayHelper("win32", "/plugin/dist")).toEqual({
      executable: join("/plugin/dist", "pet-overlay-win.exe"),
      platformName: "Windows 11",
    });
    expect(selectOverlayHelper("linux", "/plugin/dist")).toBeUndefined();
  });

  it("constructs the same helper arguments on both supported platforms", () => {
    const options = { port: 43123, size: 256, corner: "top-left", clickThrough: true, sourceCount: 3 };
    expect(buildOverlayCommand("darwin", "/plugin/dist", options)?.args).toEqual(["43123", "256", "top-left", "true", "3", "0", "0", "true"]);
    expect(buildOverlayCommand("win32", "/plugin/dist", options)?.args).toEqual(["43123", "256", "top-left", "true", "3", "0", "0", "true"]);
    expect(buildOverlayCommand("darwin", "/plugin/dist", { ...options, showStatus: false, windowOffset: { x: 280, y: -20 } })?.args)
      .toEqual(["43123", "256", "top-left", "true", "3", "280", "-20", "false"]);
    expect(buildOverlayCommand("win32", "/plugin/dist", { ...options, showStatus: false, windowOffset: { x: 280, y: -20 } })?.args)
      .toEqual(["43123", "256", "top-left", "true", "3", "280", "-20", "false"]);
  });

  it("bounds runtime sizes and calculates helper frame dimensions", () => {
    expect(normalizeOverlaySize("96")).toBe(96);
    expect(normalizeOverlaySize(768)).toBe(768);
    expect(normalizeOverlaySize(95)).toBeUndefined();
    expect(normalizeOverlaySize("224px")).toBeUndefined();
    expect(calculateOverlayDimensions(224, 3)).toEqual({ width: 892, height: 224 });
    expect(calculateOverlayDimensions(96, 1, false)).toEqual({ width: 96, height: 96 });
    expect(calculateOverlayDimensions(224, 3, false)).toEqual({ width: 672, height: 224 });
  });

  it("warns only once and starts nothing on unsupported platforms", async () => {
    const warn = vi.fn();
    const service = createOverlayService({ platform: "linux" });
    await service.start(params(warn));
    await service.start(params(warn));
    expect(warn).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledWith(
      "OpenClaw Pet desktop overlay is not supported on linux; supported platforms are macOS and Windows 11.",
    );
  });
});

describe("overlay lifecycle", () => {
  it("starts and stops separate helper windows for multiple sources", async () => {
    const started: StartOverlayParams[] = [];
    let stopCount = 0;
    const manager = createOverlayManager(() => ({
      isActive: () => true,
      start: async (startParams) => { started.push(startParams); },
      stop: async () => { stopCount += 1; },
    }));
    await manager.start({
      ...params(),
      assets: [
        { id: "local", label: "Local", assetDir: "/assets/local", size: 320 },
        { id: "remote", label: "Remote", assetDir: "/assets/remote", size: 224 },
      ],
      size: 224,
      corner: "bottom-right",
      getSnapshot: () => remoteSnapshot,
    });

    expect(started).toHaveLength(2);
    expect(started[0]?.assets).toEqual([{ id: "local", label: "Local", assetDir: "/assets/local", size: 320 }]);
    expect(started[0]?.size).toBe(320);
    expect(started[0]?.getSize?.()).toBe(320);
    expect(started[0]?.getWindowOffset?.()).toEqual({ x: 0, y: 0 });
    expect(started[0]?.windowOffset).toEqual({ x: 0, y: 0 });
    expect(started[0]?.getSnapshot().sources.map((source) => source.id)).toEqual(["local"]);
    expect(started[1]?.assets).toEqual([{ id: "remote", label: "Remote", assetDir: "/assets/remote", size: 224 }]);
    expect(started[1]?.size).toBe(224);
    expect(started[1]?.getSize?.()).toBe(224);
    expect(started[1]?.getWindowOffset?.()).toEqual({ x: -564, y: 0 });
    expect(started[1]?.windowOffset).toEqual({ x: -564, y: 0 });
    expect(started[1]?.getSnapshot().sources.map((source) => source.id)).toEqual(["remote"]);

    await manager.stop();
    expect(stopCount).toBe(2);
  });

  it("does not restart helper windows for runtime size changes", async () => {
    const started: StartOverlayParams[] = [];
    let stopCount = 0;
    const manager = createOverlayManager(() => ({
      isActive: () => true,
      start: async (startParams) => { started.push(startParams); },
      stop: async () => { stopCount += 1; },
    }));
    const baseParams: StartOverlayParams = {
      ...params(),
      assets: [
        { id: "local", label: "Local", assetDir: "/assets/local" },
        { id: "remote", label: "Remote", assetDir: "/assets/remote" },
      ],
      corner: "bottom-right",
      getSnapshot: () => remoteSnapshot,
    };

    await manager.start({ ...baseParams, size: 224 });
    await manager.start({ ...baseParams, size: 288 });

    expect(started).toHaveLength(2);
    expect(stopCount).toBe(0);
    await manager.stop();
  });

  it("does not restart helper windows for source-specific runtime size changes", async () => {
    const started: StartOverlayParams[] = [];
    let stopCount = 0;
    const runtimeSizes = new Map([["local", 224], ["remote", 224]]);
    const manager = createOverlayManager(() => ({
      isActive: () => true,
      start: async (startParams) => { started.push(startParams); },
      stop: async () => { stopCount += 1; },
    }));
    const baseParams: StartOverlayParams = {
      ...params(),
      assets: [
        { id: "local", label: "Local", assetDir: "/assets/local" },
        { id: "remote", label: "Remote", assetDir: "/assets/remote" },
      ],
      corner: "bottom-right",
      getSnapshot: () => remoteSnapshot,
      getSize: (sourceId) => runtimeSizes.get(sourceId ?? "local") ?? 224,
    };

    await manager.start(baseParams);
    runtimeSizes.set("remote", 320);
    await manager.start(baseParams);

    expect(started).toHaveLength(2);
    expect(started[0]?.getSize?.()).toBe(224);
    expect(started[1]?.getSize?.()).toBe(320);
    expect(stopCount).toBe(0);
    await manager.stop();
  });

  it("restarts helper windows when status panel visibility changes", async () => {
    const start = vi.fn(async () => undefined);
    const stop = vi.fn(async () => undefined);
    const manager = createOverlayManager(() => ({
      isActive: () => true,
      start,
      stop,
    }));

    await manager.start(params());
    await manager.start({ ...params(), showStatus: false });

    expect(start).toHaveBeenCalledTimes(2);
    expect(stop).toHaveBeenCalledTimes(1);
    await manager.stop();
  });

  it("updates live helper offsets when runtime sizes change", async () => {
    const started: StartOverlayParams[] = [];
    let stopCount = 0;
    const runtimeSizes = new Map([["local", 224], ["remote", 224]]);
    const manager = createOverlayManager(() => ({
      isActive: () => true,
      start: async (startParams) => { started.push(startParams); },
      stop: async () => { stopCount += 1; },
    }));
    const baseParams: StartOverlayParams = {
      ...params(),
      assets: [
        { id: "local", label: "Local", assetDir: "/assets/local" },
        { id: "remote", label: "Remote", assetDir: "/assets/remote" },
      ],
      corner: "bottom-right",
      getSnapshot: () => remoteSnapshot,
      getSize: (sourceId) => runtimeSizes.get(sourceId ?? "local") ?? 224,
    };

    await manager.start(baseParams);
    expect(started[1]?.getWindowOffset?.()).toEqual({ x: -468, y: 0 });
    runtimeSizes.set("local", 320);
    await manager.start(baseParams);

    expect(started).toHaveLength(2);
    expect(started[1]?.getWindowOffset?.()).toEqual({ x: -564, y: 0 });
    expect(stopCount).toBe(0);
    await manager.stop();
  });

  it("packs pets without status-panel spacing when status is hidden", async () => {
    const started: StartOverlayParams[] = [];
    const manager = createOverlayManager(() => ({
      isActive: () => true,
      start: async (startParams) => { started.push(startParams); },
      stop: async () => undefined,
    }));
    await manager.start({
      ...params(),
      assets: [
        { id: "local", label: "Local", assetDir: "/assets/local" },
        { id: "remote", label: "Remote", assetDir: "/assets/remote" },
      ],
      showStatus: false,
      getSnapshot: () => remoteSnapshot,
    });

    expect(started[1]?.windowOffset).toEqual({ x: -248, y: 0 });
    expect(started[1]?.getWindowOffset?.()).toEqual({ x: -248, y: 0 });
    await manager.stop();
  });

  it("restarts inactive helper windows without changing configuration", async () => {
    let active = false;
    const start = vi.fn(async () => { active = true; });
    const stop = vi.fn(async () => { active = false; });
    const manager = createOverlayManager(() => ({
      isActive: () => active,
      start,
      stop,
    }));

    await manager.start(params());
    active = false;
    await manager.start(params());

    expect(start).toHaveBeenCalledTimes(2);
    expect(stop).not.toHaveBeenCalled();
  });

  it("serializes concurrent manager starts for the same display", async () => {
    const started: StartOverlayParams[] = [];
    let active = false;
    let releaseStart: (() => void) | undefined;
    const manager = createOverlayManager(() => ({
      isActive: () => active,
      start: async (startParams) => {
        started.push(startParams);
        await new Promise<void>((resolve) => { releaseStart = resolve; });
        active = true;
      },
      stop: async () => { active = false; },
    }));

    const first = manager.start(params());
    const second = manager.start(params());
    await flush();
    expect(started).toHaveLength(1);

    releaseStart?.();
    await Promise.all([first, second]);

    expect(started).toHaveLength(1);
  });

  it("coalesces duplicate starts and closes the server on graceful stop", async () => {
    const { service, servers, children, spawnHelper, createHttpServer } = harness();
    await Promise.all([service.start(params()), service.start(params())]);
    expect(createHttpServer).toHaveBeenCalledOnce();
    expect(spawnHelper).toHaveBeenCalledOnce();
    expect(servers[0]?.listenHost).toBe("127.0.0.1");

    await service.stop();
    expect(children[0]?.killSignals).toEqual(["SIGTERM"]);
    expect(servers[0]?.closeCalls).toBe(1);
    expect(servers[0]?.closeAllConnectionsCalls).toBe(1);
  });

  it("does not finish stopping until the server close callback runs", async () => {
    const { service, servers } = harness({ autoClose: false });
    await service.start(params());
    let stopped = false;
    const stopping = service.stop().then(() => { stopped = true; });
    await flush();
    expect(servers[0]?.closeCalls).toBe(1);
    expect(stopped).toBe(false);

    servers[0]?.completeClose();
    await stopping;
    expect(stopped).toBe(true);
  });

  it("handles stop during start without spawning a helper", async () => {
    const { service, servers, spawnHelper } = harness({ autoListen: false });
    const starting = service.start(params());
    await flush();
    const stopping = service.stop();
    expect(spawnHelper).not.toHaveBeenCalled();
    servers[0]?.completeListen();
    await Promise.all([starting, stopping]);
    expect(spawnHelper).not.toHaveBeenCalled();
    expect(servers[0]?.closeCalls).toBe(1);
  });

  it("cleans up after a spawn failure and permits a later start", async () => {
    const warn = vi.fn();
    const { service, servers, spawnHelper } = harness({ children: [new FakeChild(true)] });
    await service.start(params(warn));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("synthetic spawn failure"));
    expect(servers[0]?.closeCalls).toBe(1);

    await service.start(params(warn));
    expect(spawnHelper).toHaveBeenCalledTimes(2);
    await service.stop();
  });

  it("closes after natural helper exit and permits a replacement", async () => {
    const { service, servers, children, spawnHelper } = harness();
    await service.start(params());
    children[0]?.completeExit(0);
    await flush();
    expect(servers[0]?.closeCalls).toBe(1);

    await service.start(params());
    expect(spawnHelper).toHaveBeenCalledTimes(2);
    await service.stop();
  });

  it("escalates termination and retains the child until exit is confirmed", async () => {
    const stuck = new FakeChild(false, null);
    const { service, children, spawnHelper, delays } = harness({ children: [stuck] });
    await service.start(params());
    const stopping = service.stop();
    await flush();
    expect(children[0]?.killSignals).toEqual(["SIGTERM"]);

    delays.shift()?.();
    await flush();
    expect(children[0]?.killSignals).toEqual(["SIGTERM", "SIGKILL"]);
    delays.shift()?.();
    await stopping;

    await service.start(params());
    expect(spawnHelper).toHaveBeenCalledOnce();
    stuck.completeExit(null, "SIGKILL");
    await flush();
    await service.start(params());
    expect(spawnHelper).toHaveBeenCalledTimes(2);
    await service.stop();
  });

  it("serves the shared renderer with an orphan watchdog", async () => {
    const { service, listeners } = harness();
    await service.start(params());
    let body = "";
    const response = {
      headersSent: false,
      writeHead() { this.headersSent = true; return this; },
      end(chunk?: string) { body = chunk ?? ""; return this; },
    };
    listeners[0]?.(
      { url: "/" } as IncomingMessage,
      response as unknown as ServerResponse,
    );
    expect(body).toContain("const watchdogMs=10000");
    expect(body).toContain("setInterval(checkWatchdog,250)");
    expect(body).toContain("openclaw-pet://watchdog-expired");
    expect(body).toContain("renderActivity(state.sources)");
    expect(body).toContain("openclaw-pet://resize?size=");
    expect(body).toContain("&offsetX=");
    expect(body).toContain('sheet.src="/assets/"+encodeURIComponent(source.id)+"/spritesheet.webp"');
    await service.stop();
  });

  it("hides the status panel in the shared renderer", async () => {
    const { service, listeners } = harness();
    await service.start({ ...params(), showStatus: false });
    let body = "";
    const response = {
      headersSent: false,
      writeHead() { this.headersSent = true; return this; },
      end(chunk?: string) { body = chunk ?? ""; return this; },
    };
    listeners[0]?.(
      { url: "/" } as IncomingMessage,
      response as unknown as ServerResponse,
    );
    expect(body).toContain("#activity{display:none;");
    expect(body).toContain('<div id="pets"></div>');
    await service.stop();
  });
});

describe("overlay privacy boundary", () => {
  it("exposes only renderer state", () => {
    const state = toOverlayState(snapshot, 288);
    expect(state).toEqual({
      layout: { petSize: 288, sourceCount: 1, windowOffset: { x: 0, y: 0 } },
      sources: [{
        id: "local",
        label: "Local",
        available: true,
        state: {
          animation: "review",
          changedAt: 1234,
          activityLabel: "Running safe-tool",
          activity: [{ id: 7, label: "Running safe-tool", tone: "active" }],
        },
      }],
    });
    expect(JSON.stringify(state)).not.toContain("/private/pet-assets");
  });
});
