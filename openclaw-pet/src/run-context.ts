import { createHash } from "node:crypto";

export type CronRunContext = {
  kind: "cron";
  taskId: string;
  sessionId: string;
  runId: string;
  agentId?: string;
};

const CRON_RUN_SESSION_KEY = /^agent:([a-zA-Z0-9_-]{1,64}):cron:([^:]{1,128}):run:([^:]{1,128})(?::|$)/i;
const SAFE_AGENT_ID = /^[a-zA-Z0-9_-]{1,64}$/;

function opaqueId(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex").slice(0, 10);
}

/**
 * Returns display-only identifiers for an isolated cron run.
 *
 * The raw session key is intentionally accepted only for the exact OpenClaw
 * cron-run shape. Job, session, and run values are hashed before they leave
 * this module; channel, recipient, prompt, and tool data are never included.
 */
export function getCronRunContext(event: {
  runId?: string;
  sessionKey?: string;
  sessionId?: string;
  agentId?: string;
}): CronRunContext | undefined {
  const sessionKey = event.sessionKey?.trim();
  const match = sessionKey ? CRON_RUN_SESSION_KEY.exec(sessionKey) : undefined;
  const jobId = match?.[2];
  const sourceSession = event.sessionId?.trim() || sessionKey;
  if (!match || !jobId || !sourceSession || !event.runId?.trim()) return undefined;

  const agentId = event.agentId?.trim();
  return {
    kind: "cron",
    taskId: `task-${opaqueId(jobId)}`,
    sessionId: `session-${opaqueId(sourceSession)}`,
    runId: `run-${opaqueId(event.runId.trim())}`,
    ...(agentId && SAFE_AGENT_ID.test(agentId) ? { agentId } : {}),
  };
}

export function formatCronRunContext(context: CronRunContext): string {
  return [
    `Cron ${context.taskId}`,
    context.agentId ? `agent ${context.agentId}` : undefined,
    context.sessionId,
    context.runId,
  ].filter(Boolean).join(" · ");
}

export function formatCronRunLog(context: CronRunContext, status: "started" | "completed" | "failed"): string {
  return `OpenClaw Pet cron ${status}: ${formatCronRunContext(context)}`;
}
