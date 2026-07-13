import type { NextApiRequest, NextApiResponse } from "next";
import { connectMongo } from "../../../src/lib/mongodb";
import { UserModel } from "../../../src/lib/models/User";
import { CourseModel } from "../../../src/lib/models/Course";
import { UserProgressModel } from "../../../src/lib/models/UserProgress";
import { requireRole, allowMethods } from "../../../src/lib/auth";

// Admin-only per-role dashboard data. Given ?role=<roleKey>, returns every
// (non-deleted) user with that role plus their training progress (courses done /
// overall lesson completion) and their business-plan summary. Rendered inside
// the admin panel — the admin never leaves /admin.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!allowMethods(req, res, ["GET"])) return;
  if (!requireRole(req, res, "admin")) return;

  const role = String(req.query.role || "").trim();
  if (!role) return res.status(400).json({ error: "role is required" });

  await connectMongo();

  try {
    // Users holding this role (primary field OR in the roles[] array).
    const users = await UserModel.find({
      deleted: { $ne: true },
      $or: [{ role }, { roles: role }],
    })
      .select("id name email role roles headshotUrl businessPlan managerId suspended")
      .lean();

    // Published courses -> published, non-quiz lesson pages (folder must also be
    // published). Mirrors the leaderboard's lesson-counting logic.
    const courses = await CourseModel.find(
      { status: "published" },
      { id: 1, title: 1, pages: 1, folders: 1 }
    ).lean();

    const courseLessons = courses.map((c: any) => {
      const pubFolders = new Set(
        (c.folders || []).filter((f: any) => f.status === "published").map((f: any) => f.id)
      );
      const lessonIds = (c.pages || [])
        .filter(
          (p: any) =>
            p.status === "published" && !p.isQuiz && (!p.folderId || pubFolders.has(p.folderId))
        )
        .map((p: any) => p.id);
      return { id: c.id, title: c.title, lessonIds };
    });

    const coursesWithLessons = courseLessons.filter((c) => c.lessonIds.length > 0);
    const allLessonIds = new Set<string>(coursesWithLessons.flatMap((c) => c.lessonIds));
    const totalLessons = allLessonIds.size;
    const totalCourses = coursesWithLessons.length;

    const userIds = users.map((u: any) => u.id);
    const progress = await UserProgressModel.find({ userId: { $in: userIds } })
      .select("userId completedPages")
      .lean();
    const doneByUser = new Map<string, Set<string>>();
    for (const p of progress as any[]) {
      doneByUser.set(p.userId, new Set<string>(p.completedPages || []));
    }

    const rows = users.map((u: any) => {
      const done = doneByUser.get(u.id) || new Set<string>();
      let doneLessons = 0;
      for (const id of allLessonIds) if (done.has(id)) doneLessons++;
      const coursesCompleted = coursesWithLessons.filter(
        (c) => c.lessonIds.length > 0 && c.lessonIds.every((id: string) => done.has(id))
      ).length;
      const pct = totalLessons > 0 ? Math.round((doneLessons / totalLessons) * 100) : 0;
      const bp = u.businessPlan || null;
      return {
        id: u.id,
        name: u.name || u.email,
        email: u.email,
        role: u.role || (u.roles || [])[0] || "",
        headshotUrl: u.headshotUrl || "",
        suspended: !!u.suspended,
        doneLessons,
        totalLessons,
        pct,
        coursesCompleted,
        totalCourses,
        businessPlan: bp
          ? { revenueGoal: bp.revenueGoal ?? null, committed: !!bp.committed }
          : null,
      };
    });

    rows.sort((a, b) => b.pct - a.pct || a.name.localeCompare(b.name));

    return res.status(200).json({ role, totalCourses, totalLessons, rows });
  } catch (err) {
    console.error("role-dashboard error", err);
    return res.status(500).json({ error: "Failed to load role dashboard" });
  }
}
