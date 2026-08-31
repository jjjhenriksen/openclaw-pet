import { describe, expect, it, vi } from "vitest";
import { createPetEventHandler } from "./event-handler.js";

describe("pet agent event visibility", () => {
  it("carries opaque cron context through status labels and lifecycle logs", () => {
    const pet = {
      modelStarted: vi.fn(), progress: vi.fn(), toolStarted: vi.fn(), toolFinished: vi.fn(), agentEnded: vi.fn(),
    };
    const logger = { info: vi.fn(), warn: vi.fn() };
    const handle = createPetEventHandler({ pet, logger });
    const base = {
      runId: "run-secret-123",
      sessionId: "session-secret-456",
      sessionKey: "agent:main:cron:job-secret-789:run:run-secret-123",
      agentId: "main",
    };

    handle({ ...base, stream: "lifecycle", data: { phase: "start" } });
    handle({ runId: base.runId, stream: "assistant", data: { delta: true } });
    handle({ ...base, stream: "lifecycle", data: { phase: "end" } });

    expect(logger.info).toHaveBeenCalledTimes(2);
    expect(logger.info.mock.calls.flat().join(" ")).toMatch(/Cron task-[0-9a-f]{10} · agent main · session-[0-9a-f]{10} · run-[0-9a-f]{10}/);
    expect(logger.info.mock.calls.flat().join(" ")).not.toContain("job-secret-789");
    expect(pet.progress).toHaveBeenCalledWith(expect.stringMatching(/^Cron task-[0-9a-f]{10} · agent main · session-[0-9a-f]{10} · run-[0-9a-f]{10} · Agent is replying$/));
    expect(pet.agentEnded).toHaveBeenCalledWith(false, expect.stringMatching(/Task complete$/));
  });

  it("does not identify interactive sessions", () => {
    const pet = {
      modelStarted: vi.fn(), progress: vi.fn(), toolStarted: vi.fn(), toolFinished: vi.fn(), agentEnded: vi.fn(),
    };
    const logger = { info: vi.fn(), warn: vi.fn() };
    const handle = createPetEventHandler({ pet, logger });
    handle({ runId: "interactive-run", sessionKey: "agent:main:discord:channel:private", stream: "lifecycle", data: { phase: "start" } });
    expect(pet.modelStarted).toHaveBeenCalledWith("Thinking");
    expect(logger.info).not.toHaveBeenCalled();
  });
});
