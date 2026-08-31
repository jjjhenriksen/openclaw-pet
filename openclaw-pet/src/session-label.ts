const MAX_SESSION_LABEL_LENGTH = 80;

export type SessionLabelLookup = (sessionKey: string) => Promise<unknown>;

/** Sanitizes a configured label without reading transcript or routing content. */
export function sanitizeSessionLabel(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.replace(/\s+/g, " ").replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return normalized ? normalized.slice(0, MAX_SESSION_LABEL_LENGTH) : undefined;
}

/** Extracts only the persisted operator-facing session display name. */
export function getSessionDisplayName(entry: unknown): string | undefined {
  if (!entry || typeof entry !== "object") return undefined;
  const session = "session" in entry ? (entry as { session?: unknown }).session : entry;
  if (!session || typeof session !== "object") return undefined;
  return sanitizeSessionLabel((session as { displayName?: unknown }).displayName);
}

/** Caches read-only session display-name lookups, including missing entries. */
export function createSessionDisplayNameResolver(lookup: SessionLabelLookup): (sessionKey: string) => Promise<string | undefined> {
  const labels = new Map<string, string | undefined>();
  const pending = new Map<string, Promise<string | undefined>>();
  return async (sessionKey) => {
    if (labels.has(sessionKey)) return labels.get(sessionKey);
    const existing = pending.get(sessionKey);
    if (existing) return existing;
    const request = lookup(sessionKey)
      .then(getSessionDisplayName)
      .catch(() => undefined)
      .then((label) => {
        labels.set(sessionKey, label);
        pending.delete(sessionKey);
        return label;
      });
    pending.set(sessionKey, request);
    return request;
  };
}
