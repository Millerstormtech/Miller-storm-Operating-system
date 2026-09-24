import type { NextApiRequest, NextApiResponse } from 'next';
import formidable, { multipart } from 'formidable';
import fs from 'fs';
import path from 'path';
import { requireUser, allowMethods } from '../../src/lib/auth';
import { isAllowedUploadName, storedUploadName } from '../../src/lib/uploads/allowedTypes';

export const config = {
  api: {
    bodyParser: false,
    responseLimit: false,
    externalResolver: true,
  },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!allowMethods(req, res, ['POST'])) return;

  const auth = requireUser(req, res);
  if (!auth) return;

  console.log('Upload request received');
  console.log('Content-Type:', req.headers['content-type']);
  console.log('Content-Length:', req.headers['content-length']);

  const uploadDir = path.join(process.cwd(), 'public', 'uploads');
  
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

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
    filter: ({ originalFilename }) => isAllowedUploadName(originalFilename || ''),
  });
 
  try {
    const result = await new Promise<{ fields: formidable.Fields; files: formidable.Files }>((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) {
          console.error('Formidable parse error:', err);
          reject(err);
          return;
        }
        resolve({ fields, files });
      });
    });

    const file = Array.isArray(result.files.file) ? result.files.file[0] : result.files.file;
    if (!file) {
      console.error('No file in upload');
      return res.status(400).json({ error: 'No file uploaded' });
    }
    if (!isAllowedUploadName(file.originalFilename || '')) {
      fs.unlink(file.filepath, () => {});
      return res.status(400).json({ error: 'File type not allowed' });
    }

    const filename = path.basename(file.filepath);
    const url = `/uploads/${filename}`;

    console.log('File uploaded successfully:', url);
    console.log('File size:', file.size, 'bytes');
    
    return res.status(200).json({ url });
  } catch (err: any) {
    console.error('Upload error:', err);
    return res.status(500).json({ 
      error: 'Upload failed', 
      details: err.message || 'Unknown error'
    });
  }
}
