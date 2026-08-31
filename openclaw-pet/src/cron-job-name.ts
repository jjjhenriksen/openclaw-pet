import { sanitizeSessionLabel } from "./session-label.js";

export type CronJobLookup = (jobId: string) => Promise<unknown>;

/** Extracts only the user-facing cron label from a public cron.get response. */
export function getCronJobName(response: unknown): string | undefined {
  if (!response || typeof response !== "object") return undefined;
  const job = response as { displayName?: unknown; name?: unknown };
  return sanitizeSessionLabel(job.displayName) ?? sanitizeSessionLabel(job.name);
}

/**
 * Resolves configured cron labels through the host's read-only Gateway API.
 * Results, including misses, are cached so streaming events do not poll the
 * Gateway and concurrent first events share one request.
 */
export function createCronJobNameResolver(lookup: CronJobLookup): (jobId: string) => Promise<string | undefined> {
  const names = new Map<string, string | undefined>();
  const pending = new Map<string, Promise<string | undefined>>();

  return async (jobId) => {
    if (names.has(jobId)) return names.get(jobId);
    const existing = pending.get(jobId);
    if (existing) return existing;

    const request = lookup(jobId)
      .then(getCronJobName)
      .catch(() => undefined)
      .then((name) => {
        names.set(jobId, name);
        pending.delete(jobId);
        return name;
      });
    pending.set(jobId, request);
    return request;
  };
}
