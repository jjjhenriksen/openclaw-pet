import { formatCronRunContext, formatCronRunLog, getCronRunContext, type CronRunContext } from "./run-context.js";

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

function safeToolName(data: Record<string, unknown>): string | undefined {
  const value = data.toolName ?? data.name;
  return typeof value === "string" && /^[a-zA-Z0-9_:-]{1,48}$/.test(value) ? value : undefined;
}

function contextLabel(context: CronRunContext | undefined, label: string): string {
  return context ? `${formatCronRunContext(context)} · ${label}` : label;
}

/** Creates the privacy-preserving event reducer used by the plugin entrypoint. */
export function createPetEventHandler(params: { pet: PetEventSink; logger: PetEventLogger }): (event: PetAgentEvent) => void {
  const contexts = new Map<string, CronRunContext>();

  return (event) => {
    const discovered = getCronRunContext(event);
    if (discovered) {
      contexts.delete(event.runId);
      contexts.set(event.runId, discovered);
      while (contexts.size > 256) contexts.delete(contexts.keys().next().value!);
    }
    const context = discovered ?? contexts.get(event.runId);
    const phase = String(event.data.phase ?? event.data.status ?? event.data.type ?? "").toLowerCase();

    if (event.stream === "lifecycle" && phase === "start" && context) {
      params.logger.info?.(formatCronRunLog(context, "started"));
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
      if (context) params.logger.warn(formatCronRunLog(context, "failed"));
    } else if (phase.includes("end") || phase.includes("complete") || phase.includes("finish")) {
      params.pet.agentEnded(false, contextLabel(context, "Task complete"));
      if (context) params.logger.info?.(formatCronRunLog(context, "completed"));
    } else {
      params.pet.modelStarted(contextLabel(context, "Thinking"));
    }

    if (event.stream === "lifecycle" && (phase.includes("end") || phase.includes("error") || phase.includes("fail"))) {
      contexts.delete(event.runId);
    }
  };
}
