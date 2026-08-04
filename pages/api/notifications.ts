import type { NextApiRequest, NextApiResponse } from "next";
import { connectMongo } from "../../src/lib/mongodb";
import { NotificationModel } from "../../src/lib/models/Notification";
import { TaskModel } from "../../src/lib/models/Task";
import { requireUser, allowMethods } from "../../src/lib/auth";
import { todayString } from "../../src/lib/tasks/permissions";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (!allowMethods(req, res, ["GET", "POST", "PUT", "DELETE"])) return;

  const auth = requireUser(req, res);
  if (!auth) return;

  await connectMongo();

  if (req.method === "GET") {
    // A user reads their OWN notifications — identity comes from the session.
    const userId = auth.sub;
    // Both consumers (NotificationBell, NewCoursePopup) show ONLY unread items,
    // so return unread only. Read notifications are dead weight in the payload
    // and the reason the collection grows without bound. Cap at 200 as a safety
    // valve — the bell badge already renders "99+", so more than that is moot.
    // Due-today / overdue reminder, computed here rather than by a cron. An
    // in-app bell is only ever read by someone already in the app, so generating
    // the reminder at read time is indistinguishable from a scheduled one, and it
    // avoids adding a sixth PM2 process.
    const today = todayString();
    const dueId = `task-due-${userId}-${today}`;
    const alreadyToldToday = await NotificationModel.exists({ id: dueId });
    if (!alreadyToldToday) {
      const dueCount = await TaskModel.countDocuments({
        assignedTo: userId,
        deleted: { $ne: true },
        status: { $ne: "done" },
        deadline: { $lte: today }
      });
      if (dueCount > 0) {
        // One per user per day, not one per task, so the bell is not flooded.
        // The unique index on Notification.id makes the dedupe race-proof.
        await NotificationModel.create({
          id: dueId,
          userId,
          type: "task_due",
          title: dueCount === 1 ? "1 task needs attention" : `${dueCount} tasks need attention`,
          message: "You have work due today or overdue.",
          read: false,
          metadata: { count: dueCount, date: today }
        }).catch(() => {
          // A concurrent poll won the race and created it first. Nothing to do.
        });
      }
    }

    const notifications = await NotificationModel.find({ userId, read: false })
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();
    res.status(200).json(notifications);
    return;
  }

  if (req.method === "POST") {
    const notification = await NotificationModel.create({
      id: `notif-${Date.now()}`,
      ...req.body
    });
    res.status(201).json(notification);
    return;
  }

  if (req.method === "PUT") {
    const { id } = req.body;
    await NotificationModel.updateOne({ id }, { read: true });
    res.status(200).json({ success: true });
    return;
  }

  if (req.method === "DELETE") {
    const { id } = req.body;
    await NotificationModel.deleteOne({ id });
    res.status(200).json({ success: true });
    return;
  }

  res.setHeader("Allow", "GET, POST, PUT, DELETE");
  res.status(405).end();
}
