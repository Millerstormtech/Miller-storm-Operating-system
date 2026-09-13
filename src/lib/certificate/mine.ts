// SERVER ONLY. The certificates one signed-in person holds, for My Profile
// (2026-09-13).
//
// Training credentials are stored against the user id. A Contract King sheet is
// stored against a leaderboard identity ("rc:<RepCard id>"), not an app account,
// so it is matched back to this person through their RepCard record (by email,
// the way the leaderboard matches rep photos) or the address it was emailed to.
import { UserModel } from "../models/User";
import { RepCardUserModel } from "../models/RepCardUser";
import { CertificateAwardModel } from "../models/CertificateAward";
import { KingCertificateAwardModel } from "../models/KingCertificateAward";
import { ownsKingAward } from "./credential";

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export type MyCertificates = {
  user: { id: string; name: string; email: string };
  credentialAwards: any[];
  kingAwards: any[];
};

export async function loadMyCertificates(userId: string): Promise<MyCertificates | null> {
  const user: any = await UserModel.findOne({ id: userId }).select("id name email").lean();
  if (!user) return null;
  const email = String(user.email || "").trim();

  const credentialAwards: any[] = await CertificateAwardModel.find({ userId }).lean();
  const repCardRows: any[] = email
    ? await RepCardUserModel.find({ email: { $regex: `^\\s*${escapeRegex(email)}\\s*$`, $options: "i" } })
        .select("repcardUserId")
        .lean()
    : [];
  // One row per month ever awarded, so matching in memory stays cheap.
  const kingRows: any[] = await KingCertificateAwardModel.find({}).lean();
  const repIds = repCardRows.map((r) => `rc:${r.repcardUserId}`);

  return {
    user: { id: String(user.id), name: String(user.name || ""), email },
    credentialAwards,
    kingAwards: kingRows.filter((a) => ownsKingAward(a, { email, repIds })),
  };
}
