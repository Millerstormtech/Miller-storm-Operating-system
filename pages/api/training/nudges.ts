// POST /api/training/nudges
// Nudges reps who stall partway through a course (2026-09-13). Triggered once a
// day by the training-nudge PM2 cron; safe to call by hand. The endpoint does
// the work and the cron only keeps the clock, like monthly-king.
//
// TRAINING_NUDGE_MODE in the app's .env decides what a call does:
//   off  nothing;
//   dry  (the default when unset) reports who WOULD be nudged and writes nothing;
//   on   sends: a bell item that opens the next lesson, and a phone push.
// A caller can always ask for a dry run ({ "dryRun": true }), never for a real
// send the server is not set to make.
import type { NextApiRequest, NextApiResponse } from "next";
import { connectMongo } from "../../../src/lib/mongodb";
import { UserModel } from "../../../src/lib/models/User";
import { CourseModel } from "../../../src/lib/models/Course";
import { UserProgressModel } from "../../../src/lib/models/UserProgress";
import { QuizAttemptModel } from "../../../src/lib/models/QuizAttempt";
import { NotificationModel } from "../../../src/lib/models/Notification";
import { TrainingNudgeModel } from "../../../src/lib/models/TrainingNudge";
import { logToDb } from "../../../src/lib/models/SystemLog";
import { sendPushNotification } from "../../../src/lib/firebase-admin";
import { isRankedUser } from "../../../src/lib/training/scoring";
import { pickNudge, nudgeMessage, DAY_MS, type NudgePlan, type NudgeProgress, type PastNudge } from "../../../src/lib/training/nudge";
import { centralDateStr } from "../../../src/lib/acculynx/windows";

const COURSE_SELECT = "id title status folders pages.id pages.title pages.status pages.isQuiz pages.isFinalTest pages.folderId";
// Enough nudge history for the weekly limit and the three-unanswered limit.
const HISTORY_DAYS = 180;
// Failed quiz attempts count as activity; only recent ones can matter.
const ATTEMPT_DAYS = 30;

// Authorization mirrors pages/api/stormbot/monthly-king.ts, including its note
// on the body userId path.
async function authorize(req: NextApiRequest): Promise<boolean> {
  const secret = req.headers["x-sync-secret"];
  if (secret && secret === process.env.ACCULYNX_SYNC_SECRET) return true;
  const userId = (req.body?.userId as string) || "";
  if (!userId) return false;
  await connectMongo();
  const user: any = await UserModel.findOne({ id: userId, deleted: { $ne: true } }).lean();
  return user?.role === "admin" || (user?.roles ?? []).includes("admin");
}

function serverMode(): "off" | "dry" | "on" {
  const raw = String(process.env.TRAINING_NUDGE_MODE || "").trim().toLowerCase();
  return raw === "on" || raw === "off" ? raw : "dry";
}

const trainingRoute = (role: string) => (role === "sales" ? "/sales/training" : "/manager/onlineTraining");

