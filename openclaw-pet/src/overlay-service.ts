import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createServer, type RequestListener } from "node:http";
import type { AddressInfo } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ANIMATIONS, type Animation, type PetSnapshot } from "./pet-controller.js";

export type OverlayHelper = {
  executable: string;
  platformName: "macOS" | "Windows 11";
};

export type OverlayCommand = OverlayHelper & { args: string[] };

export type StartOverlayParams = {
  stateDir: string;
  assetDir: string;
  size: number;
  corner: string;
  clickThrough?: boolean;
  getSnapshot: () => PetSnapshot;
  logger: { warn: (message: string) => void };
};

export type OverlayServerHandle = {
  listening: boolean;
  listen: (port: number, host: string, callback: () => void) => unknown;
  address: () => AddressInfo | string | null;
  close: (callback: (error?: Error) => void) => unknown;
  closeAllConnections?: () => void;
  on: (event: string, listener: (...args: unknown[]) => void) => unknown;
  once: (event: string, listener: (...args: unknown[]) => void) => unknown;
  off: (event: string, listener: (...args: unknown[]) => void) => unknown;
};

export type OverlayChildHandle = {
  stderr?: { on: (event: "data", listener: (chunk: Buffer) => void) => unknown } | null;
  exitCode: number | null;
  signalCode: NodeJS.Signals | null;
  kill: (signal?: NodeJS.Signals | number) => boolean;
  on: (event: string, listener: (...args: unknown[]) => void) => unknown;
  once: (event: string, listener: (...args: unknown[]) => void) => unknown;
  off: (event: string, listener: (...args: unknown[]) => void) => unknown;
};

export type OverlayRuntime = {
  platform: NodeJS.Platform;
  distDir: string;
  helperExists: (path: string) => boolean;
  createHttpServer: (listener: RequestListener) => OverlayServerHandle;
  spawnHelper: (executable: string, args: string[]) => OverlayChildHandle;
  delay: (milliseconds: number) => Promise<void>;
  terminateGraceMs: number;
  forceKillWaitMs: number;
};

type OverlayState = {
  animation: Animation;
  changedAt: number;
};

type HelperExit = {
  code: number | null;
  signal: NodeJS.Signals | null;
};

type ActiveHelper = {
  child: OverlayChildHandle;
  server: OverlayServerHandle;
  logger: StartOverlayParams["logger"];
  spawned: Promise<void>;
  resolveSpawn: () => void;
  rejectSpawn: (error: Error) => void;
  exited: Promise<HelperExit>;
  resolveExit: (result: HelperExit) => void;
  didExit: boolean;
  terminating: boolean;
};

const moduleDir = dirname(fileURLToPath(import.meta.url));
const resolvedPromise = Promise.resolve();

function defaultDelay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, milliseconds);
    timer.unref();
  });
}

const defaultRuntime: OverlayRuntime = {
  platform: process.platform,
  distDir: moduleDir,
  helperExists: existsSync,
  createHttpServer: (listener) => createServer(listener) as unknown as OverlayServerHandle,
  spawnHelper: (executable, args) => spawn(executable, args, {
    stdio: ["ignore", "ignore", "pipe"],
  }) as unknown as OverlayChildHandle,
  delay: defaultDelay,
  terminateGraceMs: 2_000,
  forceKillWaitMs: 2_000,
};

export function selectOverlayHelper(platform: NodeJS.Platform, distDir: string): OverlayHelper | undefined {
  if (platform === "darwin") return { executable: join(distDir, "pet-overlay-macos"), platformName: "macOS" };
  if (platform === "win32") return { executable: join(distDir, "pet-overlay-win.exe"), platformName: "Windows 11" };
  return undefined;
}

export function buildOverlayCommand(
  platform: NodeJS.Platform,
  distDir: string,
  params: Pick<StartOverlayParams, "size" | "corner" | "clickThrough"> & { port: number },
): OverlayCommand | undefined {
  const helper = selectOverlayHelper(platform, distDir);
  if (!helper) return undefined;
  return {
    ...helper,
    args: [String(params.port), String(params.size), params.corner, String(params.clickThrough ?? false)],
  };
}

