import fs from "fs";
import type { IncomingMessage, ServerResponse } from "http";

// Streams a file, honouring a single-range "Range: bytes=a-b" request with a
// 206. The Docs & SOPs viewer (pdf.js) relies on this: with Accept-Ranges it
// fetches the parts a page needs instead of the whole file first, so page 1
// of a large PDF shows before the rest has downloaded. Anything it can't
// parse (e.g. multiple ranges) just gets the whole file, which HTTP allows.
export function sendFile(req: IncomingMessage, res: ServerResponse, filePath: string, headers: Record<string, string>): void {
  const size = fs.statSync(filePath).size;
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.setHeader("Accept-Ranges", "bytes");

  const match = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range || "").trim());
  if (match && (match[1] || match[2])) {
    let start: number;
    let end: number;
    if (match[1]) {
      start = Number(match[1]);
      end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
    } else {
      start = Math.max(size - Number(match[2]), 0); // "bytes=-500": the last 500 bytes
      end = size - 1;
    }
    if (start >= size || start > end) {
      res.statusCode = 416;
      res.setHeader("Content-Range", `bytes */${size}`);
      res.end();
      return;
    }
    res.statusCode = 206;
    res.setHeader("Content-Range", `bytes ${start}-${end}/${size}`);
    res.setHeader("Content-Length", String(end - start + 1));
    fs.createReadStream(filePath, { start, end }).pipe(res);
    return;
  }

  res.statusCode = 200;
  res.setHeader("Content-Length", String(size));
  fs.createReadStream(filePath).pipe(res);
}
