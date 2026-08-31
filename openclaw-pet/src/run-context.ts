export type SessionContextKind = "cron" | "session";

export type SessionContext = {
  kind: SessionContextKind;
  /** User-facing label, sanitized before it reaches display/log output. */
  label?: string;
  agentId?: string;
};

const CRON_RUN_SESSION_KEY = /^agent:([a-zA-Z0-9_-]{1,64}):cron:([^:]{1,128}):run:([^:]{1,128})(?::|$)/i;
const AGENT_SESSION_KEY = /^agent:([a-zA-Z0-9_-]{1,64}):/i;
const SAFE_AGENT_ID = /^[a-zA-Z0-9_-]{1,64}$/;

function safeAgentId(value: string | undefined): string | undefined {
  const agentId = value?.trim();
  return agentId && SAFE_AGENT_ID.test(agentId) ? agentId : undefined;
}

/**
 * Returns a display-only context for any agent session. Cron is the first
 * specialized kind; other session kinds intentionally remain generic until a
 * host-provided label can be added without exposing routing metadata.
 */
export function getSessionContext(event: {
  sessionKey?: string;
  agentId?: string;
}): SessionContext | undefined {
  const sessionKey = event.sessionKey?.trim();
  const cronMatch = sessionKey ? CRON_RUN_SESSION_KEY.exec(sessionKey) : undefined;
  const keyAgentId = sessionKey ? AGENT_SESSION_KEY.exec(sessionKey)?.[1] : undefined;
  const agentId = safeAgentId(event.agentId) ?? safeAgentId(keyAgentId);
  if (cronMatch) return { kind: "cron", ...(agentId ? { agentId } : {}) };
  if (agentId) return { kind: "session", agentId };
  return undefined;
}

export function getCronRunJobId(sessionKey?: string): string | undefined {
  const match = sessionKey?.trim() ? CRON_RUN_SESSION_KEY.exec(sessionKey.trim()) : undefined;
  return match?.[2];
}

export function formatSessionContext(context: SessionContext): string {
  const label = context.kind === "cron"
    ? context.label ? `Cron "${context.label}"` : "Cron"
    : context.label ? `Session "${context.label}"` : "Session";
  return [label, context.agentId ? `agent ${context.agentId}` : undefined].filter(Boolean).join(" · ");
}

export function formatSessionLog(context: SessionContext, status: "started" | "completed" | "failed"): string {
  return `OpenClaw Pet ${context.kind} ${status}: ${formatSessionContext(context)}`;
}
