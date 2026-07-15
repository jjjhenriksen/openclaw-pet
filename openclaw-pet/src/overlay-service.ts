import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createServer, type RequestListener } from "node:http";
import type { AddressInfo } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ANIMATIONS } from "./pet-controller.js";
import type { DisplaySnapshot, DisplaySourceAsset, DisplaySourceState } from "./source-coordinator.js";

export const MIN_OVERLAY_SIZE = 96;
export const MAX_OVERLAY_SIZE = 768;
export const OVERLAY_ACTIVITY_WIDTH = 220;

export type OverlayHelper = {
  executable: string;
  platformName: "macOS" | "Windows 11";
};

export type OverlayCommand = OverlayHelper & { args: string[] };

export type StartOverlayParams = {
  stateDir: string;
  assets: DisplaySourceAsset[];
  size: number;
  corner: string;
  showStatus?: boolean;
  clickThrough?: boolean;
  windowOffset?: { x: number; y: number };
  getSnapshot: () => DisplaySnapshot;
  getSize?: (sourceId?: string) => number;
  getWindowOffset?: (sourceId?: string) => { x: number; y: number };
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

export type OverlayState = {
  layout: {
    petSize: number;
    sourceCount: number;
    windowOffset: { x: number; y: number };
  };
  sources: DisplaySourceState[];
};

type OverlayServiceInstance = Pick<OverlayService, "isActive" | "start" | "stop">;
export type OverlayServiceFactory = () => OverlayServiceInstance;

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
  params: Pick<StartOverlayParams, "size" | "corner" | "showStatus" | "clickThrough" | "windowOffset"> & { port: number; sourceCount: number },
): OverlayCommand | undefined {
  const helper = selectOverlayHelper(platform, distDir);
  if (!helper) return undefined;
  const offset = params.windowOffset ?? { x: 0, y: 0 };
  return {
    ...helper,
    args: [
      String(params.port),
      String(params.size),
      params.corner,
      String(params.clickThrough ?? false),
      String(params.sourceCount),
      String(offset.x),
      String(offset.y),
      String(params.showStatus ?? true),
    ],
  };
}

export function normalizeOverlaySize(value: unknown): number | undefined {
  const size = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
  return typeof size === "number" && Number.isSafeInteger(size) && size >= MIN_OVERLAY_SIZE && size <= MAX_OVERLAY_SIZE
    ? size
    : undefined;
}

export function calculateOverlayDimensions(size: number, sourceCount: number, showStatus = true): { width: number; height: number } {
  const petWidth = size * Math.max(1, sourceCount);
  return {
    width: showStatus ? Math.max(petWidth + OVERLAY_ACTIVITY_WIDTH, 320) : petWidth,
    height: showStatus ? Math.max(size, 160) : size,
  };
}

export function toOverlayState(snapshot: DisplaySnapshot, petSize: number, windowOffset: { x: number; y: number } = { x: 0, y: 0 }): OverlayState {
  return {
    layout: { petSize, sourceCount: snapshot.sources.length, windowOffset },
    sources: snapshot.sources.map(({ id, label, available, state }) => ({
      id,
      label,
      available,
      state: {
        animation: state.animation,
        changedAt: state.changedAt,
        activityLabel: state.activityLabel,
        activity: state.activity.map(({ id: activityId, label: activityLabel, tone }) => ({ id: activityId, label: activityLabel, tone })),
      },
    })),
  };
}

function effectiveOverlaySize(params: Pick<StartOverlayParams, "assets" | "getSize" | "size">): number {
  const sourceId = params.assets.length === 1 ? params.assets[0]?.id : undefined;
  return params.getSize?.(sourceId) ?? params.assets[0]?.size ?? params.size;
}

function effectiveWindowOffset(params: Pick<StartOverlayParams, "assets" | "getWindowOffset" | "windowOffset">): { x: number; y: number } {
  const sourceId = params.assets.length === 1 ? params.assets[0]?.id : undefined;
  return params.getWindowOffset?.(sourceId) ?? params.windowOffset ?? { x: 0, y: 0 };
}

