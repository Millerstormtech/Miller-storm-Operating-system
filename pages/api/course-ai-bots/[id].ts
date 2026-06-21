import type { NextApiRequest, NextApiResponse } from "next";
import { connectMongo } from "../../../src/lib/mongodb";
import { CourseAiBotModel } from "../../../src/lib/models/CourseAiBot";
import { CourseModel } from "../../../src/lib/models/Course";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await connectMongo();
  const { id } = req.query as { id: string };

  if (req.method === "GET") {
    const bot = await CourseAiBotModel.findOne({ id }).lean();
    if (!bot) return res.status(404).json({ error: "Not found" });
    return res.status(200).json(bot);
  }

  if (req.method === "PATCH") {
    const updates = req.body;

    // Rebuild trainingText whenever selectedPages changes
    if (updates.selectedPages !== undefined || updates.selectedCourses !== undefined) {
      const bot = await CourseAiBotModel.findOne({ id }).lean() as any;
      const selectedPages: string[] = updates.selectedPages ?? bot?.selectedPages ?? [];

      if (selectedPages.length === 0) {
        updates.trainingText = "";
      } else {
        const courses = await CourseModel.find({}).lean() as any[];
        let trainingText = "";

        for (const course of courses) {
          const coursePages = (course.pages || []).filter((p: any) => selectedPages.includes(p.id));
          if (coursePages.length === 0) continue;

          trainingText += `\n\n=== COURSE: ${course.title} ===\n`;
          if (course.description) trainingText += `Description: ${course.description}\n`;

          for (const page of coursePages) {
            trainingText += `\n--- Lesson: ${page.title} ---\n`;

            // Strip HTML tags from body
            if (page.body) {
              const plainBody = page.body
                .replace(/<[^>]+>/g, " ")
                .replace(/&amp;/g, "&")
                .replace(/&lt;/g, "<")
                .replace(/&gt;/g, ">")
                .replace(/&nbsp;/g, " ")
                .replace(/\s{2,}/g, " ")
                .trim();
              if (plainBody) trainingText += plainBody + "\n";
            }

            if (page.transcript) trainingText += `\nTranscript:\n${page.transcript}\n`;

            if (page.resourceLinks?.length) {
              trainingText += `\nResources:\n`;
              page.resourceLinks.forEach((r: any) => { trainingText += `- ${r.label}: ${r.href}\n`; });
            }

            if (page.isQuiz && page.quizQuestions?.length) {
              trainingText += `\nQuiz Questions:\n`;
              page.quizQuestions.forEach((q: any, i: number) => {
                trainingText += `${i + 1}. ${q.prompt}\n`;
                (q.options || []).forEach((opt: string, oi: number) => {
                  trainingText += `   ${oi === q.correctIndex ? "✓" : " "} ${opt}\n`;
                });
              });
            }
          }
        }
        updates.trainingText = trainingText.trim();
      }
    }

    const updated = await CourseAiBotModel.findOneAndUpdate(
      { id },
      { $set: updates },
      { new: true, returnDocument: "after" }
    ).lean();

    if (!updated) return res.status(404).json({ error: "Not found" });
    return res.status(200).json(updated);
  }

  if (req.method === "DELETE") {
    await CourseAiBotModel.deleteOne({ id });
    return res.status(200).json({ ok: true });
  }

  res.setHeader("Allow", "GET, PATCH, DELETE");
  res.status(405).end();
}
