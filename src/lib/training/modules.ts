// A course's published "modules" (folders like Phase 1 / Phase 2) with the id
// of the first playable lesson in each, so a Training Center card can link
// straight into a module. Folders with no published lesson are skipped.
export function courseModules(course: {
  folders?: { id: string; title?: string; status?: string }[];
  pages?: { id: string; status?: string; folderId?: string }[];
}): { id: string; title: string; firstPageId: string }[] {
  const folders = Array.isArray(course.folders) ? course.folders : [];
  const pages = Array.isArray(course.pages) ? course.pages : [];
  return folders
    .filter((f) => (f?.status ?? "published") === "published")
    .map((f) => {
      const first = pages.find((p) => p?.folderId === f.id && p?.status === "published");
      return first ? { id: f.id, title: (f.title || "Module").trim(), firstPageId: first.id } : null;
    })
    .filter((m): m is { id: string; title: string; firstPageId: string } => m !== null);
}
