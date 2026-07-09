import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildOverlayCommand,
  selectOverlayHelper,
  startOverlay,
  stopOverlay,
  toOverlayState,
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

afterEach(async () => {
  await stopOverlay();
});

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

  it("warns and starts nothing on unsupported platforms", async () => {
    const warn = vi.fn();
    await startOverlay(params(warn), { platform: "linux" });
    await startOverlay(params(warn), { platform: "linux" });
    expect(warn).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledWith(
      "OpenClaw Pet desktop overlay is not supported on linux; supported platforms are macOS and Windows 11.",
    );
  });
});

describe("overlay privacy boundary", () => {
  it("exposes only renderer state", () => {
    expect(toOverlayState(snapshot)).toEqual({ animation: "review", changedAt: 1234 });
  });
});
