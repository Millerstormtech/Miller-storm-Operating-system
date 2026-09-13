// GET /api/certificates/pdf?kind=credential|king&key=<credential key or YYYY-MM>
// Prints one of the signed-in person's own certificates again, as the PDF they
// were emailed (2026-09-13). The number and the issue date come from the ledger
// row, so the copy matches the original.
import type { NextApiRequest, NextApiResponse } from "next";
import { connectMongo } from "../../../src/lib/mongodb";
import { requireUser, allowMethods } from "../../../src/lib/auth";
import { CourseModel } from "../../../src/lib/models/Course";
import { loadMyCertificates } from "../../../src/lib/certificate/mine";
import { credentialCertificateInput, monthLabelOf } from "../../../src/lib/certificate/credential";
import { kingCertificateInput, kingCertificateNumber, kingCertificateTitle } from "../../../src/lib/certificate/king";
import { certificateDate } from "../../../src/lib/certificate/date";
import { credentialNumber, type CertificateInput } from "../../../src/lib/certificate/template";
import { renderCertificatePdf, certificateFilename } from "../../../src/lib/certificate/render";
import { CREDENTIALS, canonicalCategory } from "../../../src/lib/training/credentials";

// One browser at a time. Every render starts a whole Chromium (render.ts), and a
// rep tapping Download five times must not start five of them.
let renderQueue: Promise<unknown> = Promise.resolve();
function oneAtATime<T>(work: () => Promise<T>): Promise<T> {
  const run = renderQueue.then(work, work);
  renderQueue = run.catch(() => undefined);
  return run;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!allowMethods(req, res, ["GET"])) return;
  const auth = requireUser(req, res);
  if (!auth) return;

  const kind = String(req.query.kind || "");
  const key = String(req.query.key || "");
  if ((kind !== "credential" && kind !== "king") || !key) {
    return res.status(400).json({ error: "kind (credential or king) and key are required" });
  }

  try {
    await connectMongo();
    const mine = await loadMyCertificates(auth.sub);
    if (!mine) return res.status(404).json({ error: "Certificate not found" });

    let input: CertificateInput;
    let filename: string;
    if (kind === "credential") {
      const award = mine.credentialAwards.find((a) => a.credentialKey === key);
      const meta = CREDENTIALS.find((c) => c.key === key);
      if (!award || !meta) return res.status(404).json({ error: "Certificate not found" });
      const label = String(award.credentialLabel || meta.label);
      const sentAt = new Date(award.sentAt);
      // The course list the email printed: every published course filed under
      // this credential, retired category spellings included.
      const courses: any[] = await CourseModel.find({ status: "published" }).select("title category").lean();
      input = credentialCertificateInput({
        userName: mine.user.name,
        credential: { key, label },
        courseTitles: courses
          .filter((c) => canonicalCategory(c.category) === meta.category)
          .map((c) => String(c.title || ""))
          .filter(Boolean),
        issuedDate: certificateDate(sentAt),
        credentialId: String(
          award.credentialId || credentialNumber({ userId: auth.sub, credentialKey: key, year: sentAt.getUTCFullYear() })
        ),
      });
      filename = certificateFilename(mine.user.name, label);
    } else {
      const award = mine.kingAwards.find((a) => a.month === key);
      if (!award) return res.status(404).json({ error: "Certificate not found" });
      const monthIso = String(award.month);
      const monthLabel = monthLabelOf(monthIso);
      const name = String(award.repName || mine.user.name);
      input = kingCertificateInput({
        name,
        monthIso,
        monthLabel,
        revenue: Number(award.revenue) || 0,
        contracts: Number(award.contracts) || 0,
        issuedDate: certificateDate(new Date(award.sentAt)),
        certificateId: String(award.certificateId || kingCertificateNumber({ repId: String(award.repId), monthIso })),
      });
      filename = certificateFilename(name, kingCertificateTitle(monthLabel));
    }

    const pdf = await oneAtATime(() => renderCertificatePdf(input));
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).send(pdf);
  } catch (e: any) {
    console.error("[certificates] pdf failed:", e?.message);
    return res.status(500).json({ error: "Could not create the PDF. Try again in a minute." });
  }
}
