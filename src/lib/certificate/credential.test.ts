import { describe, it, expect } from "vitest";
import { credentialCertificateInput, monthLabelOf, certificateList, ownsKingAward } from "./credential";

describe("credentialCertificateInput", () => {
  const base = { userName: "Fernando Cano", courseTitles: ["Phase 1", "Phase 2"], issuedDate: "19 August 2026", credentialId: "MS-CRT-2026-0147" };

  it("signs and seals the tier 1 certificate as Miller Storm", () => {
    const input = credentialCertificateInput({ ...base, credential: { key: "certificate", label: "Miller Storm Certificate" } });
    expect(input.signature).toEqual({ name: "Jay Miller", title: "Chief Executive Officer" });
    expect(input.sealRing).toBe("Miller Storm");
    expect(input.credential).toBe("Miller Storm Certificate");
    expect(input.courses).toEqual(["Phase 1", "Phase 2"]);
    expect(input.credentialId).toBe("MS-CRT-2026-0147");
  });

  it("leaves the other credentials unsigned, sealed with their own label", () => {
    const input = credentialCertificateInput({ ...base, credential: { key: "knockers", label: "Millionaire Knockers" } });
    expect(input.signature).toBeNull();
    expect(input.sealRing).toBe("Millionaire Knockers");
  });
});

describe("monthLabelOf", () => {
  it("spells the month out", () => {
    expect(monthLabelOf("2026-08")).toBe("August 2026");
    expect(monthLabelOf("2027-01")).toBe("January 2027");
  });

  it("leaves anything else alone", () => {
    expect(monthLabelOf("2026-13")).toBe("2026-13");
    expect(monthLabelOf("August")).toBe("August");
  });
});

describe("certificateList", () => {
  const labelFor = (key: string) => (key === "hustlers" ? "Roof Hustlers" : null);

  it("lists credentials and Contract King sheets newest first, with download links", () => {
    const list = certificateList(
      [
        { credentialKey: "knockers", credentialLabel: "Millionaire Knockers", credentialId: "MS-KNK-2026-0001", sentAt: "2026-08-20T12:00:00Z" },
        { credentialKey: "hustlers", credentialId: "MS-HST-2026-0002", sentAt: new Date("2026-09-05T12:00:00Z") },
      ],
      [{ month: "2026-08", certificateId: "MS-KNG-2026-0147", sentAt: "2026-09-01T14:00:00Z" }],
      labelFor
    );
    expect(list.map((i) => i.title)).toEqual(["Roof Hustlers", "Contract King, August 2026", "Millionaire Knockers"]);
    expect(list[1]).toEqual({
      kind: "king",
      key: "2026-08",
      title: "Contract King, August 2026",
      number: "MS-KNG-2026-0147",
      issuedAt: "2026-09-01T14:00:00.000Z",
      downloadPath: "/api/certificates/pdf?kind=king&key=2026-08",
    });
    expect(list[2].downloadPath).toBe("/api/certificates/pdf?kind=credential&key=knockers");
  });

  it("keeps the label that was printed, even if the credential was renamed since", () => {
    const list = certificateList([{ credentialKey: "hustlers", credentialLabel: "Old Name", sentAt: "2026-08-20T12:00:00Z" }], [], labelFor);
    expect(list[0].title).toBe("Old Name");
  });

  it("is empty for someone with nothing earned", () => {
    expect(certificateList([], [], labelFor)).toEqual([]);
  });
});

describe("ownsKingAward", () => {
  const me = { email: "Ria.Rep@smoke.test", repIds: ["rc:555"] };

  it("belongs to the rep whose RepCard identity won, whatever address it went to", () => {
    expect(ownsKingAward({ repId: "rc:555", sentTo: "personal@example.com" }, me)).toBe(true);
  });

  it("belongs to the person it was emailed to, ignoring letter case and spaces", () => {
    expect(ownsKingAward({ repId: "rc:999", sentTo: " ria.rep@SMOKE.test " }, me)).toBe(true);
  });

  it("is nobody else's", () => {
    expect(ownsKingAward({ repId: "rc:777", sentTo: "omar@smoke.test" }, me)).toBe(false);
  });

  it("never matches on a blank address", () => {
    expect(ownsKingAward({ repId: "rc:777", sentTo: "" }, { email: "", repIds: [] })).toBe(false);
  });
});
