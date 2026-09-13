import { describe, it, expect } from "vitest";
import {
  PAGE_ID_ARRAY_FIELDS,
  PAGE_KEYED_ENTRY_FIELDS,
  normalizePageIds,
  removedPageIds,
  idsSafeToClean,
  progressCleanupPull,
} from "./progress-cleanup";
import { UserProgressModel } from "../models/UserProgress";

// Top-level array fields on UserProgress that do NOT refer to pages. Empty today.
// Adding such a field? List it here. Does it refer to pages? Then add it to
// progress-cleanup.ts instead, so deleting or moving a lesson cleans it too.
const NON_PAGE_ARRAY_FIELDS: string[] = [];

const sorted = (xs: readonly string[]) => [...xs].sort();

function classifyProgressArrays() {
  const stringArrays: string[] = [];
  const pageKeyed: string[] = [];
  const other: string[] = [];
  UserProgressModel.schema.eachPath((name: string, type: any) => {
    if (name.includes(".") || type?.instance !== "Array") return;
    if (type.schema) {
      (type.schema.path("pageId") ? pageKeyed : other).push(name);
      return;
    }
    const inner = type.caster ?? type.$embeddedSchemaType ?? type.embeddedSchemaType;
    (inner?.instance === "String" ? stringArrays : other).push(name);
  });
  return { stringArrays, pageKeyed, other };
}

describe("progress cleanup covers the UserProgress schema", () => {
  it("cleans every array of page-keyed entries", () => {
    expect(sorted(classifyProgressArrays().pageKeyed)).toEqual(sorted(PAGE_KEYED_ENTRY_FIELDS));
  });

  it("cleans every array of page ids", () => {
    expect(sorted(classifyProgressArrays().stringArrays)).toEqual(sorted(PAGE_ID_ARRAY_FIELDS));
  });

  it("has no unclassified array field", () => {
    expect(classifyProgressArrays().other.filter((n) => !NON_PAGE_ARRAY_FIELDS.includes(n))).toEqual([]);
  });
});

describe("progressCleanupPull", () => {
  it("pulls the ids from every page field", () => {
    expect(progressCleanupPull(["p1", "p2"])).toEqual({
      completedPages: { $in: ["p1", "p2"] },
      unlockedPages: { $in: ["p1", "p2"] },
      quizResults: { pageId: { $in: ["p1", "p2"] } },
      pageCompletions: { pageId: { $in: ["p1", "p2"] } },
      videoPositions: { pageId: { $in: ["p1", "p2"] } },
      quizPicks: { pageId: { $in: ["p1", "p2"] } },
    });
  });

  it("returns null when there is nothing to remove", () => {
    expect(progressCleanupPull([])).toBeNull();
    expect(progressCleanupPull(["", "   "])).toBeNull();
  });
});

describe("normalizePageIds", () => {
  it("keeps trimmed, unique, non-empty strings in order", () => {
    expect(normalizePageIds([" p1", "p2", "p1", "", 7, null, "p3 "])).toEqual(["p1", "p2", "p3"]);
  });

  it("returns an empty list for anything that is not an array", () => {
    expect(normalizePageIds("p1")).toEqual([]);
    expect(normalizePageIds(undefined)).toEqual([]);
  });
});

describe("removedPageIds", () => {
  it("lists pages that were dropped, in their original order", () => {
    const before = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
    expect(removedPageIds(before, [{ id: "a" }, { id: "c" }])).toEqual(["b", "d"]);
  });

  it("reports nothing when no page was dropped, even if pages were reordered or added", () => {
    expect(removedPageIds([{ id: "a" }, { id: "b" }], [{ id: "b" }, { id: "a" }, { id: "new" }])).toEqual([]);
  });

  it("ignores pages without an id", () => {
    expect(removedPageIds([{ id: "a" }, {}, { id: null }], [])).toEqual(["a"]);
  });
});

describe("idsSafeToClean", () => {
  it("never cleans a page that is still in the course", () => {
    expect(idsSafeToClean(["gone", "live", "gone"], ["live", "other"])).toEqual({
      clean: ["gone"],
      stillPresent: ["live"],
    });
  });

  it("cleans everything when the course no longer has any of the pages", () => {
    expect(idsSafeToClean(["x", "y"], [])).toEqual({ clean: ["x", "y"], stillPresent: [] });
  });
});
