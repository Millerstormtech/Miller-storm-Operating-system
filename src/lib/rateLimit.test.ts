import { describe, it, expect, beforeEach } from "vitest";
import { rateLimit, _resetRateLimits } from "./rateLimit";

describe("rateLimit", () => {
  beforeEach(() => _resetRateLimits());

  it("allows up to max hits inside the window, then blocks", () => {
    for (let i = 0; i < 3; i++) expect(rateLimit("k", 3, 60_000).ok).toBe(true);
    const blocked = rateLimit("k", 3, 60_000);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.retryAfterSec).toBeGreaterThan(0);
  });

  it("keeps keys independent", () => {
    for (let i = 0; i < 3; i++) rateLimit("a", 3, 60_000);
    expect(rateLimit("a", 3, 60_000).ok).toBe(false);
    expect(rateLimit("b", 3, 60_000).ok).toBe(true);
  });

  it("frees the bucket once the window has passed", () => {
    for (let i = 0; i < 2; i++) rateLimit("w", 2, 1);
    // A 1ms window has certainly elapsed by the time the next call runs.
    const later = Date.now() + 5;
    while (Date.now() < later) { /* spin */ }
    expect(rateLimit("w", 2, 1).ok).toBe(true);
  });
});
