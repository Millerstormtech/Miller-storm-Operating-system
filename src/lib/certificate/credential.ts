// Training certificates as data, for both places that print one (2026-09-13):
// the email sent the moment a rep earns a credential (training/certificateAward.ts)
// and the download on My Profile (pages/api/certificates/pdf.ts). Sharing this
// is what makes a downloaded copy the same sheet the rep was emailed.
//
// PURE ONLY: no database, no browser, no email.
import type { CertificateInput } from "./template";

export type CredentialMeta = { key: string; label: string };

/** The printed sheet for a training credential. */
export function credentialCertificateInput(params: {
  userName: string;
  credential: CredentialMeta;
  courseTitles: string[];
  issuedDate: string;
  credentialId: string;
}): CertificateInput {
  const tierOne = params.credential.key === "certificate";
  return {
    name: params.userName,
    credential: params.credential.label,
    courses: params.courseTitles,
    issuedDate: params.issuedDate,
    credentialId: params.credentialId,
    // Tier 1 alone is signed. Since the word Diploma was retired that signature
    // is the only thing on the page saying which credential outranks the others.
    signature: tierOne ? { name: "Jay Miller", title: "Chief Executive Officer" } : null,
    sealRing: tierOne ? "Miller Storm" : params.credential.label,
  };
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "2026-08" -> "August 2026". Returns the input unchanged if it is not YYYY-MM. */
export function monthLabelOf(monthIso: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(monthIso || "");
  const index = m ? Number(m[2]) - 1 : -1;
  return m && index >= 0 && index < 12 ? `${MONTHS[index]} ${m[1]}` : monthIso;
}

export type CertificateListItem = {
  kind: "credential" | "king";
  /** The credential key, or the month ("2026-08") of a Contract King sheet. */
  key: string;
  title: string;
  number: string;
  issuedAt: string;
  downloadPath: string;
};

/**
 * Everything one person has earned, newest first, as My Profile lists it.
 * Titles use the label printed at the time, so a later rename of a credential
 * does not rewrite a certificate someone already holds.
 */
export function certificateList(
  credentialAwards: ReadonlyArray<{ credentialKey: string; credentialLabel?: string; credentialId?: string; sentAt: Date | string }>,
  kingAwards: ReadonlyArray<{ month: string; certificateId?: string; sentAt: Date | string }>,
  labelFor: (credentialKey: string) => string | null
): CertificateListItem[] {
  const iso = (d: Date | string) => new Date(d).toISOString();
  const items: CertificateListItem[] = [
    ...credentialAwards.map((a) => ({
      kind: "credential" as const,
      key: a.credentialKey,
      title: a.credentialLabel || labelFor(a.credentialKey) || a.credentialKey,
      number: a.credentialId || "",
      issuedAt: iso(a.sentAt),
      downloadPath: `/api/certificates/pdf?kind=credential&key=${encodeURIComponent(a.credentialKey)}`,
    })),
    ...kingAwards.map((a) => ({
      kind: "king" as const,
      key: a.month,
      title: `Contract King, ${monthLabelOf(a.month)}`,
      number: a.certificateId || "",
      issuedAt: iso(a.sentAt),
      downloadPath: `/api/certificates/pdf?kind=king&key=${encodeURIComponent(a.month)}`,
    })),
  ];
  return items.sort((a, b) => b.issuedAt.localeCompare(a.issuedAt));
}

/**
 * Is this Contract King sheet the signed-in person's? The award names a
 * leaderboard identity ("rc:<RepCard id>"), not an app account, so it counts as
 * theirs when that identity is one of their RepCard records, or when the
 * certificate was emailed to the address they sign in with.
 */
export function ownsKingAward(
  award: { repId?: string | null; sentTo?: string | null },
  me: { email: string; repIds: readonly string[] }
): boolean {
  if (award.repId && me.repIds.includes(award.repId)) return true;
  const email = me.email.trim().toLowerCase();
  return email !== "" && String(award.sentTo || "").trim().toLowerCase() === email;
}
