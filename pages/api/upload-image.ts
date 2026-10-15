import type { NextApiRequest, NextApiResponse } from 'next';
import formidable, { multipart } from 'formidable';
import fs from 'fs';
import path from 'path';
import { Writable } from 'stream';
import { requireUser, allowMethods } from '../../src/lib/auth';
import { isAllowedUploadName, storedUploadName } from '../../src/lib/uploads/allowedTypes';

export const config = {
  api: {
    bodyParser: false,
    responseLimit: false,
    externalResolver: true,
  },
};

const EMPTY_FILE_ERRORS = [1008, 1010]; // smallerThanMinFileSize, noEmptyFiles
const TOO_BIG_ERRORS = [1009, 1016]; // biggerThanTotalMaxFileSize, biggerThanMaxFileSize
const NO_PARSER_ERROR = 1003; // not multipart, and only the multipart parser is enabled

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!allowMethods(req, res, ['POST'])) return;

  const auth = requireUser(req, res);
  if (!auth) return;

  const uploadDir = path.join(process.cwd(), 'public', 'uploads');

  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  // formidable's filter drops a refused part silently, which surfaced as a
  // baffling "No file uploaded": keep the refused name so the person is told
  // the real reason.
  const refused: string[] = [];

  // Every file formidable writes goes through a stream made here, so a refused
  // or failed upload can wait for each one to finish closing and only then
  // delete it. Left to itself, formidable deletes a refused file on a timer
  // AFTER the error is reported, and opens files asynchronously, so a plain
  // unlink could run before the file even exists and leave an empty file
  // behind in the public uploads folder (same fix as pages/api/docs).
  const streams: fs.WriteStream[] = [];
  let discarding = false;
  const discardUpload = async () => {
    discarding = true; // any part that starts from here on writes nothing
    await Promise.all(
      streams.map(async (ws) => {
        if (!ws.closed) {
          const closed = new Promise<void>((resolve) => ws.once('close', () => resolve()));
          ws.destroy();
          await closed;
        }
        await fs.promises.unlink(ws.path as string).catch((err) => {
          if (err?.code !== 'ENOENT') console.error('[upload-image] could not delete refused upload', ws.path, err);
        });
      })
    );
  };

  const form = formidable({
    // Multipart only: formidable's octet-stream parser takes the name from an
    // x-file-name header and never runs `filter`, so it would skip the
    // allowlist. (@types/formidable still types this as string[].)
    enabledPlugins: [multipart] as unknown as string[],
    uploadDir,
    // Random name + the validated final extension only. keepExtensions would
    // copy everything from the client name's first dot ("x.html .jpg" ->
    // ".html"), letting the uploader choose how nginx serves the file.
    filename: (_name, _ext, part) => storedUploadName(part.originalFilename || ''),
    maxFileSize: 1000 * 1024 * 1024, // 1000MB
    maxFieldsSize: 1000 * 1024 * 1024, // 1000MB
    maxTotalFileSize: 1000 * 1024 * 1024, // 1000MB
    allowEmptyFiles: false,
    minFileSize: 1, // At least 1 byte
    // Reject anything the browser would execute (stored XSS from the app's own
    // origin). Same allowlist as src/lib/uploads/allowedTypes.ts / upload-server.js.
    filter: ({ originalFilename }) => {
      const ok = isAllowedUploadName(originalFilename || '');
      if (!ok) refused.push(originalFilename || 'That file');
      return ok;
    },
    fileWriteStreamHandler: (file) => {
      if (discarding) return new Writable({ write: (_chunk, _enc, cb) => cb() });
      const ws = fs.createWriteStream((file as unknown as formidable.File).filepath);
      streams.push(ws);
      return ws;
    },
  });

  try {
    const result = await new Promise<{ fields: formidable.Fields; files: formidable.Files }>((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) { reject(err); return; }
        resolve({ fields, files });
      });
    });

    const file = Array.isArray(result.files.file) ? result.files.file[0] : result.files.file;
    if (!file || !isAllowedUploadName(file.originalFilename || '')) {
      await discardUpload();
      const name = refused[0] ?? file?.originalFilename;
      return res.status(400).json({ error: name ? `"${name}" isn't an allowed file type` : 'No file uploaded' });
    }

    const url = `/uploads/${path.basename(file.filepath)}`;
    return res.status(200).json({ url });
  } catch (err: any) {
    // Nothing was accepted, so nothing on disk should outlive this request.
    await discardUpload();
    if (EMPTY_FILE_ERRORS.includes(err?.code)) return res.status(400).json({ error: 'That file is empty' });
    if (TOO_BIG_ERRORS.includes(err?.code)) return res.status(413).json({ error: 'That file is too big (1,000 MB max)' });
    if (err?.code === NO_PARSER_ERROR) return res.status(400).json({ error: 'Send the file as a form upload' });
    console.error('Upload error:', err);
    return res.status(500).json({ error: 'Upload failed' });
  }
}
