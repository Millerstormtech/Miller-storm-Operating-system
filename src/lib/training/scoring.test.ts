import { describe, it, expect } from "vitest";
import { publishedItems, type CourseLike } from "./scoring";

const course: CourseLike = {
  id: "c1",
  folders: [
    { id: "f-pub", status: "published" },
    { id: "f-draft", status: "draft" },
  ],
  pages: [
    { id: "v1", status: "published", isQuiz: false },
    { id: "v2", status: "published", isQuiz: false, folderId: "f-pub" },
    { id: "v3", status: "draft", isQuiz: false },
    { id: "v4", status: "published", isQuiz: false, folderId: "f-draft" },
    { id: "q1", status: "published", isQuiz: true },
    { id: "qf", status: "published", isQuiz: true, isFinalTest: true },
  ],
};

describe("publishedItems", () => {
  it("keeps published pages that are unfoldered or in a published folder", () => {
    expect(publishedItems(course).videoIds).toEqual(["v1", "v2"]);
  });

  it("excludes draft pages and pages in draft folders", () => {
    const ids = publishedItems(course).videoIds;
    expect(ids).not.toContain("v3");
    expect(ids).not.toContain("v4");
  });

  it("separates quizzes from videos", () => {
    expect(publishedItems(course).quizIds).toEqual(["q1", "qf"]);
  });

  it("identifies the final test by its isFinalTest flag", () => {
    expect(publishedItems(course).finalTestId).toBe("qf");
  });

  it("returns null finalTestId when no page is flagged", () => {
    const noFinal: CourseLike = { id: "c2", pages: [{ id: "q9", status: "published", isQuiz: true }] };
    expect(publishedItems(noFinal).finalTestId).toBeNull();
  });

  it("handles a course with no pages or folders", () => {
    expect(publishedItems({ id: "empty" })).toEqual({ videoIds: [], quizIds: [], finalTestId: null });
  });
});
