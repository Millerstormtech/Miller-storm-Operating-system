import { describe, it, expect } from "vitest";
import { shouldAlertSyncFailure } from "./syncAlert";

describe("shouldAlertSyncFailure", () => {
  it("alerts only on the second consecutive failure", () => {
    expect(shouldAlertSyncFailure("failed", "failed")).toBe(true);
  });

  it("stays quiet on the first failure after a healthy run", () => {
    expect(shouldAlertSyncFailure("ok", "failed")).toBe(false);
    expect(shouldAlertSyncFailure("partial", "failed")).toBe(false);
    expect(shouldAlertSyncFailure("never", "failed")).toBe(false);
    expect(shouldAlertSyncFailure(undefined, "failed")).toBe(false);
  });

  it("never alerts when the run did not fail", () => {
    expect(shouldAlertSyncFailure("failed", "ok")).toBe(false);
    expect(shouldAlertSyncFailure("failed", "partial")).toBe(false);
  });
});
