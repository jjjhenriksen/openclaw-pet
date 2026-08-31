import { describe, expect, it, vi } from "vitest";
import { createCronJobNameResolver, getCronJobName } from "./cron-job-name.js";

describe("cron job display names", () => {
  it("prefers the host-provided display name and bounds it", () => {
    expect(getCronJobName({ displayName: "  Morning\nResearch  ", name: "internal-name" })).toBe("Morning Research");
    expect(getCronJobName({ name: `x${"y".repeat(100)}` })).toHaveLength(80);
  });

  it("does not expose non-string job metadata", () => {
    expect(getCronJobName({ displayName: { secret: true }, name: null })).toBeUndefined();
    expect(getCronJobName({ displayName: "\u0000\u0001" })).toBeUndefined();
  });

  it("caches successful, missing, and concurrent lookups", async () => {
    const lookup = vi.fn()
      .mockResolvedValueOnce({ displayName: "Daily Digest" })
      .mockResolvedValueOnce({ name: "No longer present" });
    const resolve = createCronJobNameResolver(lookup);

    await expect(Promise.all([resolve("job-1"), resolve("job-1")])).resolves.toEqual(["Daily Digest", "Daily Digest"]);
    await expect(resolve("job-1")).resolves.toBe("Daily Digest");
    await expect(resolve("job-2")).resolves.toBe("No longer present");
    await expect(resolve("job-2")).resolves.toBe("No longer present");
    expect(lookup).toHaveBeenCalledTimes(2);
    expect(lookup).toHaveBeenNthCalledWith(1, "job-1");
  });

  it("falls back when the host lookup fails", async () => {
    const resolve = createCronJobNameResolver(vi.fn().mockRejectedValue(new Error("unavailable")));
    await expect(resolve("job-1")).resolves.toBeUndefined();
  });
});
