import { describe, expect, it } from "vitest";
import { formatCronRunContext, formatCronRunLog, getCronRunContext } from "./run-context.js";

describe("pet cron run context", () => {
  const event = {
    agentId: "main",
    runId: "run-secret-123",
    sessionId: "session-secret-456",
    sessionKey: "agent:main:cron:job-secret-789:run:run-secret-123",
  };

  it("turns an isolated cron session into bounded opaque identifiers", () => {
    const context = getCronRunContext(event);
    expect(context).toMatchObject({ kind: "cron", agentId: "main" });
    expect(context?.taskId).toMatch(/^task-[0-9a-f]{10}$/);
    expect(context?.sessionId).toMatch(/^session-[0-9a-f]{10}$/);
    expect(context?.runId).toMatch(/^run-[0-9a-f]{10}$/);
    const output = `${formatCronRunContext(context!)} ${formatCronRunLog(context!, "started")}`;
    expect(output).not.toContain("job-secret-789");
    expect(output).not.toContain("run-secret-123");
    expect(output).not.toContain("session-secret-456");
  });

  it("fails closed for non-cron and malformed session keys", () => {
    expect(getCronRunContext({ ...event, sessionKey: "agent:main:discord:channel:private" })).toBeUndefined();
    expect(getCronRunContext({ ...event, sessionKey: "agent:main:cron:job:run" })).toBeUndefined();
    expect(getCronRunContext({ ...event, runId: "" })).toBeUndefined();
  });
});
