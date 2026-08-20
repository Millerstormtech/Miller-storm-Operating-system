// Emails the Contract King their certificate, on the 1st of the month, at the
// same moment Storm Bot posts the crowning (2026-08-20).
//
// Called from announceMonthlyKing, which is the only place that knows who won a
// finished month. It runs BEFORE that function writes its announcement ledger
// row, so a Storm Chat outage can never cost the king their certificate: the
// two have separate ledgers and fail independently.
//
// Failure-isolated throughout. Nothing in here may break the announcement: the
// worst outcome of a bug is a missing certificate, never a missing crowning.

import { UserModel } from "../models/User";
import { RepCardUserModel } from "../models/RepCardUser";
import { KingCertificateAwardModel } from "../models/KingCertificateAward";
import { logToDb } from "../models/SystemLog";
import { renderCertificatePdf, certificateFilename } from "../certificate/render";
import {
  kingCertificateInput,
  kingCertificateNumber,
  kingCertificateTitle,
} from "../certificate/king";
import { sendKingCertificateEmail } from "../email";

export type KingCertificateResult =
  | { status: "sent"; sentTo: string; certificateId: string; pdfAttached: boolean }
  | { status: "already-sent" }
  | { status: "no-email" }
  | { status: "failed"; reason: string };

/**
 * The king's email address.
 *
 * The leaderboard row is a MERGED identity across RepCard and AccuLynx, not a
 * Miller Storm account, so it carries no email of its own. Two places can
 * supply one:
 *
 *   1. The matched Miller Storm user (`repUserId`), set by compute.ts when the
 *      rep's email matches an app account. Preferred: it is the address the rep
 *      actually signs in with.
 *   2. The RepCard directory, for a rep who sells but has no app account yet.
 *      Still their real address, and they still won the month.
 *
 * Deliberately NOT added to SalesLeaderRow: /api/leaderboard is read by every
 * rep and by four Flutter screens, and putting the whole roster's email
 * addresses in that response would publish them to everyone on the board.
 */
async function resolveKingEmail(params: {
  repId: string;
  repUserId: string | null;
}): Promise<string> {
  if (params.repUserId) {
    const user: any = await UserModel.findOne({ id: params.repUserId, deleted: { $ne: true } })
      .select("email")
      .lean();
    const email = String(user?.email || "").trim();
    if (email) return email;
  }
  // Merge ids look like "rc:<repcardUserId>". Anything else has no RepCard row
  // to fall back to.
  const m = /^rc:(.+)$/.exec(params.repId);
  if (m) {
    const rc: any = await RepCardUserModel.findOne({ repcardUserId: m[1] }).select("email").lean();
    const email = String(rc?.email || "").trim();
    if (email) return email;
  }
  return "";
}

export async function issueKingCertificate(params: {
  /** Central-time month awarded, as "2026-08". */
  monthIso: string;
  /** The same month spelled out, e.g. "August 2026". */
  monthLabel: string;
  /** Name with the former-rep marker already stripped. */
  repName: string;
  repId: string;
  repUserId: string | null;
  revenue: number;
  /** The board's "Contracts" column for the month. */
  contracts: number;
  /** "1 September 2026", the day the certificate is issued. */
  issuedDate: string;
  now: Date;
}): Promise<KingCertificateResult> {
  const { monthIso, monthLabel, repName, repId, revenue, contracts, issuedDate, now } = params;
  try {
    const sentTo = await resolveKingEmail({ repId, repUserId: params.repUserId });
    if (!sentTo) {
      // A departed rep with no app account and no RepCard address can still win
      // a month. Say so loudly rather than failing quietly: somebody may want to
      // hand them the certificate in person.
      await logToDb(
        "info",
        "CERTIFICATE",
        `king ${monthIso}: no email for ${repName} (${repId}), certificate not sent`
      ).catch(() => {});
      return { status: "no-email" };
    }

    const certificateId = kingCertificateNumber({ repId, monthIso });
    const input = kingCertificateInput({
      name: repName,
      monthIso,
      monthLabel,
      revenue,
      contracts,
      issuedDate,
      certificateId,
    });

    // Claim the ledger row BEFORE doing any work. A duplicate key means a
    // previous run already issued this month (a PM2 restart at 09:00 on the
    // 1st, a re-deploy, a manual re-trigger), so stop rather than mailing a
    // second copy.
    try {
      await KingCertificateAwardModel.create({
        month: monthIso,
        repId,
        repName,
        revenue,
        contracts,
        certificateId,
        sentTo,
        pdfAttached: true,
        sentAt: now,
      });
    } catch (e: any) {
      if (e && e.code === 11000) return { status: "already-sent" };
      throw e;
    }

    let pdf: { filename: string; content: Buffer } | null = null;
    try {
      const content = await renderCertificatePdf(input);
      pdf = { filename: certificateFilename(repName, kingCertificateTitle(monthLabel)), content };
    } catch (e: any) {
      // The king still hears they won. Flag the row so it can be reissued.
      await KingCertificateAwardModel.updateOne(
        { month: monthIso },
        { $set: { pdfAttached: false } }
      ).catch(() => {});
      await logToDb(
        "error",
        "CERTIFICATE",
        `king ${monthIso}: PDF render failed for ${repName}: ${e?.message}`
      ).catch(() => {});
    }

    await sendKingCertificateEmail({
      name: repName,
      email: sentTo,
      monthLabel,
      // The same lines the sheet prints, so the email and the attachment can
      // never quote different numbers for the same month.
      stats: input.courses,
      issuedDate,
      certificateId,
      pdf,
    });

    await logToDb(
      "info",
      "CERTIFICATE",
      `king ${monthIso}: issued to ${repName} <${sentTo}> (${certificateId})${pdf ? "" : " WITHOUT pdf"}`
    ).catch(() => {});

    return { status: "sent", sentTo, certificateId, pdfAttached: !!pdf };
  } catch (e: any) {
    try {
      await logToDb("error", "CERTIFICATE", `king ${monthIso} failed: ${e?.message}`);
    } catch {
      console.error("[CERTIFICATE] king failed:", e);
    }
    return { status: "failed", reason: String(e?.message || e) };
  }
}