export function toOverlayState(snapshot: PetSnapshot): OverlayState {
  return { animation: snapshot.animation, changedAt: snapshot.changedAt };
}

function overlayHtml(): string {
  const animations = JSON.stringify(ANIMATIONS).replaceAll("<", "\\u003c");
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <style>
    html,body{width:100%;height:100%;margin:0;background:transparent;overflow:hidden;user-select:none}
    canvas{width:100vw;height:100vh;display:block;image-rendering:pixelated;pointer-events:none}
  </style>
</head>
<body>
  <canvas></canvas>
  <script>
    const animations=${animations};
    const canvas=document.querySelector("canvas");
    const context=canvas.getContext("2d");
    const sheet=new Image();
    sheet.src="/spritesheet.webp";
    const watchdogMs=10000;
    let state={animation:"idle"};
    let animation="idle",frame=0,nextFrameAt=0,width=0,height=0;
    let lastStateAt=Date.now(),shutdownRequested=false;
    function checkWatchdog(){
      if(Date.now()-lastStateAt<watchdogMs||shutdownRequested)return;
      shutdownRequested=true;
      location.href="openclaw-pet://watchdog-expired";
    }
    async function poll(){
      try{
        const response=await fetch("/state",{cache:"no-store"});
        if(!response.ok) throw new Error("state unavailable");
        state=await response.json();
        lastStateAt=Date.now();
      }catch{}
      if(shutdownRequested)return;
      setTimeout(poll,75);
    }
    function draw(time){
      const next=animations[state.animation]||animations.idle;
      if(animation!==state.animation){animation=state.animation;frame=0;nextFrameAt=time;}
      if(time>=nextFrameAt){frame=(frame+1)%next.frames;nextFrameAt=time+next.durations[frame];}
      if(sheet.complete&&sheet.naturalWidth){
        if(width!==innerWidth||height!==innerHeight){width=canvas.width=innerWidth;height=canvas.height=innerHeight;}
        context.clearRect(0,0,width,height);
        context.imageSmoothingEnabled=false;
        const scale=Math.min(width/192,height/208),petWidth=192*scale,petHeight=208*scale;
        context.drawImage(sheet,frame*192,next.row*208,192,208,(width-petWidth)/2,(height-petHeight)/2,petWidth,petHeight);
      }
      requestAnimationFrame(draw);
    }
    setInterval(checkWatchdog,250);
    poll();
    requestAnimationFrame(draw);
  </script>
</body>
</html>`;
}

function requestHandler(params: StartOverlayParams): RequestListener {
  return (req, res) => {
    const path = req.url?.split("?")[0];
    const commonHeaders = { "x-content-type-options": "nosniff" };
    if (path === "/") {
      res.writeHead(200, {
        ...commonHeaders,
        "content-type": "text/html; charset=utf-8",
        "content-security-policy": "default-src 'none'; connect-src 'self'; img-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'",
        "cache-control": "no-store",
      });
      res.end(overlayHtml());
      return;
    }
    if (path === "/state") {
      res.writeHead(200, { ...commonHeaders, "content-type": "application/json", "cache-control": "no-store" });
      res.end(JSON.stringify(toOverlayState(params.getSnapshot())));
      return;
    }
    if (path === "/spritesheet.webp") {
      const file = join(params.assetDir, "spritesheet.webp");
      if (!existsSync(file)) {
        res.writeHead(404, commonHeaders).end();
        return;
      }
      try {
        res.writeHead(200, { ...commonHeaders, "content-type": "image/webp", "cache-control": "private, max-age=3600" });
        res.end(readFileSync(file));
      } catch {
        if (!res.headersSent) res.writeHead(404, commonHeaders);
        res.end();
      }
      return;
    }
    res.writeHead(404, commonHeaders).end();
  };
}

export class OverlayService {
  private readonly runtime: OverlayRuntime;
  private server: OverlayServerHandle | undefined;
  private helper: ActiveHelper | undefined;
  private startPromise: Promise<void> | undefined;
  private stopPromise: Promise<void> | undefined;
  private closingServer: Promise<void> | undefined;
  private closingTarget: OverlayServerHandle | undefined;
  private stopRequested = false;
  private readonly emittedWarnings = new Set<string>();

  constructor(runtime: OverlayRuntime) {
    this.runtime = runtime;
  }

  private warnOnce(logger: StartOverlayParams["logger"], message: string): void {
    if (this.emittedWarnings.has(message)) return;
    this.emittedWarnings.add(message);
    logger.warn(message);
  }

  private async listenOnLoopback(target: OverlayServerHandle): Promise<number> {
    await new Promise<void>((resolve, reject) => {
      const onError = (error: unknown) => reject(error instanceof Error ? error : new Error(String(error)));
      target.once("error", onError);
      target.listen(0, "127.0.0.1", () => {
        target.off("error", onError);
        resolve();
      });
    });
    const address = target.address();
    if (!address || typeof address === "string") throw new Error("overlay server did not receive a TCP port");
    return address.port;
  }

  private beginServerClose(target: OverlayServerHandle | undefined = this.server): Promise<void> {
    if (!target) return this.closingServer ?? resolvedPromise;
    if (this.closingTarget === target && this.closingServer) return this.closingServer;
    if (this.closingServer) return this.closingServer.then(() => this.beginServerClose(target));
    if (this.server === target) this.server = undefined;

    const pending = new Promise<void>((resolve) => {
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        resolve();
      };
      if (!target.listening) {
        finish();
        return;
      }
      try {
        target.close(() => finish());
        target.closeAllConnections?.();
      } catch {
        finish();
      }
    });
    this.closingTarget = target;
    this.closingServer = pending;
    void pending.finally(() => {
      if (this.closingServer === pending) {
        this.closingServer = undefined;
        this.closingTarget = undefined;
      }
    });
    return pending;
  }

  private createActiveHelper(child: OverlayChildHandle, target: OverlayServerHandle, logger: StartOverlayParams["logger"]): ActiveHelper {
    let resolveSpawn!: () => void;
    let rejectSpawn!: (error: Error) => void;
    let resolveExit!: (result: HelperExit) => void;
    const active: ActiveHelper = {
      child,
      server: target,
      logger,
      spawned: new Promise<void>((resolve, reject) => { resolveSpawn = resolve; rejectSpawn = reject; }),
      resolveSpawn: () => resolveSpawn(),
      rejectSpawn: (error) => rejectSpawn(error),
      exited: new Promise<HelperExit>((resolve) => { resolveExit = resolve; }),
      resolveExit: (result) => resolveExit(result),
      didExit: false,
      terminating: false,
    };

    const onRuntimeError = (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn(`OpenClaw Pet overlay failed: ${message}`);
    };
    const onSpawnError = (error: unknown) => {
      const failure = error instanceof Error ? error : new Error(String(error));
      child.off("spawn", onSpawn);
      active.rejectSpawn(failure);
      this.completeHelperExit(active, { code: null, signal: null });
    };
    const onSpawn = () => {
      child.off("error", onSpawnError);
      child.on("error", onRuntimeError);
      active.resolveSpawn();
    };
    const onExit = (code: unknown, signal: unknown) => {
      child.off("error", onSpawnError);
      child.off("error", onRuntimeError);
      const exitCode = typeof code === "number" ? code : null;
      const exitSignal = typeof signal === "string" ? signal as NodeJS.Signals : null;
      this.completeHelperExit(active, { code: exitCode, signal: exitSignal });
    };

    child.once("spawn", onSpawn);
    child.once("error", onSpawnError);
    child.once("exit", onExit);
    child.stderr?.on("data", (chunk: Buffer) => logger.warn(`OpenClaw Pet overlay: ${chunk.toString().trim()}`));
    return active;
  }

  private completeHelperExit(active: ActiveHelper, result: HelperExit): void {
    if (active.didExit) return;
    active.didExit = true;
    active.resolveExit(result);
    if (this.helper === active) this.helper = undefined;
    if (!active.terminating && !result.signal && result.code && result.code !== 0) {
      active.logger.warn(`OpenClaw Pet overlay exited with code ${result.code}.`);
    }
    void this.beginServerClose(active.server);
  }

  private signalHelper(active: ActiveHelper, signal: NodeJS.Signals): void {
    try {
      active.child.kill(signal);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      active.logger.warn(`OpenClaw Pet overlay could not receive ${signal}: ${message}`);
    }
  }

  private async terminateHelper(active: ActiveHelper | undefined): Promise<void> {
    if (!active || active.didExit) return;
    active.terminating = true;
    this.signalHelper(active, "SIGTERM");
    const graceful = await Promise.race([
      active.exited.then(() => true),
      this.runtime.delay(this.runtime.terminateGraceMs).then(() => false),
    ]);
    if (graceful || active.didExit) return;

    active.logger.warn("OpenClaw Pet overlay did not exit after SIGTERM; forcing termination.");
    this.signalHelper(active, "SIGKILL");
    const forced = await Promise.race([
      active.exited.then(() => true),
      this.runtime.delay(this.runtime.forceKillWaitMs).then(() => false),
    ]);
    if (!forced && !active.didExit) {
      active.logger.warn("OpenClaw Pet overlay termination could not be confirmed; a new helper will not start until it exits.");
    }
  }

  private async startOnce(params: StartOverlayParams): Promise<void> {
    const helper = selectOverlayHelper(this.runtime.platform, this.runtime.distDir);
    if (!helper) {
      this.warnOnce(params.logger, `OpenClaw Pet desktop overlay is not supported on ${this.runtime.platform}; supported platforms are macOS and Windows 11.`);
      return;
    }
    if (!this.runtime.helperExists(helper.executable)) {
      this.warnOnce(params.logger, `OpenClaw Pet ${helper.platformName} overlay helper is missing; run npm run build:overlay on ${helper.platformName}.`);
      return;
    }

    const localServer = this.runtime.createHttpServer(requestHandler(params));
    this.server = localServer;
    let active: ActiveHelper | undefined;
    try {
      const port = await this.listenOnLoopback(localServer);
      localServer.on("error", (error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        params.logger.warn(`OpenClaw Pet overlay server error: ${message}`);
      });
      if (this.stopRequested) {
        await this.beginServerClose(localServer);
        return;
      }

      const command = buildOverlayCommand(this.runtime.platform, this.runtime.distDir, { port, ...params });
      if (!command) throw new Error(`unsupported platform ${this.runtime.platform}`);
      const child = this.runtime.spawnHelper(command.executable, command.args);
      active = this.createActiveHelper(child, localServer, params.logger);
      this.helper = active;
      await active.spawned;
    } catch (error) {
      if (active && !active.didExit) await this.terminateHelper(active);
      await this.beginServerClose(localServer);
      const message = error instanceof Error ? error.message : String(error);
      params.logger.warn(`OpenClaw Pet overlay failed to launch: ${message}`);
    }
  }

  async start(params: StartOverlayParams): Promise<void> {
    if (this.startPromise) return this.startPromise;
    if (this.stopPromise) {
      await this.stopPromise;
      return this.start(params);
    }
    if (this.closingServer) {
      await this.closingServer;
      return this.start(params);
    }
    if (this.server || this.helper) return;

    this.stopRequested = false;
    const pending = this.startOnce(params);
    this.startPromise = pending;
    try {
      await pending;
    } finally {
      if (this.startPromise === pending) this.startPromise = undefined;
    }
  }

  async stop(): Promise<void> {
    this.stopRequested = true;
    if (this.stopPromise) return this.stopPromise;
    const pending = (async () => {
      if (this.startPromise) await this.startPromise;
      const active = this.helper;
      const closing = this.beginServerClose();
      await Promise.all([this.terminateHelper(active), closing]);
      if (this.closingServer) await this.closingServer;
    })();
    this.stopPromise = pending;
    try {
      await pending;
    } finally {
      if (this.stopPromise === pending) this.stopPromise = undefined;
    }
  }
}

export function createOverlayService(overrides: Partial<OverlayRuntime> = {}): OverlayService {
  return new OverlayService({ ...defaultRuntime, ...overrides });
}

const overlayService = createOverlayService();

export async function startOverlay(params: StartOverlayParams): Promise<void> {
  await overlayService.start(params);
}

export async function stopOverlay(): Promise<void> {
  await overlayService.stop();
}
