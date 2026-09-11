// The single allowlist of what may be uploaded. Chat attachments, lesson
// resources and avatars all pass through here. The point is not size — it is
// that an uploaded file is served from the app's own origin, so an .html / .svg
// / .js file becomes same-origin script (stored XSS) the moment someone opens
// its /uploads/ URL. Allow only inert media and documents; block anything the
// browser would execute.
//
// upload-server.js (plain Node, cannot import this TS file) keeps an identical
// list — keep the two in sync.

export const ALLOWED_UPLOAD_EXTENSIONS = [
  // images
  ".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".heic", ".heif",
  // video
  ".mp4", ".mov", ".webm", ".m4v", ".avi", ".mkv",
  // audio
  ".mp3", ".m4a", ".wav", ".ogg",
  // documents
  ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".txt", ".csv",
  // archives (inert; downloaded, not executed)
  ".zip", ".rar",
];

// Explicitly dangerous even if an extension check is somehow bypassed by a
// double extension: refuse if the name contains any of these anywhere.
const FORBIDDEN_SUBSTRINGS = [
  ".html", ".htm", ".xhtml", ".svg", ".js", ".mjs", ".cjs", ".php",
  ".phtml", ".asp", ".aspx", ".jsp", ".sh", ".bat", ".cmd", ".exe",
  ".com", ".scr", ".vbs", ".jar", ".htaccess",
];

export function isAllowedUploadName(name: string): boolean {
  if (!name || typeof name !== "string") return false;
  const lower = name.toLowerCase();
  if (FORBIDDEN_SUBSTRINGS.some((bad) => lower.includes(bad))) return false;
  const dot = lower.lastIndexOf(".");
  if (dot === -1) return false; // no extension → reject
  return ALLOWED_UPLOAD_EXTENSIONS.includes(lower.slice(dot));
}
