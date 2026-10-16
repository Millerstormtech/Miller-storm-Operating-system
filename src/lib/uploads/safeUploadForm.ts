// A formidable form for uploads that land in a PUBLIC folder (served by nginx
// from the app's own origin). Same recipe as pages/api/upload-image.ts,
// packaged so other routes can't get it half right:
//   - multipart only: formidable's octet-stream parser never runs `filter`;
//   - random stored name + the validated final extension, never keepExtensions
//     (which copies everything from the client name's first dot);
//   - only names on `extensions` are written, and never an executable segment
//     (src/lib/uploads/allowedTypes.ts);
//   - discard() waits for every write stream to close and then deletes it, so a
//     refused or failed upload leaves nothing behind by the time we answer.

import type { IncomingMessage } from "http";
import fs from "fs";
import { Writable } from "stream";
import formidable, { multipart } from "formidable";
import { isAllowedUploadName, storedUploadName } from "./allowedTypes";

const EMPTY_FILE_ERRORS = [1008, 1010]; // smallerThanMinFileSize, noEmptyFiles
const TOO_BIG_ERRORS = [1009, 1016]; // biggerThanTotalMaxFileSize, biggerThanMaxFileSize
const NO_PARSER_ERROR = 1003; // not multipart, and only the multipart parser is enabled

export function safeUploadForm(opts: { uploadDir: string; maxFileSize: number; extensions: readonly string[] }) {
  // formidable's filter drops a refused part silently; keep its name so the
  // person is told the real reason instead of "No file uploaded".
  const refused: string[] = [];
  const streams: fs.WriteStream[] = [];
  let discarding = false;

  const form = formidable({
    enabledPlugins: [multipart] as unknown as string[], // @types/formidable types this as string[]
    uploadDir: opts.uploadDir,
    filename: (_name, _ext, part) => storedUploadName(part.originalFilename || "", opts.extensions),
    maxFileSize: opts.maxFileSize,
    allowEmptyFiles: false,
    minFileSize: 1,
    filter: ({ originalFilename }) => {
      const ok = isAllowedUploadName(originalFilename || "", opts.extensions);
      if (!ok) refused.push(originalFilename || "That file");
      return ok;
    },
    fileWriteStreamHandler: (file) => {
      if (discarding) return new Writable({ write: (_chunk, _enc, cb) => cb() });
      const ws = fs.createWriteStream((file as unknown as formidable.File).filepath);
      streams.push(ws);
      return ws;
    },
  });

  const parse = (req: IncomingMessage) =>
    new Promise<{ fields: formidable.Fields; files: formidable.Files }>((resolve, reject) => {
      form.parse(req, (err, fields, files) => (err ? reject(err) : resolve({ fields, files })));
    });

  const discard = async () => {
    discarding = true; // any part that starts from here on writes nothing
    await Promise.all(
      streams.map(async (ws) => {
        if (!ws.closed) {
          const closed = new Promise<void>((resolve) => ws.once("close", () => resolve()));
          ws.destroy();
          await closed;
        }
        await fs.promises.unlink(ws.path as string).catch((err) => {
          if (err?.code !== "ENOENT") console.error("[upload] could not delete refused upload", ws.path, err);
        });
      })
    );
  };

  return { parse, discard, refused };
}

// A plain-language answer for formidable's own errors, or null for anything else.
export function uploadProblem(err: any, maxLabel: string): { status: number; error: string } | null {
  if (EMPTY_FILE_ERRORS.includes(err?.code)) return { status: 400, error: "That file is empty" };
  if (TOO_BIG_ERRORS.includes(err?.code)) return { status: 413, error: `That file is too big (${maxLabel} max)` };
  if (err?.code === NO_PARSER_ERROR) return { status: 400, error: "Send the file as a form upload" };
  return null;
}
