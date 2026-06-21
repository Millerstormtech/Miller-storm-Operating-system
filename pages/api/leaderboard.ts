import type { NextApiRequest, NextApiResponse } from "next";
import { connectMongo } from "../../src/lib/mongodb";
import { LeaderboardEntryModel } from "../../src/lib/models/LeaderboardEntry";
import { CourseModel } from "../../src/lib/models/Course";
import { UserModel } from "../../src/lib/models/User";
import { UserProgressModel } from "../../src/lib/models/UserProgress";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).end();
  }

  await connectMongo();

  const { courseId, managerId } = req.query;

  // If courseId is provided, return course leaderboard
  if (courseId) {
    // Fetch course
    const course = await CourseModel.findOne({ id: courseId }).lean();
    if (!course) {
      return res.status(404).json({ error: "Course not found" });
    }

    // Fetch users
    let usersQuery: any = {
      $or: [
        { role: "manager" },
        { role: "sales" },
        { roles: { $in: ["manager", "sales"] } }
      ],
      deleted: { $ne: true },
      suspended: { $ne: true }
    };

    // If managerId is provided, only get that manager's team
    if (managerId) {
      usersQuery.managerId = managerId;
      usersQuery.role = "sales";
    }

    const users = await UserModel.find(usersQuery).lean();

    // Fetch all progress for these users and this course
    const userIds = users.map(u => u.id);
    const progressRecords = await UserProgressModel.find({
      userId: { $in: userIds },
      courseId: courseId
    }).lean();

    // Create progress map
    const progressMap = new Map();
    progressRecords.forEach(progress => {
      progressMap.set(progress.userId, progress);
    });

    // Filter published lessons
    const publishedFolderIds = new Set(
      (course.folders || [])
        .filter((f: any) => f.status === "published")
        .map((f: any) => f.id)
    );
    const lessonPages = (course.pages || []).filter(
      (p: any) => 
        p.status === "published" && 
        !p.isQuiz && 
        (!p.folderId || publishedFolderIds.has(p.folderId))
    );
    const lessonIds = new Set(lessonPages.map((p: any) => p.id));
    const total = lessonPages.length;

    // Build leaderboard rows
      const rows = users.map(u => {
        const progress = progressMap.get(u.id);
        const done = (progress?.completedPages || []).filter((id: string) => lessonIds.has(id)).length;
        const pct = total > 0 ? Math.round((done / total) * 100) : 0;
        return {
          id: u.id,
          name: u.name || u.email,
          email: u.email,
          role: u.role || (u.roles || [])[0] || "",
          headshotUrl: u.headshotUrl || "",
          done,
          total,
          pct
        };
      });

    // Sort rows
    rows.sort((a, b) => b.pct - a.pct || a.name.localeCompare(b.name));

    return res.status(200).json({
      course: {
        id: course.id,
        title: course.title
      },
      rows,
      total
    });
  }

  // Original sales leaderboard
  const [inspections, claims] = await Promise.all([
    LeaderboardEntryModel.find({}, "repName inspectionCount")
      .sort({ inspectionCount: -1 })
      .lean(),
    LeaderboardEntryModel.find({}, "repName claimCount revenueTotal")
      .sort({ claimCount: -1 })
      .lean(),
  ]);

  return res.status(200).json({ inspections, claims });
}
