import { describe, it, expect } from "vitest";
import { certificateHtml, credentialNumber, type CertificateInput } from "./template";

const base: CertificateInput = {
  name: "Fernando Cano",
  credential: "Miller Storm Certificate",
  courses: ["Playbook Phase 1", "Playbook Phase 2"],
  issuedDate: "19 August 2026",
  credentialId: "MS-CRT-2026-0147",
  signature: { name: "Jay Miller", title: "Chief Executive Officer" },
};

describe("certificateHtml", () => {
  it("prints the rep, the credential and every course", () => {
    const html = certificateHtml(base);
    expect(html).toContain("Fernando Cano");
    expect(html).toContain("Miller Storm Certificate");
    expect(html).toContain("Playbook Phase 1");
    expect(html).toContain("Playbook Phase 2");
    expect(html).toContain("MS-CRT-2026-0147");
  });

  it("escapes a name rather than letting it become markup", () => {
    // Rep names are user data and reach this unfiltered.
    const html = certificateHtml({ ...base, name: '<script>alert("x")</script>' });
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
  });

  it("escapes a course title too", () => {
    const html = certificateHtml({ ...base, courses: ["Roofing & <b>Sales</b>"] });
    expect(html).toContain("Roofing &amp; &lt;b&gt;Sales&lt;/b&gt;");
  });

  it("omits the signature block entirely for tier 2", () => {
    const withSig = certificateHtml(base);
    const without = certificateHtml({ ...base, signature: null });
    expect(withSig).toContain("Chief Executive Officer");
    expect(without).not.toContain("Chief Executive Officer");
    // The CSS always defines .sig-mark; what must be absent is the MARKUP.
    expect(without).not.toContain('class="sig-mark"');
    expect(without).not.toContain("Jay Miller");
  });

  it("is a standalone printable page, not a fragment", () => {
    const html = certificateHtml(base);
    expect(html.startsWith("<!doctype html>")).toBe(true);
    // Landscape, edge to edge: a margin would put a white border round the design.
    expect(html).toContain("size: 11in 8.5in");
    expect(html).toContain("margin: 0");
  });

  it("carries its own fonts and logo so a render needs no network", () => {
    const html = certificateHtml(base);
    expect(html).toContain("data:font/woff2;base64,");
    expect(html).toContain("data:image/png;base64,");
    expect(html).not.toMatch(/https?:\/\//);
  });

  it("puts the issue year in the seal", () => {
    expect(certificateHtml(base)).toContain(">2026</text>");
  });

  it("uses the credential's own ring text", () => {
    const html = certificateHtml({ ...base, sealRing: "Roof Hustlers" });
    expect(html).toContain("Roof Hustlers</textPath>");
  });
});

describe("credentialNumber", () => {
  it("is stable for the same rep and credential", () => {
    const a = credentialNumber({ userId: "u1", credentialKey: "certificate", year: 2026 });
    const b = credentialNumber({ userId: "u1", credentialKey: "certificate", year: 2026 });
    // A reissue must not hand the same person a second number for one
    // achievement, which is what a counter would do.
    expect(a).toBe(b);
  });

  it("differs per rep and per credential", () => {
    const mine = credentialNumber({ userId: "u1", credentialKey: "certificate", year: 2026 });
    const theirs = credentialNumber({ userId: "u2", credentialKey: "certificate", year: 2026 });
    const other = credentialNumber({ userId: "u1", credentialKey: "hustlers", year: 2026 });
    expect(mine).not.toBe(theirs);
    expect(mine).not.toBe(other);
  });

  it("prefixes by credential and carries the year", () => {
    expect(credentialNumber({ userId: "u1", credentialKey: "certificate", year: 2026 })).toMatch(
      /^MS-CRT-2026-\d{4}$/
    );
    expect(credentialNumber({ userId: "u1", credentialKey: "knockers", year: 2026 })).toMatch(
      /^MS-MKC-2026-\d{4}$/
    );
    expect(credentialNumber({ userId: "u1", credentialKey: "hustlers", year: 2027 })).toMatch(
      /^MS-RHC-2027-\d{4}$/
    );
  });

  it("never emits the retired DIP prefix", () => {
    for (const key of ["certificate", "knockers", "hustlers"]) {
      expect(credentialNumber({ userId: "u1", credentialKey: key, year: 2026 })).not.toContain("DIP");
    }
  });
});
