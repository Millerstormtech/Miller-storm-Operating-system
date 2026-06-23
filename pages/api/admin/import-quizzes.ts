import type { NextApiRequest, NextApiResponse } from "next";
import { connectMongo } from "../../../src/lib/mongodb";
import { CourseModel } from "../../../src/lib/models/Course";
import { requireRole, allowMethods } from "../../../src/lib/auth";
import { parseQuizDoc, validateParsed, buildImportPlan } from "../../../src/lib/quizImport";
import type { Course } from "../../../src/types";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "10mb",
    },
  },
};

/**
 * Bulk-import quizzes after lessons from a plain-language document.
 *
 * POST body: { doc: string, dryRun?: boolean }
 *   - dryRun true  -> parse + match + return a report, NO database writes.
 *   - dryRun false -> also persist the updated courses.
 *
 * Returns: { ok, report, parseError?, validationErrors?, courses? }
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!allowMethods(req, res, ["POST"])) return;
  if (!requireRole(req, res, "admin")) return;

  const doc: string = req.body?.doc ?? "";
  const dryRun: boolean = req.body?.dryRun !== false; // default to preview-only

  if (typeof doc !== "string" || !doc.trim()) {
    res.status(400).json({ ok: false, error: "Missing 'doc' text." });
    return;
  }

  // 1. Parse
  let parsed;
  try {
    parsed = parseQuizDoc(doc);
  } catch (e: any) {
    res.status(200).json({ ok: false, parseError: e.message });
    return;
  }

  // 2. Validate document contents
  const validationErrors = validateParsed(parsed);
  if (validationErrors.length) {
    res.status(200).json({ ok: false, validationErrors });
    return;
  }

  // 3. Build the plan against current DB courses
  try {
    await connectMongo();
    const courseDocs = (await CourseModel.find({}).lean()) as unknown as Course[];
    const { updatedCourses, report } = buildImportPlan(courseDocs, parsed);

    if (dryRun) {
      res.status(200).json({ ok: true, dryRun: true, report });
      return;
    }

    // 4. Persist only the courses that changed
    if (updatedCourses.length) {
      const bulkOps = updatedCourses.map((course) => ({
        updateOne: {
          filter: { id: course.id },
          update: { $set: { pages: course.pages } },
          upsert: false,
        },
      }));
      await CourseModel.bulkWrite(bulkOps as any);
    }

    // Return the freshly saved courses so the UI can refresh its state.
    const savedCourses = await CourseModel.find({
      id: { $in: updatedCourses.map((c) => c.id) },
    }).lean();

    res.status(200).json({ ok: true, dryRun: false, report, courses: savedCourses });
  } catch (e: any) {
    console.error("[Import Quizzes] Error:", e);
    res.status(500).json({ ok: false, error: "Failed to import quizzes." });
  }
}
