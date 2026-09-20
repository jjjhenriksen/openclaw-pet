const AGENT_SESSION_KEY = /^agent:([a-zA-Z0-9_-]{1,64}):(.+)$/;

function encodePathSegment(value: string): string {
  return encodeURIComponent(value).replaceAll(".", "%2E");
}

/**
 * Builds the local Control UI chat route from an internal session key.
 *
 * This stays on the trusted host side of the overlay boundary. The renderer
 * receives only the opaque run id and never receives the session key or URL.
 */
export function buildLocalSessionUrl(
  sessionKey: string,
  agentId: string | undefined,
  port: number,
): string | undefined {
  const rawKey = sessionKey.trim();
  const match = AGENT_SESSION_KEY.exec(rawKey);
  if (rawKey.toLowerCase().startsWith("agent:") && !match) return undefined;
  const resolvedAgentId = match?.[1] ?? agentId?.trim();
  const rest = match?.[2] ?? rawKey;
  if (!resolvedAgentId || !/^[a-zA-Z0-9_-]{1,64}$/.test(resolvedAgentId) || !rest) return undefined;
  const route = rest.toLowerCase() === "main"
    ? `chat/${encodePathSegment(resolvedAgentId)}`
    : `chat/${encodePathSegment(resolvedAgentId)}/${rest.split(":").map(encodePathSegment).join("/")}`;
  return `http://127.0.0.1:${port}/${route}`;
}
