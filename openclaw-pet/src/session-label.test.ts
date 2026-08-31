import { describe, expect, it, vi } from "vitest";
import { createSessionDisplayNameResolver, getSessionDisplayName, sanitizeSessionLabel } from "./session-label.js";

describe("session display names", () => {
  it("reads and bounds only the persisted display name", () => {
    expect(getSessionDisplayName({ session: { displayName: "  Release\nPlanning  ", label: "private label" } })).toBe("Release Planning");
    expect(sanitizeSessionLabel(`x${"y".repeat(100)}`)).toHaveLength(80);
    expect(getSessionDisplayName({ session: { firstUserMessage: "secret transcript content" } })).toBeUndefined();
  });

  it("caches session labels and lookup misses", async () => {
    const lookup = vi.fn().mockResolvedValueOnce({ session: { displayName: "Research" } }).mockResolvedValueOnce(undefined);
    const resolve = createSessionDisplayNameResolver(lookup);
    await expect(resolve("agent:main:discord:channel:one")).resolves.toBe("Research");
    await expect(resolve("agent:main:discord:channel:one")).resolves.toBe("Research");
    await expect(resolve("agent:main:discord:channel:two")).resolves.toBeUndefined();
    await expect(resolve("agent:main:discord:channel:two")).resolves.toBeUndefined();
    expect(lookup).toHaveBeenCalledTimes(2);
  });
});
