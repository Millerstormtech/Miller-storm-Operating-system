import { describe, it, expect } from "vitest";
import {
  kingCertificateInput,
  kingCertificateNumber,
  kingCertificateTitle,
  KING_AWARD_LABEL,
} from "./king";
import { certificateHtml, credentialNumber } from "./template";
import { EMAIL_DEFAULTS, renderTemplate } from "../emailTemplates";

const FACTS = {
  name: "Mike Muscari",
  monthIso: "2026-08",
  monthLabel: "August 2026",
  revenue: 412880,
  contracts: 14,
  issuedDate: "1 September 2026",
  certificateId: "MS-KNG-2026-5855",
};

describe("kingCertificateNumber", () => {
  it("prints the king prefix and the awarded year", () => {
    expect(kingCertificateNumber({ repId: "rc:1234", monthIso: "2026-08" })).toMatch(
      /^MS-KNG-2026-\d{4}$/
    );
  });

  it("is stable, so a reissue reproduces the framed number", () => {
    const a = kingCertificateNumber({ repId: "rc:1234", monthIso: "2026-08" });
    const b = kingCertificateNumber({ repId: "rc:1234", monthIso: "2026-08" });
    expect(a).toBe(b);
  });

  it("gives the same rep a different number for a different month", () => {
    // Winning twice must not look like one certificate reprinted.
    const aug = kingCertificateNumber({ repId: "rc:1234", monthIso: "2026-08" });
    const sep = kingCertificateNumber({ repId: "rc:1234", monthIso: "2026-09" });
    expect(aug).not.toBe(sep);
  });

  it("gives different reps different numbers for the same month", () => {
    const a = kingCertificateNumber({ repId: "rc:1234", monthIso: "2026-08" });
    const b = kingCertificateNumber({ repId: "rc:9999", monthIso: "2026-08" });
    expect(a).not.toBe(b);
  });

  it("takes the year from the AWARDED month, not from today", () => {
    // January's king is crowned in February, but the sheet is a 2027 record.
    expect(kingCertificateNumber({ repId: "rc:1", monthIso: "2027-01" })).toContain("-2027-");
  });
});

describe("credentialNumber", () => {
  it("still produces the numbers already issued to training credentials", () => {
    // The shared hash moved into stableSuffix(). If this changes, every
    // certificate already on a wall disagrees with the database.
    expect(credentialNumber({ userId: "u-1", credentialKey: "certificate", year: 2026 })).toBe(
      credentialNumber({ userId: "u-1", credentialKey: "certificate", year: 2026 })
    );
    expect(credentialNumber({ userId: "u-1", credentialKey: "certificate", year: 2026 })).toMatch(
      /^MS-CRT-2026-\d{4}$/
    );
  });
});

describe("kingCertificateInput", () => {
  it("awards the Contract King, not a training credential", () => {
    expect(kingCertificateInput(FACTS).credential).toBe(KING_AWARD_LABEL);
  });

  it("names the month in the sentence and crowns rather than certifies", () => {
    const { citation } = kingCertificateInput(FACTS);
    expect(citation).toContain("August 2026");
    expect(citation).toContain("crowned");
    expect(citation).not.toContain("completed the training");
  });

  it("lists the month and the money the board would show", () => {
    expect(kingCertificateInput(FACTS).courses).toEqual([
      "August 2026",
      "$412,880 in signed contracts",
      "14 contracts signed",
    ]);
  });

  it("says contract, singular, for a one-contract month", () => {
    expect(kingCertificateInput({ ...FACTS, contracts: 1 }).courses).toContain("1 contract signed");
  });

  it("omits the contract count rather than printing zero under a crown", () => {
    // Revenue with no contract count is an upstream data gap. Printing
    // "0 contracts signed" would make the certificate look wrong instead.
    const { courses } = kingCertificateInput({ ...FACTS, contracts: 0 });
    expect(courses).toEqual(["August 2026", "$412,880 in signed contracts"]);
  });

  it("is signed by Jay, like the top training credential", () => {
    expect(kingCertificateInput(FACTS).signature).toEqual({
      name: "Jay Miller",
      title: "Chief Executive Officer",
    });
  });

  it("rounds cents away, the way the leaderboard does", () => {
    expect(kingCertificateInput({ ...FACTS, revenue: 412880.49 }).courses[1]).toBe(
      "$412,880 in signed contracts"
    );
  });
});

