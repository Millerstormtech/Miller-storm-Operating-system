import { describe, it, expect } from "vitest";
import { resolvePresentedQuestions } from "./quiz-pick";

/** A pool of n questions, ids q1..qn. */
function pool(n: number) {
  return Array.from({ length: n }, (_, i) => ({ id: `q${i + 1}`, prompt: `Question ${i + 1}` }));
}

describe("resolvePresentedQuestions", () => {
  it("reuses a valid pin as-is, in the pinned order", () => {
    const p = pool(6);
    const pinned = ["q4", "q1", "q6"];
    const result = resolvePresentedQuestions(p, 3, pinned);
    expect(result.map((q) => q.id)).toEqual(["q4", "q1", "q6"]);
  });

  it("picks a fresh subset of the right size when there is no pin", () => {
    const p = pool(16);
    const result = resolvePresentedQuestions(p, 6, undefined);
    expect(result).toHaveLength(6);
    // Every returned question really is from the pool, no duplicates.
    const ids = result.map((q) => q.id);
    expect(new Set(ids).size).toBe(6);
    for (const id of ids) expect(p.some((q) => q.id === id)).toBe(true);
  });

  it("falls back to a fresh pick when a pinned id no longer exists in the pool (quiz was edited)", () => {
    const p = pool(6);
    const pinned = ["q1", "q2", "q99"]; // q99 was deleted from the quiz
    const result = resolvePresentedQuestions(p, 3, pinned);
    expect(result).toHaveLength(3);
    expect(result.map((q) => q.id)).not.toEqual(pinned);
  });

  it("falls back to a fresh pick when the pinned count no longer matches questionsToShow (admin changed it)", () => {
    const p = pool(16);
    const pinned = pool(10).map((q) => q.id); // an old pin sized for questionsToShow=10
    const result = resolvePresentedQuestions(p, 6, pinned); // now configured to show 6
    expect(result).toHaveLength(6);
  });

  it("keeps the full pool (order aside) when questionsToShow is unset, zero, or >= pool size", () => {
    const p = pool(5);
    expect(resolvePresentedQuestions(p, undefined, undefined)).toHaveLength(5);
    expect(resolvePresentedQuestions(p, 0, undefined)).toHaveLength(5);
    expect(resolvePresentedQuestions(p, 99, undefined)).toHaveLength(5);
  });

  it("a pin covering the full pool is honoured as-is, not treated as missing", () => {
    const p = pool(5);
    const pinned = ["q3", "q1", "q5", "q2", "q4"];
    const result = resolvePresentedQuestions(p, undefined, pinned);
    expect(result.map((q) => q.id)).toEqual(pinned);
  });
});
