import { Schema, model, models } from "mongoose";

// One row per month whose Contract King certificate has been emailed.
//
// A SEPARATE ledger from MonthlyKingAnnouncement, deliberately, for the same
// reason CertificateAward is separate from CourseCelebration: the two rows
// answer different questions. That one asks "have we posted this month's
// crowning in Storm Chat", this one asks "have we sent this month's king their
// certificate". Collapsing them into one row would mean a failed Storm Chat
// post could silently cost a rep their certificate, or a re-post could mail a
// second copy.
//
// Unique on `month` alone, not on month + rep. There is exactly one Contract
// King per month, and the leaderboard is recomputed from live data on every
// read: if AccuLynx back-dates a deal in October, a re-run for August could
// crown somebody else. Keying on the month means August's certificate is issued
// once, to whoever won it on the day, and a later recompute cannot mail a
// second one to a different person.
const kingCertificateAwardSchema = new Schema(
  {
    /** Central-time calendar month awarded, as "2026-08". */
    month: { type: String, required: true, unique: true },
    /** Leaderboard merge id, e.g. "rc:123". */
    repId: { type: String, required: true },
    /** Name as printed on the sheet, so a later rename cannot rewrite history. */
    repName: { type: String, required: true },
    revenue: { type: Number, required: true },
    contracts: { type: Number, default: 0 },
    /** The number printed on the sheet, so a reissue can reuse it. */
    certificateId: { type: String, default: "" },
    /** Where it went, for support questions months later. */
    sentTo: { type: String, default: "" },
    /**
     * False when the PDF could not be rendered and the king got the email
     * without it. Lets a later job find those and reissue rather than leaving
     * the month's top rep quietly short of the thing they won.
     */
    pdfAttached: { type: Boolean, default: true },
    sentAt: { type: Date, required: true },
  },
  { timestamps: true }
);

export const KingCertificateAwardModel =
  models.KingCertificateAward || model("KingCertificateAward", kingCertificateAwardSchema);
