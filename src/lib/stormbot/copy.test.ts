import { describe, it, expect } from "vitest";
import {
  pickCloser,
  formatAmount,
  courseCelebrationMessage,
  claimFiledMessage,
  contractSignedMessage,
  COURSE_CLOSERS,
  CLAIM_CLOSERS,
  CONTRACT_CLOSERS,
} from "./copy";

describe("pickCloser", () => {
  const pool = ["a", "b", "c", "d"];

  it("is deterministic: the same seed always yields the same closer", () => {
    expect(pickCloser(pool, "job-123")).toBe(pickCloser(pool, "job-123"));
  });

  it("always returns a member of the pool", () => {
    for (const seed of ["job-1", "job-2", "job-3", "job-99", "", "x"]) {
      expect(pool).toContain(pickCloser(pool, seed));
    }
  });

  it("spreads across the pool rather than always picking one entry", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) seen.add(pickCloser(pool, `job-${i}`));
    expect(seen.size).toBeGreaterThan(1);
  });
});

describe("formatAmount", () => {
  it("uses thousands separators and no cents", () => {
    expect(formatAmount(28400)).toBe("$28,400");
  });

  it("rounds cents away", () => {
    expect(formatAmount(28400.67)).toBe("$28,401");
  });

  it("handles small values without a separator", () => {
    expect(formatAmount(950)).toBe("$950");
  });
});

describe("courseCelebrationMessage", () => {
  it("keeps the established wording and appends a pooled closer", () => {
    const msg = courseCelebrationMessage("Fernando Cano", "Objections Masterclass", 4, 10, "seed");
    expect(msg).toContain(
      "🎉 Fernando Cano just passed the Objections Masterclass Course! That's 4 of 10 courses done. "
    );
    expect(COURSE_CLOSERS).toContain(msg.split("done. ")[1]);
  });

  it("trims stray whitespace in names and titles (some course titles carry trailing spaces)", () => {
    const msg = courseCelebrationMessage(" Fernando Cano ", "Knocking Your Way To Millions ", 1, 10, "seed");
    expect(msg).toContain(
      "🎉 Fernando Cano just passed the Knocking Your Way To Millions Course! That's 1 of 10 courses done. "
    );
  });

  it("never contains an em dash", () => {
    expect(courseCelebrationMessage("A", "B", 2, 10, "seed")).not.toContain("—");
  });
});

describe("claimFiledMessage", () => {
  it("renders the plural form", () => {
    const msg = claimFiledMessage("Jett Miller", 7, "job-1");
    expect(msg).toContain("📋 Jett Miller just filed a claim! That's 7 claims this month. ");
    expect(CLAIM_CLOSERS).toContain(msg.split("month. ")[1]);
  });

  it("renders the singular form on the first claim of the month", () => {
    expect(claimFiledMessage("Jett Miller", 1, "job-1")).toContain("That's 1 claim this month. ");
  });

  it("never contains an em dash", () => {
    expect(claimFiledMessage("A", 3, "job-1")).not.toContain("—");
  });
});

describe("contractSignedMessage", () => {
  it("includes the dollar amount when it is known", () => {
    const msg = contractSignedMessage("Jett Miller", 4, 28400, "job-1");
    expect(msg).toContain("💰 Jett Miller just signed a $28,400 contract! That's 4 contracts this month. ");
    expect(CONTRACT_CLOSERS).toContain(msg.split("month. ")[1]);
  });

  it("falls back to the amount-free wording when financials are not entered yet", () => {
    const msg = contractSignedMessage("Jett Miller", 4, 0, "job-1");
    expect(msg).toContain("✍️ Jett Miller just signed a contract! That's 4 contracts this month. ");
    expect(msg).not.toContain("$");
  });

  it("treats a negative amount as unknown rather than printing it", () => {
    expect(contractSignedMessage("Jett Miller", 4, -5, "job-1")).not.toContain("$");
  });

  it("renders the singular form on the first contract of the month", () => {
    expect(contractSignedMessage("Jett Miller", 1, 28400, "job-1")).toContain("That's 1 contract this month. ");
  });

  it("never contains an em dash", () => {
    expect(contractSignedMessage("A", 3, 100, "job-1")).not.toContain("—");
  });
});
