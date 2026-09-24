// The single allowlist of what may be uploaded. Chat attachments, lesson
// resources and avatars all pass through here. The point is not size — it is
// that an uploaded file is served from the app's own origin, so an .html / .svg
// / .js file becomes same-origin script (stored XSS) the moment someone opens
// its /uploads/ URL. Allow only inert media and documents; block anything the
// browser would execute.
//
// upload-server.js (plain Node, cannot import this TS file) keeps an identical
// list — keep the two in sync.

import crypto from "crypto";

export const ALLOWED_UPLOAD_EXTENSIONS = [
  // images
  ".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".heic", ".heif", ".tif", ".tiff", ".ico",
  // video
  ".mp4", ".mov", ".webm", ".m4v", ".avi", ".mkv", ".wmv", ".3gp", ".flv",
  // audio
  ".mp3", ".m4a", ".wav", ".ogg", ".aac", ".flac", ".wma",
  // documents
  ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".txt", ".csv",
  ".rtf", ".odt", ".ods", ".odp", ".key", ".pages", ".numbers", ".epub", ".md",
  // design / CAD (inert; downloaded, not executed)
  ".psd", ".ai", ".eps", ".indd", ".dwg", ".dxf",
  // archives (inert; downloaded, not executed)
  ".zip", ".rar", ".7z", ".tar", ".gz",
];

// Refused anywhere in the extension chain, not just as the final extension.
// Defense in depth only — the stored name comes from storedUploadName(), never
// from the client's name. Each segment is judged by its leading ASCII
// letter/digit run, taken BEFORE lowercasing: that is exactly what formidable's
// keepExtensions would keep ("x.html .jpg" -> ".html"), and lowercasing first
// would let "K" (U+212A, lowercases to ASCII "k") turn "htmlK" into a harmless-
// looking "htmlk". Whole-segment matching (not a raw substring) is what lets
// ordinary names like "Safety.Compliance.pdf" (".com") or "J.Shah.pdf" through.
const FORBIDDEN_EXTENSIONS = new Set([
  "html", "htm", "shtml", "xhtml", "xml", "xsl", "xslt", "mht", "mhtml",
  "rss", "atom", "kml", "xspf", "mml", // +xml types browsers render as documents
  "svg", "svgz", "js", "mjs", "cjs", "php", "phtml", "asp", "aspx", "jsp",
  "sh", "bat", "cmd", "exe", "com", "scr", "vbs", "jar", "htaccess",
]);

// The final extension, lowercased, if it is plain ASCII letters/digits.
function finalExtension(name: string): string | null {
  const last = name.split(".").pop() ?? "";
  return name.includes(".") && /^[A-Za-z0-9]+$/.test(last) ? `.${last.toLowerCase()}` : null;
}

const MIME_BY_EXTENSION: Record<string, string> = {
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".gif": "image/gif",
  ".webp": "image/webp", ".bmp": "image/bmp", ".heic": "image/heic", ".heif": "image/heif",
  ".tif": "image/tiff", ".tiff": "image/tiff", ".ico": "image/x-icon",
  ".mp4": "video/mp4", ".mov": "video/quicktime", ".webm": "video/webm", ".m4v": "video/x-m4v",
  ".avi": "video/x-msvideo", ".mkv": "video/x-matroska", ".wmv": "video/x-ms-wmv",
  ".3gp": "video/3gpp", ".flv": "video/x-flv",
  ".mp3": "audio/mpeg", ".m4a": "audio/mp4", ".wav": "audio/wav", ".ogg": "audio/ogg",
  ".aac": "audio/aac", ".flac": "audio/flac", ".wma": "audio/x-ms-wma",
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".ppt": "application/vnd.ms-powerpoint",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".txt": "text/plain", ".csv": "text/csv", ".md": "text/markdown", ".rtf": "application/rtf",
  ".odt": "application/vnd.oasis.opendocument.text",
  ".ods": "application/vnd.oasis.opendocument.spreadsheet",
  ".odp": "application/vnd.oasis.opendocument.presentation",
  ".epub": "application/epub+zip",
  ".zip": "application/zip", ".gz": "application/gzip",
};

// The Content-Type to store and serve for an uploaded file, decided by the
// server from its extension. Never use the type the uploader's browser sent
// with the multipart part: that is client-controlled, so "notes.pdf" sent as
// text/html would otherwise be served back as a same-origin HTML page.
export function mimeTypeForName(name: string): string {
  const ext = finalExtension(name || "");
  return (ext && MIME_BY_EXTENSION[ext]) || "application/octet-stream";
}

export function isAllowedUploadName(name: string): boolean {
  if (!name || typeof name !== "string") return false;
  const ext = finalExtension(name);
  if (!ext || !ALLOWED_UPLOAD_EXTENSIONS.includes(ext)) return false;
  const kept = (seg: string) => /^[A-Za-z0-9]*/.exec(seg)![0].toLowerCase();
  return !name.split(".").slice(1).some((seg) => FORBIDDEN_EXTENSIONS.has(kept(seg)));
}

// The on-disk name for an upload: random, plus the final extension ONLY if the
// name passes the allowlist. Pass it as formidable's `filename` option instead
// of keepExtensions, which copies everything from the client name's FIRST dot
// and so lets the client pick what nginx serves the file as. Checks the
// allowlist itself rather than trusting formidable's `filter`, which some of
// formidable's parsers (octet-stream) never call.
export function storedUploadName(originalFilename: string): string {
  const ext = isAllowedUploadName(originalFilename) ? finalExtension(originalFilename) : null;
  return `${crypto.randomBytes(16).toString("hex")}${ext ?? ""}`;
}
