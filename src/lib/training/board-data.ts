// Server-side board aggregation shared by /api/training/leaderboard and
// /api/training/rep/[id]. NOT pure (queries Mongo): the rules themselves stay
// in scoring.ts/board.ts; this module only assembles their inputs, so the two
// endpoints can never disagree. Caller must connectMongo() first.
import { credentialProgress } from "./credentials";
import { CourseModel } from "../models/Course";
import { UserModel } from "../models/User";
import { UserProgressModel } from "../models/UserProgress";
import {
  courseStats,
  type CourseStats,
  isRankedUser,
  RANKED_ROLES,
} from "./scoring";
import { aggregateOverall, type OverallRow } from "./board";
import { buildOrgChart, type OrgChart } from "../repcard/org-chart";
import { BRANCH_ORDER, officeToBranch } from "../repcard/branches";

export type BoardData = {
  /** Lean course docs, heavy per-page fields stripped. */
  courses: any[];
  totalCourses: number;
  totalItems: number;
  /** Started (ranked, sorted) then not-started (A-Z). */
  rows: OverallRow[];
  /** The ranked subset of rows, in rank order. */
  started: OverallRow[];
  /** Keyed `${userId}:${courseId}`. */
  progressByUserCourse: Map<string, any>;
  /** The org chart from User Management, for the viewer's own team too. */
  org: OrgChart;
};

export async function loadBoardData(): Promise<BoardData> {
  // Published courses, stripped of heavy per-page content at the DB level:
  // aggregation only needs page metadata (id/status/isQuiz/isFinalTest/folderId).
  const courses = await CourseModel.find({ status: "published" })
    .select(
      "-pages.body -pages.transcript -pages.quizQuestions -pages.resourceLinks -pages.fileUrls -pages.pinnedCommunityPostUrl -quizQuestions -links"
    )
    .lean();

  // Ranked = PRIMARY role only (never roles[]), minus deleted/suspended,
  // minus the scrub-list. Same rule as the legacy ?courseId= branch.
  const users = await UserModel.find({
    role: { $in: [...RANKED_ROLES] },
    deleted: { $ne: true },
    suspended: { $ne: true },
    testAccount: { $ne: true },
  })
    .select("id name email role headshotUrl territory managerId")
    .lean();
  const ranked = users.filter((u) => isRankedUser({ role: u.role, email: u.email }));

  // Each rep's team and branch come from the org chart in User Management, the
  // same rules every board uses (src/lib/repcard/org-chart.ts). Deleted accounts
  // are included so a rep whose Team Lead was deleted keeps that team until
  // reassigned; deleted reps themselves are not on this board (query above).
  const directory = await UserModel.find({ testAccount: { $ne: true } })
    .select("id name role managerId territory deleted")
    .lean();
  const org = buildOrgChart(directory as any[], BRANCH_ORDER, officeToBranch);

  // All progress for these reps across all courses, in one query.
  const userIds = ranked.map((u) => u.id);
  const progress = await UserProgressModel.find({ userId: { $in: userIds } })
    .select("userId courseId completedPages quizResults")
    .lean();
  const progressByUserCourse = new Map<string, any>();
  for (const p of progress) {
    progressByUserCourse.set(`${p.userId}:${p.courseId}`, p);
  }

  const totalCourses = courses.length;
  // Library size independent of any rep's progress: an empty roster must
  // still report the true item count.
  const totalItems = courses.reduce(
    (n, c: any) => n + courseStats(c, undefined).itemsTotal,
    0
  );

  const rows: OverallRow[] = ranked.map((u) => {
    const perCourse = courses.map((c: any) =>
      courseStats(c, progressByUserCourse.get(`${u.id}:${c.id}`))
    );
    const agg = aggregateOverall(perCourse);
    // Per-credential bars. Built from the SAME per-course stats as the overall
    // bar, so a rep's three tracks can never disagree with their percentage.
    const statsById = new Map<string, CourseStats>(
      courses.map((c: any, i: number): [string, CourseStats] => [String(c.id), perCourse[i]])
    );
    const credentials = credentialProgress(courses as any, statsById);
    // Team and Branch come from the rep's own profile only (MS-027): team
    // from their Team Lead, branch from their territory. A blank is the
    // signal to fill in the profile, never something to paper over here.
    const team = org.teamOf(u as any);
    const branch = org.branchOf(u as any);
    return {
      id: u.id,
      name: u.name || u.email,
      email: u.email,
      role: u.role || "",
      headshotUrl: u.headshotUrl || "",
      branch,
      team,
      itemsCompleted: agg.itemsCompleted,
      videosWatched: agg.videosWatched,
      quizzesPassed: agg.quizzesPassed,
      coursesCompleted: agg.coursesCompleted,
      pct: agg.pct,
      credentials,
      rank: null,
      isPodium: false,
      rankDelta: null,
      notStarted: !agg.started,
    };
  });

  // Company ranking: started reps only. Not-started reps sit in their own
  // group below the ranking (never rank #47 with zero items).
  const started = rows.filter((r) => !r.notStarted);
  const notStarted = rows
    .filter((r) => r.notStarted)
    .sort((a, b) => a.name.localeCompare(b.name));
  started.sort(
    (a, b) =>
      b.itemsCompleted - a.itemsCompleted ||
      b.coursesCompleted - a.coursesCompleted ||
      a.name.localeCompare(b.name)
  );
  started.forEach((r, i) => {
    r.rank = i + 1;
    r.isPodium = i < 3; // derived from the live sort, never persisted
  });

  return {
    courses,
    totalCourses,
    totalItems,
    rows: [...started, ...notStarted],
    started,
    progressByUserCourse,
    org,
  };
}
