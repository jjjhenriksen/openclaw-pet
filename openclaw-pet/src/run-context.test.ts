import { describe, expect, it } from "vitest";
import { formatSessionContext, formatSessionLog, getCronRunJobId, getSessionContext } from "./run-context.js";

describe("pet cron run context", () => {
  const event = {
    agentId: "main",
    runId: "run-secret-123",
    sessionId: "session-secret-456",
    sessionKey: "agent:main:cron:job-secret-789:run:run-secret-123",
  };

  it("reduces an isolated cron session to its name and agent", () => {
    const context = { ...getSessionContext(event)!, label: "Morning Research Brief" };
    expect(context).toEqual({ kind: "cron", agentId: "main", label: "Morning Research Brief" });
    expect(formatSessionContext(context)).toBe("Cron \"Morning Research Brief\" · agent main");
    expect(formatSessionLog(context, "started")).toBe("OpenClaw Pet cron started: Cron \"Morning Research Brief\" · agent main");
    expect(formatSessionContext(context)).not.toContain("job-secret-789");
    expect(formatSessionContext(context)).not.toContain("run-secret-123");
    expect(formatSessionContext(context)).not.toContain("session-secret-456");
  });

  it("fails closed for non-cron and malformed session keys", () => {
    expect(getSessionContext({ ...event, sessionKey: "agent:main:discord:channel:private" })).toEqual({ kind: "session", agentId: "main" });
    expect(getSessionContext({ ...event, sessionKey: "agent:main:cron:job:run" })).toEqual({ kind: "session", agentId: "main" });
    expect(getSessionContext({ sessionKey: "discord:channel:private" })).toBeUndefined();
  });

  it("extracts the job id only for the isolated cron-run shape", () => {
    expect(getCronRunJobId(event.sessionKey)).toBe("job-secret-789");
    expect(getCronRunJobId("agent:main:discord:channel:private")).toBeUndefined();
  });

  it("keeps future session kinds on the same display contract", () => {
    expect(formatSessionContext({ kind: "session", agentId: "main" })).toBe("Session · agent main");
  });
});
