import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createServer, type RequestListener, type Server } from "node:http";
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

type StartOverlayRuntime = {
  platform?: NodeJS.Platform;
  distDir?: string;
};

type OverlayState = {
  animation: Animation;
  changedAt: number;
};

const moduleDir = dirname(fileURLToPath(import.meta.url));
let server: Server | undefined;
let overlay: ChildProcess | undefined;
let startPromise: Promise<void> | undefined;
let stopPromise: Promise<void> | undefined;
const emittedWarnings = new Set<string>();

function warnOnce(logger: StartOverlayParams["logger"], message: string): void {
  if (emittedWarnings.has(message)) return;
  emittedWarnings.add(message);
  logger.warn(message);
}

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
    let state={animation:"idle"};
    let animation="idle",frame=0,nextFrameAt=0,width=0,height=0;
    async function poll(){
      try{
        const response=await fetch("/state",{cache:"no-store"});
        if(response.ok) state=await response.json();
      }catch{}
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
    poll();
    requestAnimationFrame(draw);
  </script>
</body>
</html>`;
}

function requestHandler(params: StartOverlayParams): RequestListener {
  return (req, res) => {
    const path = req.url?.split("?")[0];
    const commonHeaders = {
      "access-control-allow-origin": "*",
      "x-content-type-options": "nosniff",
    };
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
      res.writeHead(200, { ...commonHeaders, "content-type": "image/webp", "cache-control": "private, max-age=3600" });
      res.end(readFileSync(file));
      return;
    }
    res.writeHead(404, commonHeaders).end();
  };
}

async function listenOnLoopback(target: Server): Promise<number> {
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => reject(error);
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

async function closeServer(target: Server | undefined = server): Promise<void> {
  if (!target) return;
  if (server === target) server = undefined;
  if (!target.listening) return;
  await new Promise<void>((resolve) => {
    target.close(() => resolve());
    target.closeAllConnections?.();
  });
}

async function waitForSpawn(child: ChildProcess): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const onSpawn = () => {
      child.off("error", onError);
      resolve();
    };
    const onError = (error: Error) => {
      child.off("spawn", onSpawn);
      reject(error);
    };
    child.once("spawn", onSpawn);
    child.once("error", onError);
  });
}

async function terminateHelper(child: ChildProcess | undefined): Promise<void> {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const target = child;
  await new Promise<void>((resolve) => {
    const timeout = setTimeout(done, 2_000);
    timeout.unref();
    function done() {
      clearTimeout(timeout);
      target.off("exit", done);
      target.off("error", done);
      resolve();
    }
    target.once("exit", done);
    target.once("error", done);
    if (!target.kill()) done();
  });
}

async function startOverlayOnce(params: StartOverlayParams, runtime: StartOverlayRuntime): Promise<void> {
  const platform = runtime.platform ?? process.platform;
  const helper = selectOverlayHelper(platform, runtime.distDir ?? moduleDir);
  if (!helper) {
    warnOnce(params.logger, `OpenClaw Pet desktop overlay is not supported on ${platform}; supported platforms are macOS and Windows 11.`);
    return;
  }
  if (!existsSync(helper.executable)) {
    warnOnce(params.logger, `OpenClaw Pet ${helper.platformName} overlay helper is missing; run npm run build:overlay on ${helper.platformName}.`);
    return;
  }

  const localServer = createServer(requestHandler(params));
  server = localServer;
  let child: ChildProcess | undefined;
  try {
    const port = await listenOnLoopback(localServer);
    localServer.on("error", (error) => params.logger.warn(`OpenClaw Pet overlay server error: ${error.message}`));
    const command = buildOverlayCommand(platform, runtime.distDir ?? moduleDir, { port, ...params });
    if (!command) throw new Error(`unsupported platform ${platform}`);
    child = spawn(command.executable, command.args, { detached: true, stdio: ["ignore", "ignore", "pipe"] });
    overlay = child;
    await waitForSpawn(child);
    child.stderr?.on("data", (chunk: Buffer) => params.logger.warn(`OpenClaw Pet overlay: ${chunk.toString().trim()}`));
    child.on("error", (error) => params.logger.warn(`OpenClaw Pet overlay failed: ${error.message}`));
    child.on("exit", (code, signal) => {
      if (overlay === child) overlay = undefined;
      if (!signal && code && code !== 0) params.logger.warn(`OpenClaw Pet overlay exited with code ${code}.`);
      void closeServer(localServer);
    });
    child.unref();
  } catch (error) {
    if (overlay === child) overlay = undefined;
    await terminateHelper(child);
    await closeServer(localServer);
    const message = error instanceof Error ? error.message : String(error);
    params.logger.warn(`OpenClaw Pet overlay failed to launch: ${message}`);
  }
}

export async function startOverlay(params: StartOverlayParams, runtime: StartOverlayRuntime = {}): Promise<void> {
  if (startPromise) return startPromise;
  if (stopPromise) {
    await stopPromise;
    return startOverlay(params, runtime);
  }
  if (server || overlay) return;

  const pending = startOverlayOnce(params, runtime);
  startPromise = pending;
  try {
    await pending;
  } finally {
    if (startPromise === pending) startPromise = undefined;
  }
}

export async function stopOverlay(): Promise<void> {
  if (stopPromise) return stopPromise;
  const pending = (async () => {
    if (startPromise) await startPromise;
    const child = overlay;
    overlay = undefined;
    await Promise.all([terminateHelper(child), closeServer()]);
  })();
  stopPromise = pending;
  try {
    await pending;
  } finally {
    if (stopPromise === pending) stopPromise = undefined;
  }
}
