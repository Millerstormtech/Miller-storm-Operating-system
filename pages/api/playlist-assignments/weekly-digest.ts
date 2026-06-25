import type { NextApiRequest, NextApiResponse } from "next";
import { connectMongo } from "../../../src/lib/mongodb";
import PlaylistAssignment from "../../../src/lib/models/PlaylistAssignment";
import { CourseModel } from "../../../src/lib/models/Course";
import { UserProgressModel } from "../../../src/lib/models/UserProgress";
import { UserModel } from "../../../src/lib/models/User";
import { isQuizResultPassing } from "../../../src/lib/quiz";
import { sendWeeklyTeamDigestEmail } from "../../../src/lib/email";

// Weekly digest: one email per manager summarizing, per assigned playlist, who
// has completed / is in progress / has not started their assigned videos.
//
// Trigger: the weekly cron (scripts/weekly-digest-cron.js) every Monday, or an
// admin manually. Authorization mirrors the AccuLynx sync endpoint:
//   1. x-sync-secret header === ACCULYNX_SYNC_SECRET (server-trusted, for cron)
//   2. body.userId resolves to an admin (the existing client-trust pattern)
// Pass { dryRun: true } to compute + return a preview without sending email.
async function authorize(req: NextApiRequest): Promise<boolean> {
  const secret = req.headers["x-sync-secret"];
  if (secret && secret === process.env.ACCULYNX_SYNC_SECRET) return true;
  const userId = (req.body?.userId as string) || "";
  if (!userId) return false;
  await connectMongo();
  const user = await UserModel.findOne({ id: userId, deleted: { $ne: true } }).lean<any>();
  return user?.role === "admin" || (user?.roles ?? []).includes("admin");
}

type Row = { userName: string; status: "completed" | "in_progress" | "not_started"; done: number; total: number };

function statusLabel(s: Row["status"]): string {
  if (s === "completed") return "✅ Completed";
  if (s === "in_progress") return "⚠️ In Progress";
  return "❌ Not Started";
}

// Build a single-line HTML block (no newlines) of one table per playlist.
function buildTeamTableHtml(playlists: { name: string; total: number; rows: Row[] }[]): string {
  if (!playlists.length) {
    return `<div style="color:#6b7280;font-size:14px;">No playlists assigned to your team yet.</div>`;
  }
  const blocks = playlists.map((pl) => {
    const rows = pl.rows
      .map(
        (r) =>
          `<tr><td style="padding:8px;border:1px solid #e5e7eb;">${r.userName}</td>` +
          `<td style="padding:8px;border:1px solid #e5e7eb;">${statusLabel(r.status)}</td>` +
          `<td style="padding:8px;border:1px solid #e5e7eb;">${r.done}/${r.total}</td></tr>`
      )
      .join("");
    return (
      `<div style="margin:0 0 22px;">` +
      `<div style="font-weight:700;font-size:15px;color:#111827;margin:0 0 8px;">📋 ${pl.name} (${pl.total} videos)</div>` +
      `<table style="width:100%;border-collapse:collapse;font-size:14px;color:#374151;">` +
      `<tr style="background:#f3f4f6;">` +
      `<th style="text-align:left;padding:8px;border:1px solid #e5e7eb;">Team Member</th>` +
      `<th style="text-align:left;padding:8px;border:1px solid #e5e7eb;">Status</th>` +
      `<th style="text-align:left;padding:8px;border:1px solid #e5e7eb;">Progress</th>` +
      `</tr>${rows}</table></div>`
    );
  });
  return blocks.join("").replace(/\n\s*/g, "");
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).end(); }
  if (!(await authorize(req))) return res.status(401).json({ error: "unauthorized" });

  const dryRun = req.body?.dryRun === true;
  await connectMongo();

  try {
    const assignments = await PlaylistAssignment.find({}).lean<any[]>();

    // Caches so each course / progress record loads at most once.
    const courseCache = new Map<string, any>();
    const getCourse = async (courseId: string) => {
      if (courseCache.has(courseId)) return courseCache.get(courseId);
      const course = await CourseModel.findOne({ id: courseId }).lean();
      courseCache.set(courseId, course);
      return course;
    };
    const progressCache = new Map<string, any>();
    const getProgress = async (userId: string, courseId: string) => {
      const key = `${userId}::${courseId}`;
      if (progressCache.has(key)) return progressCache.get(key);
      const p = await UserProgressModel.findOne({ userId, courseId }).lean<any>();
      progressCache.set(key, p);
      return p;
    };

    // managerId -> playlistId -> { name, total, rows }
    const byManager = new Map<string, Map<string, { name: string; total: number; rows: Row[] }>>();

    for (const a of assignments) {
      const course = await getCourse(a.courseId);
      const progress = await getProgress(a.assignedToUserId, a.courseId);
      const completedPages: string[] = progress?.completedPages || [];
      const quizResults: any[] = progress?.quizResults || [];
      const pagesById = new Map<string, any>((course?.pages || []).map((p: any) => [p.id, p]));

      const isModuleDone = (moduleId: string) => {
        const page = pagesById.get(moduleId);
        if (page?.isQuiz) return isQuizResultPassing(quizResults.find((r) => r.pageId === moduleId));
        return completedPages.includes(moduleId);
      };

      const modules: string[] = a.selectedModules || [];
      const total = modules.length;
      const done = modules.filter(isModuleDone).length;
      const status: Row["status"] = total > 0 && done >= total ? "completed" : done > 0 ? "in_progress" : "not_started";

      if (!byManager.has(a.managerId)) byManager.set(a.managerId, new Map());
      const playlists = byManager.get(a.managerId)!;
      if (!playlists.has(a.playlistId)) playlists.set(a.playlistId, { name: a.playlistName, total, rows: [] });
      const pl = playlists.get(a.playlistId)!;
      if (total > pl.total) pl.total = total; // keep the fullest module count seen
      pl.rows.push({ userName: a.assignedToUserName, status, done, total });
    }

    // Resolve manager emails and send.
    const summary: { manager: string; email: string | null; playlists: number; sent: boolean }[] = [];
    for (const [managerId, playlists] of byManager) {
      const manager = await UserModel.findOne({ id: managerId, deleted: { $ne: true } }).lean<any>();
      const managerEmail = manager?.email ?? null;
      const managerName = manager?.name || "Manager";
      const playlistList = Array.from(playlists.values());
      const tableHtml = buildTeamTableHtml(playlistList);

      let sent = false;
      if (!dryRun && managerEmail) {
        try {
          await sendWeeklyTeamDigestEmail({ managerName, managerEmail, teamTableHtml: tableHtml });
          sent = true;
        } catch (e) {
          console.error(`[Weekly Digest] Failed to email ${managerEmail}:`, e);
        }
      }
      summary.push({ manager: managerName, email: managerEmail, playlists: playlistList.length, sent });
    }

    console.log(`[Weekly Digest] ${dryRun ? "DRY RUN" : "Sent"} for ${summary.length} manager(s)`);
    return res.status(200).json({ ok: true, dryRun, managers: summary.length, summary });
  } catch (error) {
    console.error("[Weekly Digest] Error:", error);
    return res.status(500).json({ ok: false, error: "Failed to build weekly digest" });
  }
}
