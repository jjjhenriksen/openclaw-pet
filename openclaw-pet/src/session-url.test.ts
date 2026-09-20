import { describe, expect, it } from "vitest";
import { buildLocalSessionUrl } from "./session-url.js";

describe("buildLocalSessionUrl", () => {
  it("opens an agent main session without exposing the raw key in the renderer contract", () => {
    expect(buildLocalSessionUrl("agent:main:main", undefined, 18789)).toBe(
      "http://127.0.0.1:18789/chat/main",
    );
  });

  it("preserves qualified session segments as encoded Control UI path segments", () => {
    expect(buildLocalSessionUrl("agent:research:cron:nightly:run:abc123", undefined, 19876)).toBe(
      "http://127.0.0.1:19876/chat/research/cron/nightly/run/abc123",
    );
  });

  it("uses a safe fallback agent id for a non-agent key", () => {
    expect(buildLocalSessionUrl("dashboard", "ops", 18789)).toBe(
      "http://127.0.0.1:18789/chat/ops/dashboard",
    );
  });

  it("rejects malformed or unscoped targets", () => {
    expect(buildLocalSessionUrl("agent:bad id:main", undefined, 18789)).toBeUndefined();
    expect(buildLocalSessionUrl("", "", 18789)).toBeUndefined();
  });
});
