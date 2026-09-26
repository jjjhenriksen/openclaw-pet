import { describe, expect, it } from "vitest";
import { parseBridgeSnapshot, PET_BRIDGE_VERSION, toBridgeSnapshot } from "./bridge.js";
import type { PetSnapshot } from "./pet-controller.js";

const privateSnapshot: PetSnapshot = {
  valid: true,
  assetDir: "/private/pet-assets",
  animation: "review",
  changedAt: 1234,
  activeRuns: 1,
  activityCount: 2,
  lastEvent: "private event detail",
  activityLabel: "Running safe-tool",
  activity: [{ id: 7, label: "Running safe-tool", tone: "active", at: 1200 }],
  lastError: "private controller error",
  message: "private controller message",
  runs: [],
};

describe("pet bridge privacy contract", () => {
  it("projects a versioned snapshot with no controller or asset details", () => {
    const bridge = toBridgeSnapshot(privateSnapshot);
    expect(bridge).toEqual({
      version: PET_BRIDGE_VERSION,
      state: {
        animation: "review",
        changedAt: 1234,
        activityLabel: "Running safe-tool",
        activity: [{ id: 7, label: "Running safe-tool", tone: "active" }],
        runs: [],
      },
    });
    const wire = JSON.stringify(bridge);
    expect(wire).not.toContain("assetDir");
    expect(wire).not.toContain("/private/pet-assets");
    expect(wire).not.toContain("private");
  });

  it("rejects unknown fields and malformed remote labels", () => {
    const valid = toBridgeSnapshot(privateSnapshot);
    expect(parseBridgeSnapshot(valid)).toEqual(valid);
    expect(parseBridgeSnapshot({ ...valid, assetDir: "/remote/private" })).toBeUndefined();
    expect(parseBridgeSnapshot({
      ...valid,
      state: { ...valid.state, toolArgs: { command: "private" } },
    })).toBeUndefined();
    expect(parseBridgeSnapshot({
      ...valid,
      state: { ...valid.state, activityLabel: "x".repeat(141) },
    })).toBeUndefined();
  });

  it("exposes only opaque run metadata and rejects raw identifiers", () => {
    const bridge = toBridgeSnapshot({ ...privateSnapshot, runs: [{
      id: "run_0123456789abcdef0123",
      session: { kind: "cron", displayName: "Nightly Research", agentId: "main" },
      state: "tool", toolName: "web_search", startedAt: 1000, updatedAt: 1200,
      attention: false, unread: false,
    }] });
    expect(bridge.state.runs).toEqual([expect.objectContaining({
      id: "run_0123456789abcdef0123", session: { kind: "cron", displayName: "Nightly Research", agentId: "main" },
      state: "tool", toolName: "web_search", startedAt: 1000, updatedAt: 1200,
    })]);
    expect(JSON.stringify(bridge)).not.toContain("agent:main:cron");
    expect(parseBridgeSnapshot({ ...bridge, state: { ...bridge.state, runs: [{ ...bridge.state.runs[0], id: "agent:main:cron:secret" }] } })).toBeUndefined();
  });

  it("normalizes control characters in outgoing display labels", () => {
    const bridge = toBridgeSnapshot({
      ...privateSnapshot,
      activityLabel: "Working\nnow",
      activity: [{ id: 7, label: "Tool\u0000complete", tone: "success", at: 1200 }],
    });
    expect(bridge.state.activityLabel).toBe("Working now");
    expect(bridge.state.activity[0]?.label).toBe("Tool complete");
  });
});

it("normalizes incoming session names and detaches parsed runs from input", () => {
  const raw = toBridgeSnapshot({ ...privateSnapshot, runs: [{
    id: "run_0123456789abcdef0123", session: { kind: "session", displayName: "Research", agentId: "main" },
    state: "thinking", startedAt: 1, updatedAt: 2, attention: false, unread: false,
  }] });
  raw.state.runs[0].session!.displayName = "  Research\u0000\n Plan  ";
  const parsed = parseBridgeSnapshot(raw)!;
  expect(parsed.state.runs[0].session!.displayName).toBe("Research Plan");
  raw.state.runs[0].session!.displayName = "changed after validation";
  expect(parsed.state.runs[0].session!.displayName).toBe("Research Plan");
});
