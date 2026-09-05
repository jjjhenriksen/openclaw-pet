// Desktop-only acceptance probe. Never reads OpenClaw config or contacts a real Gateway.
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { OverlayService } from '../dist/overlay-service.js';
import { SourceCoordinator } from '../dist/source-coordinator.js';
import { createPetController } from '../dist/pet-controller.js';
import { toBridgeSnapshot } from '../dist/bridge.js';

assert.equal(process.platform, 'darwin', 'Run this smoke check in a macOS desktop session');
const distDir = resolve(dirname(fileURLToPath(import.meta.url)), '../dist');
const scratch = mkdtempSync(join(tmpdir(), 'openclaw-pet-smoke-'));
const servers = [], children = [], services = [];
let coordinator;
const receipt = { platform: process.platform, arch: process.arch, checks: {}, limitations: ['Synthetic source and empty artwork; no live Gateway', 'Dragging, hidden-state dragging, click-through and visual quality require manual acceptance', 'No Windows desktop verification'] };
const waitFor = async (test, timeout = 15000) => {
  const deadline = Date.now() + timeout;
  while (!test()) {
    assert(Date.now() < deadline, 'Timed out waiting for native smoke condition');
    await delay(100);
  }
};
const close = async server => {
  if (!server.listening) return;
  server.closeAllConnections();
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
};
try {
  const probe = join(scratch, 'focus.swift');
  writeFileSync(probe, 'import AppKit\nprint(NSWorkspace.shared.frontmostApplication?.processIdentifier ?? -1)\n');
  execFileSync('swiftc', [probe, '-o', join(scratch, 'focus')]);
  const focus = () => execFileSync(join(scratch, 'focus'), { encoding: 'utf8' }).trim();
  const pet = createPetController();
  const remote = createServer((_req, res) => res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(toBridgeSnapshot(pet.snapshot()))));
  servers.push(remote);
  await new Promise(resolve => remote.listen(0, '127.0.0.1', resolve));
  coordinator = new SourceCoordinator({
    config: { sources: [{ id: 'smoke', label: 'Isolated smoke check', assetDir: scratch, gateway: { url: `http://127.0.0.1:${remote.address().port}/snapshot`, timeoutMs: 500 } }] },
    getLocalSnapshot: () => pet.snapshot(), logger: { warn() {} },
    validateAssetDir: () => true, // This test exercises transport/lifecycle, not user artwork.
  });
  assert.equal(await coordinator.pollOnce('smoke'), true);
  const lastState = coordinator.snapshot().sources[0].state;
  await close(remote);
  assert.equal(await coordinator.pollOnce('smoke'), false);
  assert.equal(coordinator.snapshot().sources[0].available, false);
  assert.deepEqual(coordinator.snapshot().sources[0].state, lastState);
  receipt.checks.remoteDisconnectRetainsLastValidatedState = true;

  const launch = async () => {
    let server, child, polls = 0;
    const service = new OverlayService({
      platform: process.platform, distDir, helperExists: existsSync,
      createHttpServer(listener) {
        server = createServer((req, res) => { if (req.url === '/state') polls++; listener(req, res); });
        servers.push(server);
        return server;
      },
      spawnHelper(executable, args) {
        child = spawn(executable, args, { stdio: ['ignore', 'ignore', 'pipe'] });
        children.push(child);
        return child;
      },
      delay, terminateGraceMs: 2000, forceKillWaitMs: 2000,
    });
    services.push(service);
    const before = focus();
    assert.notEqual(before, '-1', 'No foreground desktop application');
    await service.start({ stateDir: scratch, assets: coordinator.assets(), size: 160, corner: 'bottom-left', showStatus: true, getSnapshot: () => coordinator.snapshot(), logger: { warn(message) { console.error(message); } } });
    await waitFor(() => polls >= 3);
    assert.equal(child.exitCode, null);
    const after = focus();
    assert.notEqual(after, String(child.pid), 'Native helper took foreground focus');
    receipt.checks.launchPreservedForegroundApplication = before === after
      ? (receipt.checks.launchPreservedForegroundApplication ?? true)
      : 'inconclusive: foreground application changed during the check';
    receipt.checks.nativeWebKitPolledRealRenderer = true;
    return { service, server, child };
  };
  const normal = await launch();
  await normal.service.stop();
  await waitFor(() => normal.child.exitCode !== null || normal.child.signalCode !== null, 5000);
  assert.equal(normal.server.listening, false);
  receipt.checks.normalServiceStopClosedHelperAndServer = true;

  const orphan = await launch();
  const disconnectedAt = Date.now();
  await close(orphan.server); // Simulate the loopback server disappearing after a host crash.
  await waitFor(() => orphan.child.exitCode !== null || orphan.child.signalCode !== null, 16000);
  assert.equal(orphan.child.exitCode, 0);
  receipt.checks.watchdogExitMs = Date.now() - disconnectedAt;
  assert(receipt.checks.watchdogExitMs >= 9000, 'Helper exited before the watchdog deadline');
  console.log(JSON.stringify(receipt, null, 2));
} finally {
  coordinator?.stop();
  for (const service of services) await service.stop();
  for (const child of children) if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  for (const server of servers) await close(server);
  rmSync(scratch, { recursive: true, force: true });
}
