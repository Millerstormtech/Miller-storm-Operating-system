import { describe, it, expect } from "vitest";
import {
  formatMinutes,
  formatLessonLength,
  courseMinutes,
  minutesLeft,
  courseLengthLabel,
  timeLeftLabel,
} from "./lesson-length";

const pages = [
  { id: "l1", status: "published", durationSeconds: 250 },
  { id: "q1", status: "published", isQuiz: true },
  { id: "l2", status: "published", durationSeconds: 3600 },
  { id: "l3", status: "published" }, // text lesson, no length
  { id: "l4", status: "draft", durationSeconds: 900 },
  { id: "l5", status: "published", folderId: "f-draft", durationSeconds: 600 },
];
const folders = [{ id: "f-draft", status: "draft" }, { id: "f-live", status: "published" }];

describe("formatMinutes", () => {
  it("reads minutes, hours, and hours with minutes", () => {
    expect(formatMinutes(45)).toBe("45 min");
    expect(formatMinutes(60)).toBe("1 hr");
    expect(formatMinutes(65)).toBe("1 hr 5 min");
    expect(formatMinutes(273)).toBe("4 hr 33 min");
  });

  it("never shows zero", () => {
    expect(formatMinutes(0.2)).toBe("1 min");
  });
});

describe("formatLessonLength", () => {
  it("rounds to the nearest minute", () => {
    expect(formatLessonLength(250)).toBe("4 min");
    expect(formatLessonLength(270)).toBe("5 min");
    expect(formatLessonLength(30)).toBe("1 min");
  });

  it("is null when the length is unknown", () => {
    expect(formatLessonLength(undefined)).toBeNull();
    expect(formatLessonLength(null)).toBeNull();
    expect(formatLessonLength(0)).toBeNull();
    expect(formatLessonLength(Number.NaN)).toBeNull();
  });
});

describe("courseMinutes", () => {
  it("adds up visible video lessons only", () => {
    // l1 + l2; the quiz, the draft lesson and the lesson in a draft section are left out
    expect(courseMinutes(pages, ["f-draft"])).toBeCloseTo((250 + 3600) / 60);
  });

  it("is null when no lesson has a length", () => {
    expect(courseMinutes([{ id: "x", status: "published" }])).toBeNull();
  });
});

describe("minutesLeft", () => {
  it("counts only what the rep has not watched", () => {
    expect(minutesLeft(pages, ["l2"], ["f-draft"])).toBeCloseTo(250 / 60);
  });

  it("is null once everything with a length is watched", () => {
    expect(minutesLeft(pages, ["l1", "l2"], ["f-draft"])).toBeNull();
  });
});

describe("courseLengthLabel", () => {
  it("labels a course card, skipping draft sections", () => {
    expect(courseLengthLabel(pages, folders)).toBe("1 hr 4 min");
  });

  it("is null without lengths", () => {
    expect(courseLengthLabel([{ id: "x", status: "published" }], [])).toBeNull();
  });
});

describe("timeLeftLabel", () => {
  it("says how much is left while there is video to watch", () => {
    expect(timeLeftLabel(pages, ["l1"], folders)).toBe("1 hr left");
  });

  it("falls back to the course length once everything is watched", () => {
    expect(timeLeftLabel(pages, ["l1", "l2"], folders)).toBe("1 hr 4 min");
  });

  it("is null when the course has no lengths", () => {
    expect(timeLeftLabel([{ id: "x", status: "published" }], [], [])).toBeNull();
  });
});
