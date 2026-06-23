import type { NextApiRequest, NextApiResponse } from "next";
import formidable from "formidable";
import fs from "fs";
import path from "path";
import { requireRole, allowMethods } from "../../../src/lib/auth";

export const config = { api: { bodyParser: false } };

/**
 * Accepts an uploaded quiz file (.txt / .md / .docx / .doc / .xlsx / .xls / .csv)
 * and returns it converted into the plain-text quiz-document format that the
 * Import Quizzes feature understands:
 *
 *   # Course: <title or id>
 *   ## Lesson: <lesson title>
 *   Show: N
 *   1. Question?
 *   - wrong
 *   * correct
 *
 * Word/text files are expected to already be written in that format (we just
 * extract their text). Excel/CSV files use a COLUMN layout (see below) and we
 * build the document from the rows.
 *
 * Response: { ok: true, doc: string } | { ok: false, error: string }
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!allowMethods(req, res, ["POST"])) return;
  if (!requireRole(req, res, "admin")) return;

  const form = formidable({ maxFileSize: 15 * 1024 * 1024, keepExtensions: true });

  form.parse(req, async (err, fields, files) => {
    if (err) {
      res.status(500).json({ ok: false, error: "Upload failed." });
      return;
    }
    const file = Array.isArray(files.file) ? files.file[0] : files.file;
    if (!file) {
      res.status(400).json({ ok: false, error: "No file uploaded." });
      return;
    }
    // mode "questions" -> output just questions (for importing into one quiz page).
    // mode "full" (default) -> output Course/Lesson-structured document.
    const modeRaw = Array.isArray(fields.mode) ? fields.mode[0] : fields.mode;
    const questionsOnly = modeRaw === "questions";
    try {
      const doc = await fileToQuizDoc(file, questionsOnly);
      // best-effort cleanup of the temp upload
      try {
        fs.unlinkSync(file.filepath);
      } catch {}
      res.status(200).json({ ok: true, doc });
    } catch (e: any) {
      res.status(200).json({ ok: false, error: e?.message || "Could not read this file." });
    }
  });
}

async function fileToQuizDoc(file: formidable.File, questionsOnly: boolean): Promise<string> {
  const filePath = file.filepath;
  const ext = path.extname(file.originalFilename || "").toLowerCase();

  if (ext === ".txt" || ext === ".md" || ext === ".markdown") {
    return fs.readFileSync(filePath, "utf-8");
  }

  if (ext === ".docx" || ext === ".doc") {
    const mammoth = require("mammoth");
    const result = await mammoth.extractRawText({ path: filePath });
    return String(result.value || "");
  }

  if (ext === ".xlsx" || ext === ".xls" || ext === ".csv") {
    const XLSX = require("xlsx");
    const workbook = XLSX.readFile(filePath);
    const rows: Record<string, any>[] = [];
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const sheetRows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
      rows.push(...sheetRows);
    }
    return questionsOnly ? rowsToQuestionsDoc(rows) : rowsToQuizDoc(rows);
  }

  throw new Error(`Unsupported file type "${ext}". Use .xlsx, .docx, .txt, or .md.`);
}

// Excel/CSV rows -> questions-only document (for importing into one quiz page).
// Columns: Question, Option A..H (or Option 1..8 / A..H), Correct, optional Show.
function rowsToQuestionsDoc(rows: Record<string, any>[]): string {
  if (!rows.length) throw new Error("The spreadsheet has no data rows.");
  const questions: { prompt: string; options: string[]; correct: number }[] = [];
  let show = "";
  rows.forEach((row) => {
    const prompt = pick(row, ["question", "prompt", "question text"]);
    if (!prompt) return;
    const options = collectOptions(row);
    const correctRaw = pick(row, ["correct", "answer", "correct answer", "correct option"]);
    const correct = resolveCorrectIndex(correctRaw, options);
    const s = pick(row, ["show", "questions to show", "# to show", "questionstoshow"]);
    if (s && !show) show = s;
    questions.push({ prompt, options, correct });
  });
  if (!questions.length)
    throw new Error(
      "No usable rows found. Make sure your sheet has columns named Question, Option A, Option B, … and Correct."
    );
  const lines: string[] = [];
  if (show) lines.push(`Show: ${show}`);
  questions.forEach((q, qi) => {
    lines.push(`${qi + 1}. ${q.prompt}`);
    q.options.forEach((opt, oi) => lines.push(`${oi === q.correct ? "*" : "-"} ${opt}`));
  });
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Excel / CSV rows -> quiz document
// ---------------------------------------------------------------------------
//
// Expected columns (header names are case-insensitive; several aliases work):
//   Course        — course title or id          (aliases: course title, course name)
//   Lesson        — lesson title                 (aliases: lesson title, lesson name)
//   Show          — questions to show (optional) (aliases: questions to show, # to show)
//   Question      — the question text            (aliases: prompt, question text)
//   Option A..H   — answer options               (aliases: option 1..8, a..h)
//   Correct       — the answer                   (aliases: answer, correct answer, correct option)
//                   value may be a letter (A/B/C), a number (1/2/3), or the exact option text
//
// One ROW = one question. Rows are grouped by Course + Lesson, in order.

function normKey(k: string): string {
  return String(k || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function pick(row: Record<string, any>, names: string[]): string {
  for (const name of names) {
    for (const key of Object.keys(row)) {
      if (normKey(key) === name) {
        const v = row[key];
        if (v != null && String(v).trim() !== "") return String(v).trim();
      }
    }
  }
  return "";
}

function collectOptions(row: Record<string, any>): string[] {
  // Map of order-index -> text, so "Option A"/"A"/"Option 1" all sort correctly.
  const found: { order: number; text: string }[] = [];
  for (const key of Object.keys(row)) {
    const nk = normKey(key);
    let m = nk.match(/^option\s*([a-h])$/); // option a..h
    if (m) {
      found.push({ order: m[1].charCodeAt(0) - 97, text: String(row[key]).trim() });
      continue;
    }
    m = nk.match(/^option\s*([1-8])$/); // option 1..8
    if (m) {
      found.push({ order: parseInt(m[1], 10) - 1, text: String(row[key]).trim() });
      continue;
    }
    m = nk.match(/^([a-h])$/); // bare a..h
    if (m) {
      found.push({ order: m[1].charCodeAt(0) - 97, text: String(row[key]).trim() });
      continue;
    }
  }
  return found
    .sort((a, b) => a.order - b.order)
    .map((o) => o.text)
    .filter((t) => t !== "");
}

function resolveCorrectIndex(correctRaw: string, options: string[]): number {
  const c = correctRaw.trim();
  if (!c) return -1;
  // letter A-H
  const letter = c.match(/^([a-hA-H])$/);
  if (letter) return letter[1].toUpperCase().charCodeAt(0) - 65;
  // number 1-8
  const num = c.match(/^([1-8])$/);
  if (num) return parseInt(num[1], 10) - 1;
  // exact option text (case-insensitive)
  const idx = options.findIndex((o) => o.trim().toLowerCase() === c.toLowerCase());
  return idx;
}

function rowsToQuizDoc(rows: Record<string, any>[]): string {
  if (!rows.length) throw new Error("The spreadsheet has no data rows.");

  // Group: course -> lesson -> { show, questions[] }
  type LessonAgg = { show: string; questions: { prompt: string; options: string[]; correct: number }[] };
  const courses = new Map<string, Map<string, LessonAgg>>();
  const courseOrder: string[] = [];

  let usable = 0;
  rows.forEach((row) => {
    const course = pick(row, ["course", "course title", "course name"]);
    const lesson = pick(row, ["lesson", "lesson title", "lesson name"]);
    const prompt = pick(row, ["question", "prompt", "question text"]);
    if (!course || !lesson || !prompt) return; // skip incomplete / header-ish rows

    const options = collectOptions(row);
    const correctRaw = pick(row, ["correct", "answer", "correct answer", "correct option"]);
    const correct = resolveCorrectIndex(correctRaw, options);
    const show = pick(row, ["show", "questions to show", "# to show", "questionstoshow"]);

    if (!courses.has(course)) {
      courses.set(course, new Map());
      courseOrder.push(course);
    }
    const lessons = courses.get(course)!;
    if (!lessons.has(lesson)) lessons.set(lesson, { show: "", questions: [] });
    const agg = lessons.get(lesson)!;
    if (show && !agg.show) agg.show = show;
    agg.questions.push({ prompt, options, correct });
    usable++;
  });

  if (usable === 0) {
    throw new Error(
      "No usable rows found. Make sure your sheet has columns named Course, Lesson, Question, Option A, Option B, … and Correct."
    );
  }

  // Render to the quiz-document text format.
  const lines: string[] = [];
  for (const course of courseOrder) {
    lines.push(`# Course: ${course}`);
    lines.push("");
    const lessons = courses.get(course)!;
    for (const [lesson, agg] of lessons) {
      lines.push(`## Lesson: ${lesson}`);
      if (agg.show) lines.push(`Show: ${agg.show}`);
      agg.questions.forEach((q, qi) => {
        lines.push(`${qi + 1}. ${q.prompt}`);
        q.options.forEach((opt, oi) => {
          lines.push(`${oi === q.correct ? "*" : "-"} ${opt}`);
        });
      });
      lines.push("");
    }
  }
  return lines.join("\n");
}