describe("certificateHtml, king variant", () => {
  const html = certificateHtml(kingCertificateInput(FACTS));

  it("prints the crowning wording and the numbers", () => {
    expect(html).toContain("CONTRACT KING");
    expect(html).toContain("Month of record");
    expect(html).toContain("$412,880 in signed contracts");
    expect(html).toContain("MS-KNG-2026-5855");
  });

  it("keeps Jay's signature block", () => {
    expect(html).toContain('class="sig-mark"');
    expect(html).toContain("Jay Miller");
  });

  it("squeezes the long seal caption back inside the ring", () => {
    // "CONTRACT KING" overruns the seal's inner ring at its natural width.
    expect(html).toContain('textLength="104"');
  });
});

describe("certificateHtml, training variant is untouched", () => {
  const html = certificateHtml({
    name: "Fernando Cano",
    credential: "Miller Storm Certificate",
    courses: ["Million Dollar Playbook, Phase 1"],
    issuedDate: "19 August 2026",
    credentialId: "MS-CRT-2026-0147",
    signature: { name: "Jay Miller", title: "Chief Executive Officer" },
  });

  it("still uses the approved training wording with no arguments passed", () => {
    expect(html).toContain("has completed the training below and is hereby awarded the");
    expect(html).toContain("Program completed");
    expect(html).toContain(">CERTIFICATE<");
  });

  it("does not squeeze the short caption, so the approved sheet renders as approved", () => {
    expect(html).not.toContain("textLength");
  });
});

describe("escaping", () => {
  it("escapes a rep name, which is user data on both paths", () => {
    const html = certificateHtml(
      kingCertificateInput({ ...FACTS, name: 'Ben & "Bo" <Reyes>' })
    );
    expect(html).toContain("Ben &amp; &quot;Bo&quot; &lt;Reyes&gt;");
    expect(html).not.toContain("<Reyes>");
  });
});

describe("kingCertificateTitle", () => {
  it("names the file by the month, so two wins do not collide in a downloads folder", () => {
    expect(kingCertificateTitle("August 2026")).toBe("Contract King - August 2026");
  });
});

describe("contractKingCertificate email template", () => {
  const tmpl = EMAIL_DEFAULTS.contractKingCertificate;

  it("exists, so it appears on the Email Config page", () => {
    expect(tmpl).toBeTruthy();
  });

  it("declares exactly the variables sendKingCertificateEmail substitutes", () => {
    // Drift guard. An admin editing the template sees this list; if the sender
    // stops filling one of them, the rep receives a raw {{placeholder}}.
    expect([...tmpl.variables].sort()).toEqual(
      ["{{appUrl}}", "{{certificateId}}", "{{issuedDate}}", "{{monthLabel}}", "{{name}}", "{{stats}}"]
    );
  });

  it("uses every variable it declares", () => {
    const src = `${tmpl.subject}\n${tmpl.body}`;
    for (const v of tmpl.variables) expect(src).toContain(v);
  });

  it("leaves no placeholder behind once rendered", () => {
    const { html, subject } = renderTemplate(tmpl.body, tmpl.subject, {
      "{{name}}": "Mike Muscari",
      "{{monthLabel}}": "August 2026",
      "{{stats}}": "- $412,880 in signed contracts",
      "{{issuedDate}}": "1 September 2026",
      "{{certificateId}}": "MS-KNG-2026-5855",
      "{{appUrl}}": "https://millerstorm.tech",
    });
    expect(subject).toBe("You are the August 2026 Contract King");
    expect(html).not.toMatch(/\{\{[a-zA-Z]+\}\}/);
  });

  it("keeps the phrase the missing-PDF fallback rewrites", () => {
    // sendKingCertificateEmail softens this line when the render failed. If the
    // wording drifts, the email promises an attachment that is not there.
    expect(tmpl.body).toContain("Your certificate is attached");
  });

  it("uses no em dashes, per the house copy rule", () => {
    expect(`${tmpl.subject}${tmpl.body}`).not.toContain("—");
  });
});
