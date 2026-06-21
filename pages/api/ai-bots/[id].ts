import type { NextApiRequest, NextApiResponse } from "next";
import { connectMongo } from "../../../src/lib/mongodb";
import { AiBotModel } from "../../../src/lib/models/AiBot";
import { CourseModel } from "../../../src/lib/models/Course";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await connectMongo();
  const { id } = req.query as { id: string };

  if (req.method === "GET") {
    const bot = await AiBotModel.findOne({ id }).lean();
    if (!bot) return res.status(404).json({ error: "Not found" });
    return res.status(200).json(normalizeBot(bot));
  }

  if (req.method === "PATCH") {
    const { _id, id: _id2, ...safeUpdates } = req.body;
    
    // If course selection changed, rebuild courseTrainingText
    if (safeUpdates.selectedPages !== undefined || safeUpdates.selectedCourses !== undefined || safeUpdates.selectedFolders !== undefined) {
      console.log('[Master Bot API] Course selection changed, rebuilding training text');
      const bot = await AiBotModel.findOne({ id }).lean() as any;
      const selectedPages: string[] = safeUpdates.selectedPages ?? bot?.selectedPages ?? [];
      console.log('[Master Bot API] Selected pages:', selectedPages);

      if (selectedPages.length > 0) {
        const courses = await CourseModel.find({}).lean() as any[];
        console.log('[Master Bot API] Found courses:', courses.length);
        let courseTrainingText = "";

        for (const course of courses) {
          const coursePages = (course.pages || []).filter((p: any) => selectedPages.includes(p.id));
          if (coursePages.length === 0) continue;

          courseTrainingText += `\n\n=== COURSE: ${course.title} ===\n`;
          if (course.description) {
            courseTrainingText += `Course Description: ${course.description}\n\n`;
          }
          
          for (const page of coursePages) {
            courseTrainingText += `\n--- LESSON: ${page.title} ---\n`;
            
            // Add lesson content
            if (page.body) {
              courseTrainingText += `Lesson Content:\n${page.body}\n\n`;
            }
            
            // Add transcript if available
            if (page.transcript) {
              courseTrainingText += `Lesson Transcript:\n${page.transcript}\n\n`;
            }
            
            // Add any additional context
            if (page.summary) {
              courseTrainingText += `Lesson Summary:\n${page.summary}\n\n`;
            }
          }
        }
        
        safeUpdates.courseTrainingText = courseTrainingText.trim();
        console.log('[Master Bot API] Generated training text length:', courseTrainingText.length);
        console.log('[Master Bot API] Training text preview:', courseTrainingText.substring(0, 500) + '...');
      } else {
        safeUpdates.courseTrainingText = "";
        console.log('[Master Bot API] No pages selected, clearing training text');
      }
    }
    
    // For Mixed type fields like teamMemberAccess, use findOne + save to ensure markModified works
    const botDoc = await AiBotModel.findOne({ id });
    if (!botDoc) return res.status(404).json({ error: "Not found" });
    Object.assign(botDoc, safeUpdates);
    if (safeUpdates.teamMemberAccess !== undefined) {
      botDoc.markModified("teamMemberAccess");
    }
    await botDoc.save();
    const saved = botDoc.toObject();
    console.log('[Master Bot API] Bot saved successfully');
    return res.status(200).json(normalizeBot(saved));
  }

  if (req.method === "DELETE") {
    await AiBotModel.findOneAndUpdate({ id }, { $set: { isActive: false } });
    return res.status(200).json({ ok: true });
  }

  res.setHeader("Allow", ["GET", "PATCH", "DELETE"]);
  res.status(405).end();
}

function normalizeBot(doc: any) {
  const { _id, __v, ...rest } = doc;
  // Ensure all appearance/settings fields have defaults so they're never undefined
  return {
    ...rest,
    status: rest.status ?? 'draft',
    botTitle: rest.botTitle ?? "",
    displayMessage: rest.displayMessage ?? "",
    displayMessageEnabled: rest.displayMessageEnabled ?? false,
    welcomeMessage: rest.welcomeMessage ?? "Hi, How can I help you today?",
    showWelcomePopup: rest.showWelcomePopup ?? true,
    placeholder: rest.placeholder ?? "Ask me anything...",
    suggestions: rest.suggestions ?? [],
    removeSuggestionsAfterFirst: rest.removeSuggestionsAfterFirst ?? false,
    colorTheme: rest.colorTheme ?? "#3b82f6",
    botAvatarUrl: rest.botAvatarUrl ?? "",
    chatIconSize: rest.chatIconSize ?? 60,
    enterMessage: rest.enterMessage ?? "Chat Now",
    attentionSound: rest.attentionSound ?? "None",
    attentionAnimation: rest.attentionAnimation ?? "None",
    immediatelyOpenChat: rest.immediatelyOpenChat ?? false,
    leadCollection: rest.leadCollection ?? false,
    privacyPolicyEnabled: rest.privacyPolicyEnabled ?? true,
    privacyActionText: rest.privacyActionText ?? "Read our",
    privacyLinkText: rest.privacyLinkText ?? "Privacy Policy",
    privacyLink: rest.privacyLink ?? "",
    isPublic: rest.isPublic ?? false,
    assignedRoles: rest.assignedRoles ?? [],
    teamMembers: rest.teamMembers ?? [],
    teamMemberAccess: rest.teamMemberAccess ?? {},
    trainingLinks: rest.trainingLinks ?? [],
    qaItems: rest.qaItems ?? [],
    selectedCourses: rest.selectedCourses ?? [],
    selectedFolders: rest.selectedFolders ?? [],
    selectedPages: rest.selectedPages ?? [],
    courseTrainingText: rest.courseTrainingText ?? "",
  };
}
