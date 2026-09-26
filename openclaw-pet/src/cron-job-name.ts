import { createLabelCache } from "./label-cache.js";
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
export function createCronJobNameResolver(lookup: CronJobLookup): (key: string) => Promise<string | undefined> {
  return createLabelCache(lookup, getCronJobName);
}
