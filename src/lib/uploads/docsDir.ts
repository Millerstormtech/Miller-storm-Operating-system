import path from "path";

// Where Docs & SOPs files live: outside /public on purpose, so nothing is
// reachable by URL without going through the authenticated file route.
// SOP_DOCS_DIR lets tests point the routes at a throwaway directory; nothing
// in production sets it.
export function docsDir(): string {
  return process.env.SOP_DOCS_DIR || path.join(process.cwd(), "private-uploads", "docs");
}
