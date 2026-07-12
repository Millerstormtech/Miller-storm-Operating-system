import type { NextApiRequest, NextApiResponse } from 'next';
import { connectMongo } from '../../../src/lib/mongodb';
import PlaylistAssignment from '../../../src/lib/models/PlaylistAssignment';
import { CourseModel } from '../../../src/lib/models/Course';
import { UserProgressModel } from '../../../src/lib/models/UserProgress';
import { NotificationModel } from '../../../src/lib/models/Notification';
import { UserModel } from '../../../src/lib/models/User';
import { isQuizResultPassing } from '../../../src/lib/quiz';
import { sendManagerDeadlineMissedEmail } from '../../../src/lib/email';
import { requireRole, allowMethods } from '../../../src/lib/auth';

// Scans playlist assignments whose deadline has passed and whose assigned user
// has not finished every module (lessons watched + quizzes passed). For each
// such assignment it notifies the manager once and marks it as notified so we
// never double-notify. Assignments completed in time are silently marked done.
//
// Safe to call repeatedly (idempotent via the `deadlineNotified` flag). The
// optional `managerId` query param scopes the scan to one manager's
// assignments so loading a single manager's portal stays cheap.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!allowMethods(req, res, ['GET', 'POST'])) return;

  // Managers may trigger this (e.g. when their training portal loads) but only
  // for their OWN team; admins may scope to any manager (or all when omitted).
  // This is the fix for deadline emails never sending — the manager portal was
  // calling an admin-only endpoint and silently getting a 403.
  const session = requireRole(req, res, ['admin', 'manager', 'c-level']);
  if (!session) return;

  await connectMongo();

  try {
    const isManager = session.role === 'manager';
    const managerId = isManager ? session.sub : req.query.managerId;
    const now = new Date();

    const query: any = {
      deadline: { $ne: null, $lte: now },
      deadlineNotified: { $ne: true }
    };
    if (managerId) {
      query.managerId = managerId;
    }

    const overdue = await PlaylistAssignment.find(query);

    // Cache courses so multiple assignments on the same course only load once.
    const courseCache = new Map<string, any>();
    const getCourse = async (courseId: string) => {
      if (courseCache.has(courseId)) return courseCache.get(courseId);
      const course = await CourseModel.findOne({ id: courseId }).lean();
      courseCache.set(courseId, course);
      return course;
    };

    // Cache manager emails the same way so one manager is only looked up once.
    const managerEmailCache = new Map<string, string | null>();
    const getManagerEmail = async (managerId: string) => {
      if (managerEmailCache.has(managerId)) return managerEmailCache.get(managerId) ?? null;
      const manager = await UserModel.findOne({ id: managerId }).lean<any>();
      const email = manager?.email ?? null;
      managerEmailCache.set(managerId, email);
      return email;
    };

    let notified = 0;
    let completed = 0;

    for (const assignment of overdue) {
      const course = await getCourse(assignment.courseId);
      const progress = await UserProgressModel.findOne({
        userId: assignment.assignedToUserId,
        courseId: assignment.courseId
      }).lean<any>();

      const completedPages: string[] = progress?.completedPages || [];
      const quizResults: any[] = progress?.quizResults || [];
      const pagesById = new Map<string, any>(
        (course?.pages || []).map((p: any) => [p.id, p])
      );

      // A module is "done" when: a quiz page has a passing result, or a
      // lesson page is marked complete (video watched through). Modules we
      // can't resolve to a page fall back to the completedPages check.
      const isModuleDone = (moduleId: string) => {
        const page = pagesById.get(moduleId);
        if (page?.isQuiz) {
          return isQuizResultPassing(quizResults.find((r) => r.pageId === moduleId));
        }
        return completedPages.includes(moduleId);
      };

      const modules: string[] = assignment.selectedModules || [];
      const allDone = modules.length > 0 && modules.every(isModuleDone);

      if (allDone) {
        assignment.completedAt = assignment.completedAt || now;
        assignment.deadlineNotified = true;
        await assignment.save();
        completed++;
        continue;
      }

      const doneCount = modules.filter(isModuleDone).length;
      const deadlineLabel = assignment.deadline
        ? new Date(assignment.deadline).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
          })
        : 'the deadline';

      await NotificationModel.create({
        id: `notif-${Date.now()}-${assignment._id}`,
        userId: assignment.managerId,
        type: 'playlist-deadline-missed',
        title: 'Training deadline missed',
        message: `${assignment.assignedToUserName} missed the ${deadlineLabel} deadline for "${assignment.playlistName}" (${doneCount}/${modules.length} modules complete).`,
        metadata: {
          assignmentId: String(assignment._id),
          playlistId: assignment.playlistId,
          playlistName: assignment.playlistName,
          courseId: assignment.courseId,
          assignedToUserId: assignment.assignedToUserId,
          assignedToUserName: assignment.assignedToUserName,
          completedModules: doneCount,
          totalModules: modules.length,
          deadline: assignment.deadline
        }
      });

      // Email the manager too (best-effort: never let an email failure block the
      // in-app notification or the rest of the scan).
      try {
        const managerEmail = await getManagerEmail(assignment.managerId);
        if (managerEmail) {
          await sendManagerDeadlineMissedEmail({
            managerName: assignment.managerName,
            managerEmail,
            userName: assignment.assignedToUserName,
            playlistName: assignment.playlistName,
            deadline: deadlineLabel,
            completedModules: doneCount,
            totalModules: modules.length,
          });
        }
      } catch (emailErr) {
        console.error('Failed to send deadline-missed email to manager:', emailErr);
      }

      assignment.deadlineNotified = true;
      await assignment.save();
      notified++;
    }

    return res.status(200).json({ checked: overdue.length, notified, completed });
  } catch (error) {
    console.error('Error checking playlist deadlines:', error);
    return res.status(500).json({ error: 'Failed to check deadlines' });
  }
}
