import { describe, it, expect } from "vitest";
import { stampNewCompletions } from "./completions";

const T1 = new Date("2026-03-04T10:00:00.000Z");
const NOW = new Date("2026-08-20T14:30:00.000Z");

describe("stampNewCompletions", () => {
  it("dates a page that was just completed", () => {
    const result = stampNewCompletions([], ["lesson-1"], ["lesson-1"], NOW);
    expect(result).toEqual([{ pageId: "lesson-1", completedAt: NOW }]);
  });

  it("leaves a lesson completed before dates existed undated", () => {
    // THE ONE THAT MATTERS. On the first save after this ships, a rep's whole
    // back catalogue arrives in completedPages with no stored dates. Dating it
    // "now" would report every lesson they ever finished as finished today,
    // and a period-based board built on that would be pure fiction. We do not
    // know when those happened, so we record nothing and say so.
    const result = stampNewCompletions([], ["old-1", "old-2", "lesson-3"], ["lesson-3"], NOW);
    expect(result).toEqual([{ pageId: "lesson-3", completedAt: NOW }]);
  });

  it("keeps the original date when a page is saved again", () => {
    // The learner re-opens a lesson they already finished. Their achievement
    // dates from March, not from today, so a repeat save must never move it.
    const existing = [{ pageId: "lesson-1", completedAt: T1 }];
    const result = stampNewCompletions(existing, ["lesson-1"], [], NOW);
    expect(result).toEqual([{ pageId: "lesson-1", completedAt: T1 }]);
  });

  it("never restamps a page even when it is reported as newly completed", () => {
    // A duplicate or replayed request must not move an existing achievement.
    const existing = [{ pageId: "lesson-1", completedAt: T1 }];
    const result = stampNewCompletions(existing, ["lesson-1"], ["lesson-1"], NOW);
    expect(result).toEqual([{ pageId: "lesson-1", completedAt: T1 }]);
  });

  it("dates only the new page when an old one is present too", () => {
    const existing = [{ pageId: "lesson-1", completedAt: T1 }];
    const result = stampNewCompletions(existing, ["lesson-1", "lesson-2"], ["lesson-2"], NOW);
    expect(result).toEqual([
      { pageId: "lesson-1", completedAt: T1 },
      { pageId: "lesson-2", completedAt: NOW },
    ]);
  });

  it("ignores a newly-completed id that is not actually completed", () => {
    // Defensive: the two inputs come from the same handler, but an id that is
    // not in completedPages must never gain a date of its own. lesson-1 is
    // completed yet undated, so it is simply left out.
    const result = stampNewCompletions([], ["lesson-1"], ["lesson-9"], NOW);
    expect(result).toEqual([]);
  });

  it("drops a page that is no longer completed", () => {
    // The admin Override tool sends an exact set and can uncheck a page to
    // reset a rep (pages/api/progress.ts `replace: true`), and lesson cleanup
    // pulls a moved page. If the dates outlived completedPages they would
    // disagree, and a period-based board would count a lesson the rep no
    // longer has credit for.
    const existing = [
      { pageId: "lesson-1", completedAt: T1 },
      { pageId: "lesson-2", completedAt: NOW },
    ];
    const result = stampNewCompletions(existing, ["lesson-1"], [], NOW);
    expect(result).toEqual([{ pageId: "lesson-1", completedAt: T1 }]);
  });

  it("collapses a repeated page id into one entry", () => {
    const result = stampNewCompletions([], ["lesson-1", "lesson-1"], ["lesson-1"], NOW);
    expect(result).toEqual([{ pageId: "lesson-1", completedAt: NOW }]);
  });

  it("keeps the first stored date when the same page was stored twice", () => {
    // Defensive: a duplicate could only arrive from a bad historical write.
    // The EARLIER date is the honest one, so the later duplicate is discarded
    // rather than allowed to win by being last.
    const later = new Date("2026-07-01T00:00:00.000Z");
    const existing = [
      { pageId: "lesson-1", completedAt: T1 },
      { pageId: "lesson-1", completedAt: later },
    ];
    const result = stampNewCompletions(existing, ["lesson-1"], [], NOW);
    expect(result).toEqual([{ pageId: "lesson-1", completedAt: T1 }]);
  });

  it("returns an empty list when nothing is completed", () => {
    const existing = [{ pageId: "lesson-1", completedAt: T1 }];
    expect(stampNewCompletions(existing, [], [], NOW)).toEqual([]);
  });

  it("does not mutate the array it was given", () => {
    const existing = [{ pageId: "lesson-1", completedAt: T1 }];
    stampNewCompletions(existing, ["lesson-1", "lesson-2"], ["lesson-2"], NOW);
    expect(existing).toEqual([{ pageId: "lesson-1", completedAt: T1 }]);
  });

  it("preserves an entry whose stored date is unusable instead of inventing one", () => {
    // Never rewrite history we cannot verify: an undated entry stays undated
    // so a reader can exclude it, rather than being silently backdated to now
    // and counted as a completion that happened today.
    const existing = [{ pageId: "lesson-1", completedAt: null as unknown as Date }];
    const result = stampNewCompletions(existing, ["lesson-1"], ["lesson-1"], NOW);
    expect(result).toEqual([{ pageId: "lesson-1", completedAt: null }]);
  });

  it("survives a missing stored list", () => {
    const result = stampNewCompletions(undefined, ["lesson-1"], ["lesson-1"], NOW);
    expect(result).toEqual([{ pageId: "lesson-1", completedAt: NOW }]);
  });
});
