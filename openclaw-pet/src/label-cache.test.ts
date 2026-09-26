import { describe, expect, it, vi } from "vitest";
import { createSessionDisplayNameResolver } from "./session-label.js";
import { createCronJobNameResolver } from "./cron-job-name.js";

describe.each([createSessionDisplayNameResolver, createCronJobNameResolver])("display label cache", (createResolver) => {
  it("retries after a temporary lookup failure", async () => {
    const lookup = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue({ displayName: "Recovered" });
    const resolve = createResolver(lookup);
    await expect(resolve("key")).resolves.toBeUndefined();
    await expect(resolve("key")).resolves.toBe("Recovered");
  });
  it("refreshes stale labels and missing labels", async () => {
    vi.useFakeTimers();
    try {
      const lookup = vi.fn().mockResolvedValueOnce(undefined).mockResolvedValueOnce({ displayName: "New name" }).mockResolvedValueOnce({ displayName: "Renamed" });
      const resolve = createResolver(lookup);
      await expect(resolve("key")).resolves.toBeUndefined();
      vi.advanceTimersByTime(30_001);
      await expect(resolve("key")).resolves.toBe("New name");
      vi.advanceTimersByTime(30_001);
      await expect(resolve("key")).resolves.toBe("Renamed");
    } finally { vi.useRealTimers(); }
  });
  it("evicts old keys instead of retaining every session forever", async () => {
    const lookup = vi.fn().mockResolvedValue({ displayName: "Name" });
    const resolve = createResolver(lookup);
    for (let i = 0; i < 257; i++) await resolve(String(i));
    await resolve("0");
    expect(lookup).toHaveBeenCalledTimes(258);
  });
});
