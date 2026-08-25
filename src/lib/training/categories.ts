// Predefined Training Center course categories, offered as ready picks in the
// Course Builder category dropdown. Admins can also add custom categories — any
// distinct `category` value used across courses becomes a Training Center
// section, grouped like Tools & Products. Courses with no category fall into an
// "Other Courses" bucket rendered last.
//
// These MUST stay in step with the `category` values in credentials.ts: a course
// is joined to its credential by this exact string, so a pick that no credential
// recognises silently zeroes a bar on the Course Leaderboard, with no error
// anywhere. credentials.test.ts asserts the two lists agree.
import { canonicalCategory } from "./credentials";

export const TRAINING_CATEGORIES = [
  // Must match CREDENTIALS[].category in credentials.ts exactly, not the
  // credential's printed label: this is the stored join key. Renamed to
  // "Certification" on 2026-08-24 in the Course Builder; the code caught up
  // 2026-08-25.
  "Miller Storm Certification",
  "Millionaire Knockers",
  "Roof Hustlers",
];

// Training Center section order: these categories render first, in this exact
// order, ahead of everything else. Pinned entries that aren't credential
// categories (e.g. a custom "Miller Storm Certification") can lead here without
// touching TRAINING_CATEGORIES / credentials.ts. A pinned category no course
// uses is simply skipped (empty sections are omitted below).
export const CATEGORY_DISPLAY_ORDER = [
  "Miller Storm Certification",
  ...TRAINING_CATEGORIES,
];

export const UNCATEGORIZED_LABEL = "Other Courses";

// Group items (each carrying an optional `category`) for display. Predefined
// categories come first in their listed order, then any custom categories
// (alphabetical), then the uncategorized bucket last. Empty sections omitted.
export function groupCoursesByCategory<T extends { category?: string }>(
  items: T[]
): { category: string; courses: T[] }[] {
  const byCategory = new Map<string, T[]>();
  for (const item of items) {
    // Canonical, so a library mid-rename shows ONE section under the current
    // name instead of splitting into an old and a new heading.
    const key = canonicalCategory(item.category);
    const bucket = key || UNCATEGORIZED_LABEL;
    if (!byCategory.has(bucket)) byCategory.set(bucket, []);
    byCategory.get(bucket)!.push(item);
  }

  const sections: { category: string; courses: T[] }[] = [];
  for (const cat of CATEGORY_DISPLAY_ORDER) {
    const list = byCategory.get(cat);
    if (list && list.length) sections.push({ category: cat, courses: list });
    byCategory.delete(cat);
  }
  const custom = [...byCategory.keys()]
    .filter((k) => k !== UNCATEGORIZED_LABEL)
    .sort((a, b) => a.localeCompare(b));
  for (const cat of custom) sections.push({ category: cat, courses: byCategory.get(cat)! });
  const other = byCategory.get(UNCATEGORIZED_LABEL);
  if (other && other.length) sections.push({ category: UNCATEGORIZED_LABEL, courses: other });

  return sections;
}
