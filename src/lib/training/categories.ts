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
  "Miller Storm Certificate",
  "Millionaire Knockers",
  "Roof Hustlers",
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
  for (const cat of TRAINING_CATEGORIES) {
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
