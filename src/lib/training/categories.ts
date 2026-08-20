// Predefined Training Center course categories, offered as ready picks in the
// Course Builder category dropdown. Admins can also add custom categories — any
// distinct `category` value used across courses becomes a Training Center
// section, grouped like Tools & Products. Courses with no category fall into an
// "Other Courses" bucket rendered last.
export const TRAINING_CATEGORIES = [
  "Miller Storm Certificate",
  "Matt Mulholland Certificate",
  "DeShaun Bryant (Roof Hustlers) Certificate",
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
    const key = (item.category || "").trim();
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
