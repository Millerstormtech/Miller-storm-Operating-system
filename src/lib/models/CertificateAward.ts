import { Schema, model, models } from "mongoose";

// One row per rep per credential earned: the once-ever guard for the
// certificate email (2026-08-19). The unique index makes a second send
// physically impossible, so racing progress saves collide harmlessly here
// rather than mailing the same person two certificates.
//
// Same shape and reasoning as CourseCelebration, deliberately: the two are
// separate ledgers because they answer different questions. That one asks
// "have we announced this course", this one asks "have we issued this
// certificate", and turning announcements off must never stop certificates.
const certificateAwardSchema = new Schema(
  {
    userId: { type: String, required: true },
    /** CredentialKey: "certificate" | "knockers" | "hustlers". */
    credentialKey: { type: String, required: true },
    /** The label as printed, kept so a later rename cannot rewrite history. */
    credentialLabel: { type: String, default: "" },
    /** The number printed on the sheet, so a reissue can reuse it. */
    credentialId: { type: String, default: "" },
    /** Where it went, for support questions months later. */
    sentTo: { type: String, default: "" },
    /**
     * False when the PDF could not be rendered and the rep got the email
     * without it. Lets a later job find those and reissue rather than leaving
     * someone quietly short of the thing they earned.
     */
    pdfAttached: { type: Boolean, default: true },
    sentAt: { type: Date, required: true },
  },
  { timestamps: true }
);

certificateAwardSchema.index({ userId: 1, credentialKey: 1 }, { unique: true });

export const CertificateAwardModel =
  models.CertificateAward || model("CertificateAward", certificateAwardSchema);
