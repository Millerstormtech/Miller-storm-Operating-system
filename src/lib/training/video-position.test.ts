import { describe, it, expect } from "vitest";
import {
  mergeVideoPosition,
  findVideoPosition,
  resumeSecondsFor,
  shouldPersistPosition,
  END_TOLERANCE_SECONDS,
  type VideoPosition,
  advanceWatchedPoint,
  watchedToEnd,
} from "./video-position";

describe("mergeVideoPosition", () => {
  it("records a position for a video with no history", () => {
    expect(mergeVideoPosition([], "lesson-1", 0, 90)).toEqual([
      { pageId: "lesson-1", videoIndex: 0, seconds: 90 },
    ]);
  });

  it("moves the furthest point forward as the rep watches on", () => {
    const stored: VideoPosition[] = [{ pageId: "lesson-1", videoIndex: 0, seconds: 90 }];
    expect(mergeVideoPosition(stored, "lesson-1", 0, 900)).toEqual([
      { pageId: "lesson-1", videoIndex: 0, seconds: 900 },
    ]);
  });

  it("never moves the furthest point backward when the rep rewatches from the start", () => {
    const stored: VideoPosition[] = [{ pageId: "lesson-1", videoIndex: 0, seconds: 900 }];
    expect(mergeVideoPosition(stored, "lesson-1", 0, 12)).toEqual([
      { pageId: "lesson-1", videoIndex: 0, seconds: 900 },
    ]);
  });

  it("tracks each video in a multi-video lesson separately", () => {
    const stored: VideoPosition[] = [{ pageId: "lesson-1", videoIndex: 0, seconds: 900 }];
    expect(mergeVideoPosition(stored, "lesson-1", 1, 30)).toEqual([
      { pageId: "lesson-1", videoIndex: 0, seconds: 900 },
      { pageId: "lesson-1", videoIndex: 1, seconds: 30 },
    ]);
  });

  it("leaves other lessons untouched", () => {
    const stored: VideoPosition[] = [{ pageId: "lesson-1", videoIndex: 0, seconds: 900 }];
    expect(mergeVideoPosition(stored, "lesson-2", 0, 45)).toEqual([
      { pageId: "lesson-1", videoIndex: 0, seconds: 900 },
      { pageId: "lesson-2", videoIndex: 0, seconds: 45 },
    ]);
  });

  it("ignores a negative or non-finite seconds value rather than storing it", () => {
    const stored: VideoPosition[] = [{ pageId: "lesson-1", videoIndex: 0, seconds: 900 }];
    expect(mergeVideoPosition(stored, "lesson-1", 0, -5)).toEqual(stored);
    expect(mergeVideoPosition(stored, "lesson-1", 0, Number.NaN)).toEqual(stored);
    expect(mergeVideoPosition(stored, "lesson-1", 0, Number.POSITIVE_INFINITY)).toEqual(stored);
  });

  it("ignores an unusable pageId or videoIndex", () => {
    const stored: VideoPosition[] = [{ pageId: "lesson-1", videoIndex: 0, seconds: 900 }];
    expect(mergeVideoPosition(stored, "", 0, 45)).toEqual(stored);
    expect(mergeVideoPosition(stored, "lesson-1", -1, 45)).toEqual(stored);
    expect(mergeVideoPosition(stored, "lesson-1", 1.5, 45)).toEqual(stored);
  });

  it("collapses duplicate stored entries, keeping the furthest point", () => {
    const stored: VideoPosition[] = [
      { pageId: "lesson-1", videoIndex: 0, seconds: 900 },
      { pageId: "lesson-1", videoIndex: 0, seconds: 120 },
    ];
    expect(mergeVideoPosition(stored, "lesson-1", 0, 5)).toEqual([
      { pageId: "lesson-1", videoIndex: 0, seconds: 900 },
    ]);
  });

  it("does not mutate the array it was given", () => {
    const stored: VideoPosition[] = [{ pageId: "lesson-1", videoIndex: 0, seconds: 90 }];
    mergeVideoPosition(stored, "lesson-1", 0, 900);
    expect(stored).toEqual([{ pageId: "lesson-1", videoIndex: 0, seconds: 90 }]);
  });

  it("treats a missing stored list as empty", () => {
    expect(mergeVideoPosition(undefined, "lesson-1", 0, 90)).toEqual([
      { pageId: "lesson-1", videoIndex: 0, seconds: 90 },
    ]);
  });
});