function groupBy<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const k = key(row);
    const list = map.get(k);
    if (list) list.push(row);
    else map.set(k, [row]);
  }
  return map;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).end();
  }
  if (!(await authorize(req))) return res.status(401).json({ error: "unauthorized" });

  const setting = serverMode();
  if (setting === "off") return res.status(200).json({ mode: "off", nudges: 0 });
  const mode = req.body?.dryRun === true ? "dry" : setting;

  try {
    await connectMongo();
    const now = new Date();

    // The people the training board ranks: no deleted, suspended, test or shared accounts.
    const users: any[] = await UserModel.find({
      role: { $in: ["sales", "sales-team-lead"] },
      deleted: { $ne: true },
      suspended: { $ne: true },
      testAccount: { $ne: true },
    })
      .select("id name email role fcmToken")
      .lean();
    const reps = users.filter((u) => isRankedUser({ role: u.role, email: u.email }));
    const repIds = reps.map((u) => String(u.id));

    const [courses, progressRows, attemptRows, nudgeRows] = await Promise.all([
      CourseModel.find({ status: "published" }).select(COURSE_SELECT).lean(),
      UserProgressModel.find({ userId: { $in: repIds } })
        .select("userId courseId courseCompleted completedPages quizResults.pageId quizResults.passed quizResults.score quizResults.submittedAt pageCompletions")
        .lean(),
      QuizAttemptModel.find({ userId: { $in: repIds }, submittedAt: { $gte: new Date(now.getTime() - ATTEMPT_DAYS * DAY_MS) } })
        .select("userId courseId submittedAt")
        .lean(),
      TrainingNudgeModel.find({ userId: { $in: repIds }, sentAt: { $gte: new Date(now.getTime() - HISTORY_DAYS * DAY_MS) } })
        .select("userId courseId sentAt")
        .lean(),
    ]);

    const progressByRep = groupBy(progressRows as any[], (p) => String(p.userId));
    const attemptsByRepCourse = groupBy(attemptRows as any[], (a) => `${a.userId}|${a.courseId}`);
    const nudgesByRep = groupBy(nudgeRows as any[], (n) => String(n.userId));

    const plans: { rep: any; plan: NudgePlan }[] = [];
    for (const rep of reps) {
      const progress: NudgeProgress[] = (progressByRep.get(String(rep.id)) || []).map((p: any) => ({
        courseId: String(p.courseId),
        courseCompleted: p.courseCompleted,
        completedPages: p.completedPages || [],
        quizResults: p.quizResults || [],
        pageCompletions: p.pageCompletions || [],
        attemptedAt: (attemptsByRepCourse.get(`${rep.id}|${p.courseId}`) || []).map((a: any) => a.submittedAt),
      }));
      const pastNudges: PastNudge[] = (nudgesByRep.get(String(rep.id)) || []).map((n: any) => ({
        courseId: String(n.courseId),
        sentAt: n.sentAt,
      }));
      const plan = pickNudge({ now: now.getTime(), courses: courses as any[], progress, pastNudges });
      if (plan) plans.push({ rep, plan });
    }

    const summary = {
      mode,
      reps: reps.length,
      nudges: plans.length,
      almostDone: plans.filter((p) => p.plan.reason === "almost-done").length,
      stalled: plans.filter((p) => p.plan.reason === "stalled").length,
    };

    if (mode === "dry") {
      await logToDb("info", "TRAINING-NUDGE", `dry run: would nudge ${plans.length} of ${reps.length} reps`, summary).catch(() => {});
      return res.status(200).json({
        ...summary,
        wouldNudge: plans.map(({ rep, plan }) => ({
          name: String(rep.name || "").trim(),
          role: rep.role,
          course: plan.courseTitle,
          reason: plan.reason,
          left: plan.lessonsLeft + plan.quizzesLeft,
          pct: plan.pct,
          idleDays: plan.idleDays,
          opens: plan.pageTitle,
          ...nudgeMessage(plan),
          push: !!rep.fcmToken,
        })),
      });
    }

    const day = centralDateStr(now);
    let sent = 0;
    let pushed = 0;
    let alreadyToday = 0;
    let failed = 0;
    for (const { rep, plan } of plans) {
      const notificationId = `notif-nudge-${rep.id}-${day}`;
      try {
        // Claim the day BEFORE sending: a second trigger today collides here
        // instead of nudging twice.
        try {
          await TrainingNudgeModel.create({
            userId: rep.id,
            day,
            courseId: plan.courseId,
            reason: plan.reason,
            left: plan.lessonsLeft + plan.quizzesLeft,
            pageId: plan.pageId,
            notificationId,
            sentAt: now,
          });
        } catch (e: any) {
          if (e?.code === 11000) {
            alreadyToday++;
            continue;
          }
          throw e;
        }
        const { title, body } = nudgeMessage(plan);
        await NotificationModel.create({
          id: notificationId,
          userId: rep.id,
          // new_training is the type the phone's bell and push handler open a
          // course for. Not course_added, so the web raises no pop-up for it.
          type: "new_training",
          title,
          message: body,
          read: false,
          metadata: {
            courseId: plan.courseId,
            courseName: plan.courseTitle,
            lessonId: plan.pageId,
            watchUrl: trainingRoute(rep.role),
            nudge: plan.reason,
          },
        });
        sent++;
        if (rep.fcmToken) {
          const ok = await sendPushNotification(String(rep.fcmToken), title, body, {
            type: "new_training",
            courseId: plan.courseId,
            courseName: plan.courseTitle,
            pageId: plan.pageId,
          });
          if (ok) {
            pushed++;
            await TrainingNudgeModel.updateOne({ userId: rep.id, day }, { $set: { pushed: true } }).catch(() => {});
          }
        }
      } catch (e: any) {
        failed++;
        await logToDb("error", "TRAINING-NUDGE", `nudge failed for ${rep.id}: ${e?.message}`).catch(() => {});
      }
    }

    const result = { ...summary, sent, pushed, alreadyToday, failed };
    await logToDb("info", "TRAINING-NUDGE", `nudged ${sent} of ${reps.length} reps (${pushed} by push)`, result).catch(() => {});
    return res.status(200).json(result);
  } catch (e: any) {
    await logToDb("error", "TRAINING-NUDGE", `run failed: ${e?.message}`).catch(() => {});
    return res.status(500).json({ error: "nudge run failed" });
  }
}
