// Issues a certificate when a rep earns a credential (2026-08-19).
//
// Called from celebrateIfCourseCompleted, because a credential can only ever be
// earned by the course completion that finishes it. It runs BEFORE that
// function's own ledger write, so switching Storm Bot announcements off can
// never stop certificates going out: the two are independent by design.
//
// Failure-isolated throughout. Nothing in here may break a progress save: a rep
// finishing a lesson must not see an error because a PDF would not render.

import { CourseModel } from "../models/Course";
import { UserProgressModel } from "../models/UserProgress";
import { CertificateAwardModel } from "../models/CertificateAward";
import { logToDb } from "../models/SystemLog";
import { courseStats, type CourseStats, type ProgressLike } from "./scoring";
import { credentialProgress, CREDENTIALS } from "./credentials";
import { renderCertificatePdf, certificateFilename } from "../certificate/render";
import { credentialNumber } from "../certificate/template";
import { certificateDate } from "../certificate/date";
import { sendCertificateEarnedEmail } from "../email";

const COURSE_SELECT =
  "-pages.body -pages.transcript -pages.quizQuestions -pages.resourceLinks -pages.fileUrls -pages.pinnedCommunityPostUrl -quizQuestions -links";

// Moved to certificate/date.ts when the Contract King began printing sheets
// too, so both callers format the day identically. Imported AND re-exported:
// this file calls it below, and its own tests and callers already import it
// from this path. A bare `export ... from` would re-export without binding the
// name locally, which is a type error rather than a runtime surprise.
export { certificateDate };

/**
 * Which credentials this save just completed.
 *
 * Transition-based, exactly like the course celebration: a credential counts
 * only when it flips from unearned to earned on THIS save. Re-watching a lesson
 * inside a finished credential leaves before and after both earned, so nothing
 * fires.
 */
export function newlyEarned(
  before: ReturnType<typeof credentialProgress>,
  after: ReturnType<typeof credentialProgress>
): string[] {
  const was = new Map(before.map((c) => [c.key, c.earned]));
  return after.filter((c) => c.earned && !was.get(c.key)).map((c) => c.key);
}

export async function awardCertificatesIfEarned(params: {
  userId: string;
  userName: string;
  userEmail: string;
  courseId: string;
  progressBefore: ProgressLike;
  progressAfter: ProgressLike;
}): Promise<void> {
  const { userId, userName, userEmail, courseId, progressBefore, progressAfter } = params;
  try {
    if (!userEmail) return;

    const courses: any[] = await CourseModel.find({ status: "published" })
      .select(COURSE_SELECT)
      .lean();
    if (courses.length === 0) return;

    // Every other course keeps its stored progress; only the saved course
    // differs between the two snapshots, which is what makes this a transition
    // rather than a re-check of the whole library.
    const others: any[] = await UserProgressModel.find({ userId })
      .select("courseId completedPages quizResults")
      .lean();
    const byCourse = new Map(others.map((p: any) => [p.courseId, p]));

    const statsFor = (which: ProgressLike) => {
      const map = new Map<string, CourseStats>();
      for (const c of courses) {
        const progress = c.id === courseId ? which : byCourse.get(c.id);
        map.set(String(c.id), courseStats(c, progress));
      }
      return map;
    };

    const before = credentialProgress(courses, statsFor(progressBefore));
    const after = credentialProgress(courses, statsFor(progressAfter));
    const earned = newlyEarned(before, after);
    if (earned.length === 0) return;

    const now = new Date();
    for (const key of earned) {
      const meta = CREDENTIALS.find((c) => c.key === key);
      if (!meta) continue;
      const credentialId = credentialNumber({
        userId,
        credentialKey: key,
        year: now.getUTCFullYear(),
      });

      // Claim the ledger row BEFORE doing any work. A duplicate key means a
      // racing save already issued this one; stop silently rather than mailing
      // a second copy.
      try {
        await CertificateAwardModel.create({
          userId,
          credentialKey: key,
          credentialLabel: meta.label,
          credentialId,
          sentTo: userEmail,
          pdfAttached: true,
          sentAt: now,
        });
      } catch (e: any) {
        if (e && e.code === 11000) continue;
        throw e;
      }

      const titles = courses
        .filter((c: any) => (c.category || "").trim() === meta.category)
        .map((c: any) => String(c.title || ""))
        .filter(Boolean);

      // Tier 1 alone is signed. Since the word Diploma was retired that
      // signature is the only thing on the page saying which credential
      // outranks the others, so it is not decoration.
      const signature =
        key === "certificate" ? { name: "Jay Miller", title: "Chief Executive Officer" } : null;

      let pdf: { filename: string; content: Buffer } | null = null;
      try {
        const content = await renderCertificatePdf({
          name: userName,
          credential: meta.label,
          courses: titles,
          issuedDate: certificateDate(now),
          credentialId,
          signature,
          sealRing: key === "certificate" ? "Miller Storm" : meta.label,
        });
        pdf = { filename: certificateFilename(userName, meta.label), content };
      } catch (e: any) {
        // The rep still hears they earned it. Flag the row so it can be reissued.
        await CertificateAwardModel.updateOne(
          { userId, credentialKey: key },
          { $set: { pdfAttached: false } }
        ).catch(() => {});
        await logToDb(
          "error",
          "CERTIFICATE",
          `PDF render failed for ${userName} (${meta.label}): ${e?.message}`
        ).catch(() => {});
      }

      await sendCertificateEarnedEmail({
        name: userName,
        email: userEmail,
        credential: meta.label,
        courses: titles,
        issuedDate: certificateDate(now),
        credentialId,
        pdf,
      });

      await logToDb(
        "info",
        "CERTIFICATE",
        `Issued ${meta.label} to ${userName} (${credentialId})${pdf ? "" : " WITHOUT pdf"}`
      ).catch(() => {});
    }
  } catch (e: any) {
    // A progress save must never fail because of a certificate.
    try {
      await logToDb("error", "CERTIFICATE", `Award failed: ${e?.message}`);
    } catch {
      console.error("[CERTIFICATE] failed:", e);
    }
  }
}
