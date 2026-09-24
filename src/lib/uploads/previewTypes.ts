// Formats the server converts to PDF (with LibreOffice, see docPreview.ts) so
// they open in the same canvas viewer as PDFs: view-only, no browser download
// button. Kept free of Node imports so the client can use it too.
export const CONVERTIBLE_EXTENSIONS = [
  ".doc", ".docx", ".odt", ".rtf", ".txt", ".pages",
  ".xls", ".xlsx", ".ods", ".csv", ".numbers",
  ".ppt", ".pptx", ".odp", ".key",
];

export function needsPdfConversion(fileName: string): boolean {
  const lower = (fileName || "").toLowerCase();
  const dot = lower.lastIndexOf(".");
  return dot !== -1 && CONVERTIBLE_EXTENSIONS.includes(lower.slice(dot));
}
