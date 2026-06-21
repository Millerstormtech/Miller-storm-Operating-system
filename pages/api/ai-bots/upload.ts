import type { NextApiRequest, NextApiResponse } from "next";
import formidable from "formidable";
import fs from "fs";
import path from "path";
import { connectMongo } from "../../../src/lib/mongodb";
import { AiBotModel } from "../../../src/lib/models/AiBot";

export const config = { api: { bodyParser: false } };

// Ensure upload directory exists
const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads", "bots");
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).end();
  }

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

  throw new Error("Unsupported file type");
}

function getFileType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  if (ext === ".pdf") return "pdf";
  if (ext === ".docx" || ext === ".doc") return "word-doc";
  if (ext === ".xlsx" || ext === ".xls" || ext === ".csv") return "excel-csv";
  return "webpage";
}
