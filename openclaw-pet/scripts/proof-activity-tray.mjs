// Real desktop proof for the Codex-style activity tray. Uses synthetic,
// sanitized source data and the real native helper/WebKit renderer.
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { OverlayService } from "../dist/overlay-service.js";

const packageRoot = resolve(new URL("..", import.meta.url).pathname);
const distDir = resolve(packageRoot, "dist");
const runs = [
  { id: "run_aaaaaaaaaaaaaaaaaaaa", session: { kind: "session", displayName: "Shape-Note Atlas", agentId: "main" }, state: "tool", toolName: "web_search", startedAt: Date.now() - 5_000, updatedAt: Date.now(), attention: false, unread: false },
  { id: "run_bbbbbbbbbbbbbbbbbbbb", session: { kind: "cron", displayName: "Nightly Research", agentId: "research" }, state: "failed", toolName: "shell", startedAt: Date.now() - 20_000, updatedAt: Date.now() - 2_000, attention: true, unread: true },
  { id: "run_cccccccccccccccccccc", session: { kind: "session", displayName: "Release Planning", agentId: "main" }, state: "completed", toolName: "apply_patch", startedAt: Date.now() - 40_000, updatedAt: Date.now() - 10_000, attention: false, unread: true },
];
const snapshot = () => ({ sources: [{ id: "local", label: "Local Gateway", available: true, openable: true, creature: "lobster", state: { animation: "review", changedAt: Date.now(), activityLabel: "Working", activity: [{ id: 1, label: "Running web_search", tone: "active" }], runs } }] });
const targetServer = createServer((_req, res) => res.writeHead(200, { "content-type": "text/plain" }).end("OpenClaw Pet session focus proof target\n"));
await new Promise((resolve) => targetServer.listen(0, "127.0.0.1", resolve));
const targetPort = targetServer.address().port;
let server;
const childHandles = [];
let serverPort;
const service = new OverlayService({
  platform: process.platform,
  distDir,
  helperExists: existsSync,
  createHttpServer(listener) { server = createServer(listener); return server; },
  spawnHelper(executable, args) { const child = spawn(executable, args, { stdio: ["ignore", "ignore", "pipe"] }); child.stderr.on("data", (chunk) => console.error(String(chunk))); childHandles.push(child); return child; },
  delay: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  terminateGraceMs: 2_000,
  forceKillWaitMs: 2_000,
});
await service.start({ stateDir: "/tmp", assets: [{ id: "local", label: "Local Gateway", creature: "lobster" }], size: 220, corner: "bottom-right", showStatus: true, getSnapshot: snapshot, acknowledgeRun: (id) => { const run = runs.find((candidate) => candidate.id === id); if (!run) return false; run.unread = false; run.attention = false; return true; }, resolveOpenRun: (id) => id === "run_aaaaaaaaaaaaaaaaaaaa" ? `http://127.0.0.1:${targetPort}/focused` : undefined, logger: { warn: console.error } });
serverPort = server.address().port;
const openProof = await fetch(`http://127.0.0.1:${serverPort}/open-run?id=run_aaaaaaaaaaaaaaaaaaaa`).then(async (response) => ({ status: response.status, body: await response.json() }));
if (openProof.status !== 200 || openProof.body.url !== `http://127.0.0.1:${targetPort}/focused`) throw new Error(`open-run proof failed: ${JSON.stringify(openProof)}`);
const renderedState = await fetch(`http://127.0.0.1:${serverPort}/state`).then((response) => response.json());
console.log(JSON.stringify({ ready: true, port: serverPort, pid: childHandles[0]?.pid, openProof, renderedState }));
const cleanup = async () => { await service.stop(); for (const child of childHandles) if (child.exitCode === null) child.kill("SIGTERM"); server.close(); targetServer.close(); };
process.on("SIGINT", () => void cleanup().finally(() => process.exit(0)));
process.on("SIGTERM", () => void cleanup().finally(() => process.exit(0)));
