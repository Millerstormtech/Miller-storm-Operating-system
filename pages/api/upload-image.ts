import type { NextApiRequest, NextApiResponse } from 'next';
import formidable from 'formidable';
import fs from 'fs';
import path from 'path';

export const config = {
  api: {
    bodyParser: false,
    responseLimit: false,
    externalResolver: true,
  },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  console.log('Upload request received');
  console.log('Content-Type:', req.headers['content-type']);
  console.log('Content-Length:', req.headers['content-length']);

  const uploadDir = path.join(process.cwd(), 'public', 'uploads');
  
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  const form = formidable({
    uploadDir,
    keepExtensions: true,
    maxFileSize: 1000 * 1024 * 1024, // 1000MB
    maxFieldsSize: 1000 * 1024 * 1024, // 1000MB
    maxTotalFileSize: 1000 * 1024 * 1024, // 1000MB
    allowEmptyFiles: false,
    minFileSize: 1, // At least 1 byte
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
