import type { NextApiRequest, NextApiResponse } from "next";
import { connectMongo } from "../../../src/lib/mongodb";
import { UserModel } from "../../../src/lib/models/User";
import { CourseModel } from "../../../src/lib/models/Course";
import { UserProgressModel } from "../../../src/lib/models/UserProgress";
import { requireRole, allowMethods } from "../../../src/lib/auth";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!allowMethods(req, res, ["GET"])) return;
  if (!requireRole(req, res, "admin")) return;

  await connectMongo();

  try {
    // Fetch all non-deleted users that are managers or sales
    const allUsers = await UserModel.find({
      deleted: { $ne: true },
      $or: [
        { role: "manager" },
        { role: "sales" },
        { roles: { $in: ["manager", "sales"] } },
      ],
    }).lean();

    // Fetch all published courses (with only necessary fields)
    const courses = await CourseModel.find(
      { status: "published" },
      { id: 1, title: 1, status: 1, pages: 1, folders: 1 }
    ).lean();

    if (!courses.length || !allUsers.length) {
      return res.status(200).json({ courses: [], users: allUsers, progress: [] });
    }

    // Fetch all progress records for these users and courses
    const courseIds = courses.map((c) => c.id);
    const userIds = allUsers.map((u) => u.id);
    const allProgress = await UserProgressModel.find({
      userId: { $in: userIds },
      courseId: { $in: courseIds },
    }).lean();

    return res.status(200).json({
      courses,
      users: allUsers,
      progress: allProgress,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch training executive data" });
  }
}
