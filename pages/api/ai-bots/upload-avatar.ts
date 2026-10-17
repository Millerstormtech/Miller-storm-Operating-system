import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import { requireRole, allowMethods } from "../../../src/lib/auth";
import { safeUploadForm, uploadProblem } from "../../../src/lib/uploads/safeUploadForm";

export const config = { api: { bodyParser: false } };

// Avatars are shown as <img>, so plain images only (no .svg: it can carry script).
const AVATAR_EXTENSIONS = [".jpg", ".jpeg", ".png", ".gif", ".webp"];

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!allowMethods(req, res, ["POST"])) return;

  const auth = requireRole(req, res, "admin");
  if (!auth) return;

  const uploadDir = path.join(process.cwd(), "public", "uploads");
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

  const upload = safeUploadForm({ uploadDir, maxFileSize: 5 * 1024 * 1024, extensions: AVATAR_EXTENSIONS });

  try {
    const { files } = await upload.parse(req);
    const file = Array.isArray(files.file) ? files.file[0] : files.file;
    if (!file) {
      await upload.discard();
      const name = upload.refused[0];
      return res.status(400).json({
        error: name ? `"${name}" can't be used as an avatar. Use a JPG, PNG, GIF or WebP image.` : "No file uploaded",
      });
    }
    return res.status(200).json({ url: `/uploads/${path.basename(file.filepath)}` });
  } catch (err) {
    await upload.discard();
    const problem = uploadProblem(err, "5 MB");
    if (problem) return res.status(problem.status).json({ error: problem.error });
    console.error("Avatar upload error:", err);
    return res.status(500).json({ error: "Upload failed" });
  }
}
