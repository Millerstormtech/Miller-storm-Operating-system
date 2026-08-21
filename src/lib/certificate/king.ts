// The Contract King certificate, as data. Pure: no database, no browser, no
// email. Given the facts of a finished month it returns the CertificateInput
// that template.ts prints, plus the number that goes on the sheet.
//
// Why this is not a second template: the Contract King sheet is the SAME
// approved design as the training certificates, with three words changed. It
// passes those words in as `citation`, `detailsHeading` and `sealCaption`
// rather than owning a copy of the markup, so a future change to the sheet
// reaches every certificate Miller Storm issues at once.
//
// The other difference from a training credential is that this one is not
// earned once and kept forever: a rep can be crowned again next month, and the
// same rep crowned twice must receive two distinct certificates. Everything
// here is therefore keyed on rep AND month.

import type { CertificateInput } from "./template";
import { stableSuffix } from "./template";
import { formatAmount } from "../stormbot/copy";

export type KingCertificateFacts = {
  /** The rep's name as it should be printed, marker already stripped. */
  name: string;
  /** The month being awarded, Central time, as YYYY-MM. */
  monthIso: string;
  /** The same month spelled out, e.g. "August 2026". */
  monthLabel: string;
  /** Contract Amount for the month, whole dollars. */
  revenue: number;
  /** Contracts signed in the month. The board calls this column "Contracts". */
  contracts: number;
  /** The day the certificate is issued, e.g. "1 September 2026". */
  issuedDate: string;
  /** From kingCertificateNumber(). */
  certificateId: string;
};

/** The label printed as the award, and used as the email's subject noun. */
export const KING_AWARD_LABEL = "Contract King";

/**
 * The number printed on a Contract King certificate: "MS-KNG-2026-0147".
 *
 * Seeded on rep AND month, unlike the training credentials which are seeded on
 * rep and credential. Winning August and then September must produce two
 * different numbers, or the second certificate looks like a reprint of the
 * first. Deterministic, so re-issuing August's sheet a year later reproduces
 * the number that is already framed on somebody's wall.
 */
export function kingCertificateNumber(params: { repId: string; monthIso: string }): string {
  const year = params.monthIso.slice(0, 4);
  return `MS-KNG-${year}-${stableSuffix(`${params.repId}:king:${params.monthIso}`)}`;
}

/** "3 contracts signed", "1 contract signed". */
function contractsLine(n: number): string {
  return `${n.toLocaleString("en-US")} ${n === 1 ? "contract" : "contracts"} signed`;
}

export function kingCertificateInput(facts: KingCertificateFacts): CertificateInput {
  // Only facts that are actually true get a line. A month with revenue but a
  // zero contract count is a data gap somewhere upstream, and printing
  // "0 contracts signed" under a crown would make the certificate look wrong
  // rather than making the gap look wrong.
  // The month leads the list even though the sentence above already names it.
  // A certificate restates its own facts by convention, and without a third
  // line the sheet reads bottom-heavy: the base row is pinned to the foot of
  // the page, so a short list opens a hole in the middle of the design.
  const details = [facts.monthLabel, `${formatAmount(facts.revenue)} in signed contracts`];
  if (facts.contracts > 0) details.push(contractsLine(facts.contracts));

  return {
    name: facts.name,
    credential: KING_AWARD_LABEL,
    courses: details,
    issuedDate: facts.issuedDate,
    credentialId: facts.certificateId,
    citation: `finished ${facts.monthLabel} at the top of the Miller Storm sales leaderboard and is hereby crowned`,
    detailsHeading: "Month of record",
    // Signed, deliberately. Among the training credentials only tier 1 carries
    // Jay's signature, and that signature is what marks a sheet as the company's
    // highest honour rather than a participation record. The Contract King is
    // the sales side of exactly that.
    signature: { name: "Jay Miller", title: "Chief Executive Officer" },
    sealCaption: "CONTRACT KING",
  };
}

/** "Fernando Cano - Contract King - August 2026.pdf" is built from this. */
export function kingCertificateTitle(monthLabel: string): string {
  return `${KING_AWARD_LABEL} - ${monthLabel}`;
}
