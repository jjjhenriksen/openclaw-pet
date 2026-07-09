import { EventEmitter } from "node:events";
import type { IncomingMessage, RequestListener, ServerResponse } from "node:http";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  buildOverlayCommand,
  createOverlayService,
  selectOverlayHelper,
  toOverlayState,
  type OverlayChildHandle,
  type OverlayServerHandle,
  type StartOverlayParams,
} from "./overlay-service.js";
import type { PetSnapshot } from "./pet-controller.js";

const snapshot: PetSnapshot = {
  valid: true,
  assetDir: "/private/pet-assets",
  animation: "review",
  changedAt: 1234,
  activeRuns: 1,
  lastError: "must not cross the overlay protocol",
  message: "must not cross the overlay protocol",
};

function params(warn = vi.fn()): StartOverlayParams {
  return {
    stateDir: "/tmp/openclaw-pet",
    assetDir: "/private/pet-assets",
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
    const options = { port: 43123, size: 256, corner: "top-left", clickThrough: true };
    expect(buildOverlayCommand("darwin", "/plugin/dist", options)?.args).toEqual(["43123", "256", "top-left", "true"]);
    expect(buildOverlayCommand("win32", "/plugin/dist", options)?.args).toEqual(["43123", "256", "top-left", "true"]);
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
    await service.stop();
  });
});

describe("overlay privacy boundary", () => {
  it("exposes only renderer state", () => {
    expect(toOverlayState(snapshot)).toEqual({ animation: "review", changedAt: 1234 });
  });
});