function overlayHtml(size: number, sourceCount: number, showStatus: boolean): string {
  const animations = JSON.stringify(ANIMATIONS).replaceAll("<", "\\u003c");
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <style>
    :root{--pet-size:${size}px}
    html,body{width:100%;height:100%;margin:0;background:transparent;overflow:hidden;user-select:none;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    #activity{display:${showStatus ? "block" : "none"};box-sizing:border-box;position:absolute;left:8px;bottom:8px;width:204px;max-height:calc(100% - 16px);overflow:hidden;padding:9px 10px;border-radius:11px;background:rgba(27,29,31,.94);color:#f5f5f5;box-shadow:0 2px 8px rgba(0,0,0,.26)}
    #head{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:11px;font-weight:700;letter-spacing:.01em}
    button{border:0;background:transparent;color:#b9c5ff;font:inherit;padding:0;cursor:pointer}
    ul{list-style:none;margin:7px 0 0;padding:0;display:grid;gap:5px}
    .item{display:grid;grid-template-columns:6px minmax(0,1fr);column-gap:6px;font-size:11px;line-height:14px}
    .copy{min-width:0}.name{display:block;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.status{display:block;color:#d1d5db;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .dot{width:6px;height:6px;border-radius:50%;background:#9ca3af;flex:0 0 auto}
    .active .dot{background:#8ab4ff}.success .dot{background:#65d6a0}.error .dot{background:#f38b8b}
    .unavailable .dot{background:#9ca3af}.unavailable .status{color:#a8adb5}
    .collapsed li:nth-child(n+3){display:none}
    #pets{position:absolute;right:0;bottom:0;display:flex;align-items:flex-end}
    .pet{position:relative;width:var(--pet-size);height:var(--pet-size);flex:0 0 auto}.pet.unavailable{opacity:.46}
    canvas{width:100%;height:100%;display:block;image-rendering:pixelated;pointer-events:none}
  </style>
</head>
<body>
  <section id="activity" aria-live="polite">
    <div id="head"><span>OpenClaw pets</span><button id="toggle" aria-expanded="true">Hide</button></div>
    <ul id="events"></ul>
  </section>
  <div id="pets"></div>
  <script>
    const animations=${animations};
    const events=document.querySelector("#events");
    const pets=document.querySelector("#pets");
    const activityPanel=document.querySelector("#activity");
    const toggle=document.querySelector("#toggle");
    const watchdogMs=10000;
    let state={layout:{petSize:${size},sourceCount:${Math.max(1, sourceCount)},windowOffset:{x:0,y:0}},sources:[]};
    let layoutKey="${size}:${Math.max(1, sourceCount)}:0:0";
    let lastStateAt=Date.now(),shutdownRequested=false;
    let collapsed=false;
    const renderers=new Map();
    toggle.onclick=()=>{
      collapsed=!collapsed;
      activityPanel.classList.toggle("collapsed",collapsed);
      toggle.textContent=collapsed?"Show":"Hide";
      toggle.setAttribute("aria-expanded",String(!collapsed));
    };
    function toneFor(source){
      if(!source.available)return "unavailable";
      const item=source.state.activity&&source.state.activity[0];
      return item?item.tone:"neutral";
    }
    function renderActivity(sources){
      events.replaceChildren(...(sources||[]).map(source=>{
        const row=document.createElement("li");
        row.className="item "+toneFor(source);
        const dot=document.createElement("span");
        dot.className="dot";
        const copy=document.createElement("span");
        copy.className="copy";
        const name=document.createElement("span");
        name.className="name";
        name.textContent=source.label;
        const status=document.createElement("span");
        status.className="status";
        status.textContent=source.available?(source.state.activityLabel||"Ready"):"Source unavailable";
        copy.append(name,status);
        row.append(dot,copy);
        return row;
      }));
    }
    function createRenderer(source){
      const root=document.createElement("div");
      root.className="pet";
      root.dataset.sourceId=source.id;
      const canvas=document.createElement("canvas");
      root.append(canvas);
      pets.append(root);
      const sheet=new Image();
      sheet.src="/assets/"+encodeURIComponent(source.id)+"/spritesheet.webp";
      const renderer={root,canvas,context:canvas.getContext("2d"),sheet,source,animation:"idle",frame:0,nextFrameAt:0,width:0,height:0};
      renderers.set(source.id,renderer);
      return renderer;
    }
    function syncSources(sources){
      const active=new Set();
      for(const source of sources||[]){
        active.add(source.id);
        const renderer=renderers.get(source.id)||createRenderer(source);
        renderer.source=source;
        renderer.root.classList.toggle("unavailable",!source.available);
      }
      for(const [id,renderer] of renderers){
        if(active.has(id))continue;
        renderer.root.remove();
        renderers.delete(id);
      }
    }
    function applyLayout(layout){
      const petSize=layout&&layout.petSize||${size};
      const count=Math.max(1,layout&&layout.sourceCount||1);
      const offset=layout&&layout.windowOffset||{x:0,y:0};
      const offsetX=Number.isFinite(offset.x)?offset.x:0;
      const offsetY=Number.isFinite(offset.y)?offset.y:0;
      document.documentElement.style.setProperty("--pet-size",petSize+"px");
      const nextKey=petSize+":"+count+":"+offsetX+":"+offsetY;
      if(nextKey===layoutKey)return;
      layoutKey=nextKey;
      location.href="openclaw-pet://resize?size="+encodeURIComponent(petSize)+"&count="+encodeURIComponent(count)+"&offsetX="+encodeURIComponent(offsetX)+"&offsetY="+encodeURIComponent(offsetY);
    }
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
        applyLayout(state.layout);
        syncSources(state.sources);
        renderActivity(state.sources);
        lastStateAt=Date.now();
      }catch{}
      if(shutdownRequested)return;
      setTimeout(poll,75);
    }
    function draw(time){
      for(const renderer of renderers.values()){
        const animationName=renderer.source.state.animation;
        const next=animations[animationName]||animations.idle;
        if(renderer.animation!==animationName){renderer.animation=animationName;renderer.frame=0;renderer.nextFrameAt=time;}
        if(time>=renderer.nextFrameAt){renderer.frame=(renderer.frame+1)%next.frames;renderer.nextFrameAt=time+next.durations[renderer.frame];}
        if(renderer.sheet.complete&&renderer.sheet.naturalWidth){
          const nextWidth=renderer.canvas.clientWidth,nextHeight=renderer.canvas.clientHeight;
          if(renderer.width!==nextWidth||renderer.height!==nextHeight){renderer.width=renderer.canvas.width=nextWidth;renderer.height=renderer.canvas.height=nextHeight;}
          renderer.context.clearRect(0,0,renderer.width,renderer.height);
          renderer.context.imageSmoothingEnabled=false;
          const scale=Math.min(renderer.width/192,renderer.height/208),petWidth=192*scale,petHeight=208*scale;
          renderer.context.drawImage(renderer.sheet,renderer.frame*192,next.row*208,192,208,(renderer.width-petWidth)/2,(renderer.height-petHeight)/2,petWidth,petHeight);
        }
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
      res.end(overlayHtml(effectiveOverlaySize(params), params.assets.length, params.showStatus ?? true));
      return;
    }
    if (path === "/state") {
      res.writeHead(200, { ...commonHeaders, "content-type": "application/json", "cache-control": "no-store" });
      res.end(JSON.stringify(toOverlayState(params.getSnapshot(), effectiveOverlaySize(params), effectiveWindowOffset(params))));
      return;
    }
    const assetMatch = path?.match(/^\/assets\/([a-zA-Z0-9_-]{1,32})\/spritesheet\.webp$/);
    if (assetMatch) {
      const asset = params.assets.find((candidate) => candidate.id === assetMatch[1]);
      if (!asset) {
        res.writeHead(404, commonHeaders).end();
        return;
      }
      const file = join(asset.assetDir, "spritesheet.webp");
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

      const command = buildOverlayCommand(this.runtime.platform, this.runtime.distDir, { port, sourceCount: params.assets.length, ...params });
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

  isActive(): boolean {
    return Boolean(this.server || this.helper || this.startPromise);
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

function overlayDisplayKey(params: StartOverlayParams): string {
  return JSON.stringify({
    assets: params.assets.map(({ id, assetDir }) => ({ id, assetDir })),
    corner: params.corner,
    showStatus: params.showStatus ?? true,
    clickThrough: params.clickThrough ?? false,
  });
}

function offsetForSource(index: number, sizes: number[], corner: string, showStatus = true): { x: number; y: number } {
  if (index === 0) return { x: 0, y: 0 };
  const step = sizes.slice(0, index).reduce((total, size) => total + calculateOverlayDimensions(size, 1, showStatus).width + 24, 0);
  return {
    x: corner.endsWith("left") ? step : -step,
    y: 0,
  };
}

function sourceSize(params: StartOverlayParams, asset: DisplaySourceAsset): number {
  return params.getSize?.(asset.id) ?? asset.size ?? params.size;
}

function sourceSizes(params: StartOverlayParams): number[] {
  return params.assets.map((asset) => sourceSize(params, asset));
}

function snapshotForSource(params: StartOverlayParams, sourceId: string): DisplaySnapshot {
  return {
    sources: params.getSnapshot().sources.filter((source) => source.id === sourceId),
  };
}

export function createOverlayManager(createService: OverlayServiceFactory = createOverlayService) {
  let services: OverlayServiceInstance[] = [];
  let activeKey: string | undefined;
  let operation: Promise<void> = resolvedPromise;
  const serviceParams = (params: StartOverlayParams, asset: DisplaySourceAsset, index: number, sizes: number[]): StartOverlayParams => {
    const size = sizes[index] ?? sourceSize(params, asset);
    const getSize = (sourceId?: string) => params.getSize?.(sourceId ?? asset.id) ?? asset.size ?? params.size;
    const getWindowOffset = () => offsetForSource(index, sourceSizes(params), params.corner, params.showStatus ?? true);
    return params.assets.length === 1
      ? { ...params, size, getSize, getWindowOffset: params.getWindowOffset ?? (() => params.windowOffset ?? { x: 0, y: 0 }) }
      : {
        ...params,
        assets: [asset],
        size,
        windowOffset: offsetForSource(index, sizes, params.corner, params.showStatus ?? true),
        getSnapshot: () => snapshotForSource(params, asset.id),
        getSize,
        getWindowOffset,
      };
  };
  const stopCurrent = async (): Promise<void> => {
    const current = services;
    services = [];
    activeKey = undefined;
    await Promise.all(current.map((service) => service.stop()));
  };
  const enqueue = (task: () => Promise<void>): Promise<void> => {
    const next = operation.then(task, task);
    operation = next.catch(() => undefined);
    return next;
  };
  return {
    async start(params: StartOverlayParams): Promise<void> {
      await enqueue(async () => {
        const nextKey = overlayDisplayKey(params);
        const sizes = sourceSizes(params);
        if (activeKey === nextKey && services.length === params.assets.length) {
          if (services.every((service) => service.isActive())) return;
          await Promise.all(params.assets.map((asset, index) => services[index]!.start(serviceParams(params, asset, index, sizes))));
          return;
        }
        await stopCurrent();
        activeKey = nextKey;
        const pending = params.assets.map((asset, index) => {
          const service = createService();
          return { service, params: serviceParams(params, asset, index, sizes) };
        });
        services = pending.map(({ service }) => service);
        await Promise.all(pending.map(({ service, params: serviceParams }) => service.start(serviceParams)));
      });
    },
    stop: () => enqueue(stopCurrent),
  };
}

const overlayManager = createOverlayManager();

export async function startOverlay(params: StartOverlayParams): Promise<void> {
  await overlayManager.start(params);
}

export async function stopOverlay(): Promise<void> {
  await overlayManager.stop();
}
