import type { NextApiRequest, NextApiResponse } from "next";
import { connectMongo } from "../../../src/lib/mongodb";
import { DailyActivityModel } from "../../../src/lib/models/DailyActivity";
import { UserModel } from "../../../src/lib/models/User";
import { CourseModel } from "../../../src/lib/models/Course";
import { requireUser, allowMethods } from "../../../src/lib/auth";

// Admin report of daily rep activity.
//   GET /api/activity/report?date=YYYY-MM-DD   → every rep's totals for that day
//   GET /api/activity/report?userId=<id>&days=N → one rep's last N days
// Admin only: this is workforce usage data, never exposed to the rep it is about.

function todayUtc(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") { res.status(200).end(); return; }
  if (!allowMethods(req, res, ["GET"])) return;

  const auth = requireUser(req, res);
  if (!auth) return;
  if (auth.role !== "admin") {
    res.status(403).json({ error: "Admins only" });
    return;
  }

  try {
    await connectMongo();
    const userId = typeof req.query.userId === "string" ? req.query.userId : "";

    // ── One rep, recent days ────────────────────────────────────────────────
    if (userId) {
      const days = Math.min(Math.max(Number(req.query.days) || 14, 1), 92);
      const rows = await DailyActivityModel.find({ userId }).sort({ date: -1 }).limit(days).lean();
      const user = (await UserModel.findOne({ id: userId }, { id: 1, name: 1, email: 1, role: 1 }).lean()) as any;
      res.status(200).json({ user: user ? { id: user.id, name: user.name, email: user.email, role: user.role } : null, days: rows });
      return;
    }

    // ── All reps, a single day ──────────────────────────────────────────────
    const date = typeof req.query.date === "string" && req.query.date ? req.query.date : todayUtc();
    const rows = (await DailyActivityModel.find({ date }).lean()) as any[];

    // Join each row with the rep's name/role. One lookup for everyone present.
    const ids = rows.map((r) => r.userId);
    const users = (await UserModel.find(
      { id: { $in: ids } },
      { id: 1, name: 1, email: 1, role: 1 }
    ).lean()) as any[];
    const byId = new Map(users.map((u) => [u.id, u]));

    // Resolve course titles so the report can group each rep's videos/quizzes
    // under the course they belong to.
    const courseIds = new Set<string>();
    for (const r of rows) {
      for (const v of (r.videos || [])) if (v.courseId) courseIds.add(String(v.courseId));
      for (const q of (r.quizzes || [])) if (q.courseId) courseIds.add(String(q.courseId));
    }
    const courses = (await CourseModel.find(
      { id: { $in: Array.from(courseIds) } },
      { id: 1, title: 1 }
    ).lean()) as any[];
    const courseTitle = new Map(courses.map((c) => [c.id, c.title]));
    const withCourse = (v: any) => ({
      courseId: v.courseId, courseTitle: courseTitle.get(String(v.courseId)) || "Other",
      pageId: v.pageId, title: v.title, secondsWeb: v.secondsWeb || 0, secondsMobile: v.secondsMobile || 0,
    });

    const report = rows.map((r) => {
      const u = byId.get(r.userId);
      return {
        userId: r.userId,
        name: u?.name || r.userId,
        email: u?.email || "",
        role: u?.role || "",
        appSecondsWeb: r.appSecondsWeb || 0,
        appSecondsMobile: r.appSecondsMobile || 0,
        videoSecondsWeb: r.videoSecondsWeb || 0,
        videoSecondsMobile: r.videoSecondsMobile || 0,
        quizSecondsWeb: r.quizSecondsWeb || 0,
        quizSecondsMobile: r.quizSecondsMobile || 0,
        videos: (r.videos || []).map(withCourse),
        quizzes: (r.quizzes || []).map(withCourse),
      };
    });
    // Busiest reps first (by total app time).
    report.sort((a, b) => (b.appSecondsWeb + b.appSecondsMobile) - (a.appSecondsWeb + a.appSecondsMobile));

    res.status(200).json({ date, reps: report });
    return;
  } catch (error: any) {
    console.error("❌ Error building activity report:", error?.message || error);
    res.status(500).json({ error: "Failed to build report" });
    return;
  }
}
