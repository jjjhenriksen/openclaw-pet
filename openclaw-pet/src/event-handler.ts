import { formatSessionContext, formatSessionLog, getCronRunJobId, getSessionContext, type SessionContext } from "./run-context.js";

export type PetAgentEvent = {
  runId: string;
  stream: string;
  data: Record<string, unknown>;
  sessionKey?: string;
  sessionId?: string;
  agentId?: string;
};

type PetEventSink = {
  modelStarted: (activityLabel?: string) => void;
  progress: (label: string) => void;
  toolStarted: (toolName?: string, activityLabel?: string) => void;
  toolFinished: (failed: boolean, activityLabel?: string) => void;
  agentEnded: (failed: boolean, activityLabel?: string) => void;
};

type PetEventLogger = {
  info?: (message: string) => void;
  warn: (message: string) => void;
};

type CronJobNameResolver = (jobId: string) => Promise<string | undefined>;

function safeToolName(data: Record<string, unknown>): string | undefined {
  const value = data.toolName ?? data.name;
  return typeof value === "string" && /^[a-zA-Z0-9_:-]{1,48}$/.test(value) ? value : undefined;
}

function contextLabel(context: SessionContext | undefined, label: string): string {
  return context ? `${formatSessionContext(context)} · ${label}` : label;
}

/** Creates the privacy-preserving event reducer used by the plugin entrypoint. */
export function createPetEventHandler(params: {
  pet: PetEventSink;
  logger: PetEventLogger;
  resolveCronJobName?: CronJobNameResolver;
}): (event: PetAgentEvent) => Promise<void> {
  const contexts = new Map<string, SessionContext>();
  const eventQueues = new Map<string, Promise<void>>();

  const applyEvent = (event: PetAgentEvent, discovered: SessionContext | undefined): void => {
    const context = discovered ?? contexts.get(event.runId);
    const phase = String(event.data.phase ?? event.data.status ?? event.data.type ?? "").toLowerCase();

    if (event.stream === "lifecycle" && phase === "start" && context) {
      params.logger.info?.(formatSessionLog(context, "started"));
    }
    if (event.stream === "assistant") {
      params.pet.progress(contextLabel(context, "Agent is replying"));
    } else if (event.stream === "acp" || event.stream === "item" || event.stream === "command_output" || event.stream === "patch") {
      params.pet.progress(contextLabel(context, "Working"));
    } else if (event.stream === "tool") {
      if (phase.includes("fail") || phase.includes("error")) {
        params.pet.toolFinished(true, contextLabel(context, "Tool failed"));
      } else if (phase.includes("end") || phase.includes("result") || phase.includes("complete")) {
        params.pet.toolFinished(false, contextLabel(context, "Tool complete"));
      } else {
        const toolName = safeToolName(event.data);
        params.pet.toolStarted(toolName, contextLabel(context, toolName ? `Running ${toolName}` : "Running tool"));
      }
    } else if (phase === "finishing") {
      params.pet.progress(contextLabel(context, "Finishing up"));
    } else if (phase.includes("error") || phase.includes("fail") || event.data.aborted === true) {
      params.pet.agentEnded(true, contextLabel(context, "Task failed"));
      if (context) params.logger.warn(formatSessionLog(context, "failed"));
    } else if (phase.includes("end") || phase.includes("complete") || phase.includes("finish")) {
      params.pet.agentEnded(false, contextLabel(context, "Task complete"));
      if (context) params.logger.info?.(formatSessionLog(context, "completed"));
    } else {
      params.pet.modelStarted(contextLabel(context, "Thinking"));
    }

    if (event.stream === "lifecycle" && (phase.includes("end") || phase.includes("error") || phase.includes("fail"))) {
      contexts.delete(event.runId);
    }
  };

  const processEvent = (event: PetAgentEvent): void | Promise<void> => {
    let discovered = getSessionContext(event);
    const jobId = getCronRunJobId(event.sessionKey);
    if (discovered && jobId && params.resolveCronJobName) {
      return params.resolveCronJobName(jobId).then((jobName) => {
        if (jobName) discovered = { ...discovered!, label: jobName };
        if (discovered) {
          contexts.delete(event.runId);
          contexts.set(event.runId, discovered);
          while (contexts.size > 256) contexts.delete(contexts.keys().next().value!);
        }
        applyEvent(event, discovered);
      });
    }
    if (discovered) {
      contexts.delete(event.runId);
      contexts.set(event.runId, discovered);
      while (contexts.size > 256) contexts.delete(contexts.keys().next().value!);
    }
    applyEvent(event, discovered);
  };

  return (event) => {
    // Gateway dispatch does not await non-terminal subscriptions, so serialize
    // each run to keep an async name lookup from reordering lifecycle phases.
    const previous = eventQueues.get(event.runId);
    if (!previous && !getSessionContext(event)) {
      processEvent(event);
      return Promise.resolve();
    }
    const prior = previous ?? Promise.resolve();
    const current = prior.then(() => processEvent(event));
    eventQueues.set(event.runId, current);
    const cleanup = () => {
      if (eventQueues.get(event.runId) === current) eventQueues.delete(event.runId);
    };
    void current.then(cleanup, cleanup);
    return current;
  };
}
