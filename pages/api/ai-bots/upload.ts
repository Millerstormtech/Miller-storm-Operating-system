import type { NextApiRequest, NextApiResponse } from "next";
import formidable from "formidable";
import fs from "fs";
import path from "path";
import { connectMongo } from "../../../src/lib/mongodb";
import { AiBotModel } from "../../../src/lib/models/AiBot";
import { requireRole, allowMethods } from "../../../src/lib/auth";
import { reindexBotInBackground } from "../../../src/lib/rag";

export const config = { api: { bodyParser: false } };

// Ensure upload directory exists
const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads", "bots");
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!allowMethods(req, res, ["POST"])) return;

  const auth = requireRole(req, res, "admin");
  if (!auth) return;

  await connectMongo();

  const form = formidable({ maxFileSize: 70 * 1024 * 1024, uploadDir: UPLOAD_DIR, keepExtensions: true });

  form.parse(req, async (err, fields, files) => {
    if (err) return res.status(500).json({ error: "Upload failed" });

    const botId = Array.isArray(fields.botId) ? fields.botId[0] : fields.botId;
    const file = Array.isArray(files.file) ? files.file[0] : files.file;

    if (!botId || !file) return res.status(400).json({ error: "Missing botId or file" });

    try {
      const content = await extractFileContent(file);
      const bot = await AiBotModel.findOne({ id: botId });
      if (!bot) return res.status(404).json({ error: "Bot not found" });

      // Build a publicly accessible URL from the saved file path
      const savedFilename = path.basename(file.filepath);
      const publicUrl = `/uploads/bots/${savedFilename}`;

      const newLink = {
        id: `file-${Date.now()}`,
        url: publicUrl,
        type: getFileType(file.originalFilename || ""),
        status: "trained",
        chars: content.length,
        originalName: file.originalFilename || "uploaded-file"
      };

      bot.trainingLinks = bot.trainingLinks || [];
      bot.trainingLinks.push(newLink);
      bot.trainingText = (bot.trainingText || "") + `\n\n[File: ${file.originalFilename}]\n${content}`;
      await bot.save();
      reindexBotInBackground(bot.id);

      return res.status(200).json({ link: newLink, extractedChars: content.length });
    } catch (error) {
      console.error("File processing error:", error);
      return res.status(500).json({ error: "Failed to process file" });
    }
  });
}

async function extractFileContent(file: formidable.File): Promise<string> {
  const filePath = file.filepath;
  const ext = path.extname(file.originalFilename || "").toLowerCase();

  if (ext === ".txt" || ext === ".md" || ext === ".csv") {
    return fs.readFileSync(filePath, "utf-8");
  }

  if (ext === ".pdf") {
    const pdfParse = require("pdf-parse");
    const dataBuffer = fs.readFileSync(filePath);
    const data = await pdfParse(dataBuffer);
    return data.text;
  }

  if (ext === ".docx" || ext === ".doc") {
    const mammoth = require("mammoth");
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value;
  }

  if (ext === ".xlsx" || ext === ".xls") {
    const XLSX = require("xlsx");
    const workbook = XLSX.readFile(filePath);
    let text = "";
    workbook.SheetNames.forEach((sheetName: string) => {
      const sheet = workbook.Sheets[sheetName];
      text += XLSX.utils.sheet_to_csv(sheet) + "\n\n";
    });
    return text;
  }

  // Audio / video (e.g. .mov training recordings): transcribe the spoken words
  // with OpenAI Whisper and use the transcript as the training text.
  if (MEDIA_EXTS.includes(ext)) {
    return await transcribeMedia(filePath, file.originalFilename || `media${ext}`);
  }

  throw new Error("Unsupported file type");
}

// Audio/video extensions we transcribe instead of parsing as text.
const MEDIA_EXTS = [".mov", ".mp4", ".m4a", ".mp3", ".wav", ".webm", ".mpeg", ".mpga", ".ogg", ".oga"];

// Transcribe an audio/video file to text via OpenAI's Whisper API. The API
// caps uploads at 25MB, so we surface a clear message for anything larger
// (formidable still accepts up to 70MB for documents).
async function transcribeMedia(filePath: string, filename: string): Promise<string> {
  if (!process.env.OPENAI_API_KEY) throw new Error("Transcription is not configured (missing OpenAI key).");
  const MAX_BYTES = 25 * 1024 * 1024;
  const size = fs.statSync(filePath).size;
  if (size > MAX_BYTES) {
    throw new Error(
      `This clip is ${(size / 1024 / 1024).toFixed(0)}MB — audio/video transcription is limited to 25MB. Please upload a shorter or compressed clip.`
    );
  }
  const buffer = fs.readFileSync(filePath);
  const form = new FormData();
  form.append("file", new Blob([buffer]), filename);
  form.append("model", "whisper-1");
  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: form,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Transcription failed${detail ? `: ${detail.slice(0, 200)}` : ""}`);
  }
  const data = await res.json();
  return (data.text || "").trim();
}

function getFileType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  if (ext === ".pdf") return "pdf";
  if (ext === ".docx" || ext === ".doc") return "word-doc";
  if (ext === ".xlsx" || ext === ".xls" || ext === ".csv") return "excel-csv";
  if (MEDIA_EXTS.includes(ext)) return "video";
  return "webpage";
}