describe("findVideoPosition", () => {
  it("returns 0 when the rep has never watched this video", () => {
    expect(findVideoPosition([], "lesson-1", 0)).toBe(0);
    expect(findVideoPosition(undefined, "lesson-1", 0)).toBe(0);
  });

  it("returns the stored furthest point", () => {
    const stored: VideoPosition[] = [{ pageId: "lesson-1", videoIndex: 0, seconds: 900 }];
    expect(findVideoPosition(stored, "lesson-1", 0)).toBe(900);
  });

  it("does not return one video's position for another", () => {
    const stored: VideoPosition[] = [{ pageId: "lesson-1", videoIndex: 0, seconds: 900 }];
    expect(findVideoPosition(stored, "lesson-1", 1)).toBe(0);
    expect(findVideoPosition(stored, "lesson-2", 0)).toBe(0);
  });
});

describe("resumeSecondsFor", () => {
  it("drops the playhead at the furthest point watched", () => {
    expect(resumeSecondsFor(900, 1800)).toBe(900);
  });

  it("starts a finished video over from the beginning", () => {
    // The rep watched to the end, so the stored point sits at the duration.
    // Resuming there would open the lesson on the closing frame.
    expect(resumeSecondsFor(1800, 1800)).toBe(0);
    expect(resumeSecondsFor(1800 - END_TOLERANCE_SECONDS, 1800)).toBe(0);
  });

  it("starts from the beginning when nothing was watched", () => {
    expect(resumeSecondsFor(0, 1800)).toBe(0);
    expect(resumeSecondsFor(-10, 1800)).toBe(0);
  });

  it("still resumes when the duration is not known yet", () => {
    expect(resumeSecondsFor(900, 0)).toBe(900);
    expect(resumeSecondsFor(900, Number.NaN)).toBe(900);
  });
});

describe("shouldPersistPosition", () => {
  it("waits for the save interval to elapse", () => {
    expect(shouldPersistPosition(100, 105, 10)).toBe(false);
    expect(shouldPersistPosition(100, 110, 10)).toBe(true);
  });

  it("saves the first position once the interval is reached", () => {
    expect(shouldPersistPosition(0, 4, 10)).toBe(false);
    expect(shouldPersistPosition(0, 10, 10)).toBe(true);
  });

  it("does not save while the rep is scrubbing backwards", () => {
    expect(shouldPersistPosition(900, 12, 10)).toBe(false);
  });
});

describe("advanceWatchedPoint", () => {
  it("follows the furthest position for a seek-locked viewer", () => {
    expect(advanceWatchedPoint(10, 300, false)).toBe(300);
  });

  it("moves with playback for a playback-only viewer", () => {
    let w = 0;
    for (let t = 0.25; t <= 20; t += 0.25) w = advanceWatchedPoint(w, t, true);
    expect(w).toBe(20);
  });

  it("ignores a jump ahead for a playback-only viewer", () => {
    expect(advanceWatchedPoint(100, 600, true)).toBe(100);
    // Playing on from the jumped-to spot still does not move it.
    expect(advanceWatchedPoint(100, 601, true)).toBe(100);
  });

  it("resumes advancing once they play on from the watched point", () => {
    let w = advanceWatchedPoint(100, 600, true); // jump: stays 100
    w = advanceWatchedPoint(w, 90, true); // went back: stays 100
    w = advanceWatchedPoint(w, 101.5, true); // played through it
    expect(w).toBe(101.5);
  });

  it("never moves backwards and ignores unusable times", () => {
    expect(advanceWatchedPoint(50, 10, true)).toBe(50);
    expect(advanceWatchedPoint(50, NaN, false)).toBe(50);
    expect(advanceWatchedPoint(50, -1, false)).toBe(50);
  });
});

describe("watchedToEnd", () => {
  it("is true inside the end window", () => {
    expect(watchedToEnd(297, 300)).toBe(true);
    expect(watchedToEnd(296.9, 300)).toBe(false);
  });

  it("is false with no usable duration", () => {
    expect(watchedToEnd(100, 0)).toBe(false);
    expect(watchedToEnd(100, NaN)).toBe(false);
  });
});
