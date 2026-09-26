import { createLabelCache } from "./label-cache.js";
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
export function createSessionDisplayNameResolver(lookup: SessionLabelLookup): (key: string) => Promise<string | undefined> {
  return createLabelCache(lookup, getSessionDisplayName);
}
