import { describe, it, expect } from "vitest";
import formidable from "formidable";
import { isAllowedUploadName, mimeTypeForName, storedUploadName, ALLOWED_UPLOAD_EXTENSIONS } from "./allowedTypes";

const ATTACKS = [
  "x.html .jpg", "x.svg_.png", "x.shtml-.pdf", "x.svgz .png", "x.xhtml~.txt", "x.js .jpg",
  "x.HTML .jpg", "x.html\t.jpg", "x.html .jpg", "x.htm(1).pdf", "x.xml .pdf", "x.shtml .pdf",
  "x.php .jpg", "x.pdf.html", "x.html.", "a.b.svg .png",
  // U+212A KELVIN SIGN / U+0130 lowercase to ASCII "k" / "i" — formidable still
  // cuts at them, so these must be judged on the original case.
  "x.htmlK.jpg", "x.svgK.png", "x.htmlİ.jpg", "x.jsK.png",
  // +xml types browsers render as documents
  "x.rss .jpg", "x.atom\t.jpg", "x.kml-.jpg", "x.xspf;.jpg",
];

describe("isAllowedUploadName vs the name formidable would store with keepExtensions", () => {
  const ACTIVE = ["html", "htm", "shtml", "xhtml", "xml", "svg", "svgz", "js", "mjs", "php", "xsl", "xslt", "mht", "mhtml", "rss", "atom", "kml", "xspf", "mml"];
  const form = formidable({}) as unknown as { _getExtension(name: string): string };

  it("never accepts a name whose stored extension would be an active type", () => {
    const attacks = ATTACKS;
    let dangerousCount = 0;
    for (const name of attacks) {
      const storedSegments = form._getExtension(name).toLowerCase().split(".").filter(Boolean);
      if (storedSegments.some((s) => ACTIVE.includes(s))) {
        dangerousCount++;
        expect(isAllowedUploadName(name), name).toBe(false);
      }
    }
    expect(dangerousCount).toBeGreaterThan(15); // the attack list really exercises the stored-name path
  });
});

describe("storedUploadName", () => {
  it("is random hex plus only the validated final extension", () => {
    expect(storedUploadName("Offer Letter (1).PDF")).toMatch(/^[0-9a-f]{32}\.pdf$/);
    // keepExtensions would have stored this one as "<id>.Shah"
    expect(storedUploadName("J.Shah Agreement.pdf")).toMatch(/^[0-9a-f]{32}\.pdf$/);
    expect(storedUploadName("a.pdf")).not.toBe(storedUploadName("a.pdf"));
  });

  it("adds no extension at all for a name the allowlist refuses", () => {
    for (const name of ["evil.html", "x.svg", "x.html .jpg", "x.htmlK.jpg", "README"]) {
      expect(storedUploadName(name), name).toMatch(/^[0-9a-f]{32}$/);
    }
  });

  it("only ever yields an allowlisted extension for a name the filter accepts", () => {
    for (const name of [...ATTACKS, "a.pdf", "b.tar.gz", "c.JPG", "J.Shah.xlsx"]) {
      if (!isAllowedUploadName(name)) continue;
      const ext = storedUploadName(name).slice(32);
      expect(ALLOWED_UPLOAD_EXTENSIONS, name).toContain(ext);
    }
  });
});

describe("mimeTypeForName", () => {
  it("maps by extension, case-insensitively", () => {
    expect(mimeTypeForName("Offer Letter.PDF")).toBe("application/pdf");
    expect(mimeTypeForName("scan.jpeg")).toBe("image/jpeg");
    expect(mimeTypeForName("plan.docx")).toBe("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  });

  it("never yields an HTML/script type, whatever the name", () => {
    for (const n of ["x.html", "x.svg", "x.js", "README", ""]) {
      expect(mimeTypeForName(n)).toBe("application/octet-stream");
    }
  });
});

describe("isAllowedUploadName", () => {
  it("accepts ordinary media and documents", () => {
    for (const n of ["photo.jpg", "clip.MP4", "Report.pdf", "sheet.xlsx", "notes.txt", "bundle.zip"]) {
      expect(isAllowedUploadName(n)).toBe(true);
    }
  });

  it("accepts the wider set of office/design/archive formats", () => {
    for (const n of ["memo.rtf", "budget.ods", "slides.key", "scan.tiff", "plan.dwg", "book.epub", "archive.7z"]) {
      expect(isAllowedUploadName(n)).toBe(true);
    }
  });

  it("rejects anything the browser would execute", () => {
    for (const n of ["evil.html", "x.svg", "a.js", "shell.php", "run.exe", "page.HTM"]) {
      expect(isAllowedUploadName(n)).toBe(false);
    }
  });

  it("rejects a double-extension smuggle", () => {
    expect(isAllowedUploadName("invoice.pdf.html")).toBe(false);
    expect(isAllowedUploadName("photo.jpg.svg")).toBe(false);
    expect(isAllowedUploadName("shell.php.jpg")).toBe(false);
    expect(isAllowedUploadName("notes.JS.pdf")).toBe(false);
    expect(isAllowedUploadName(".htaccess")).toBe(false);
    expect(isAllowedUploadName("x.html .jpg")).toBe(false);
    expect(isAllowedUploadName("x.shtml.jpg")).toBe(false);
    expect(isAllowedUploadName("x.htmlK.jpg")).toBe(false);
    expect(isAllowedUploadName("x.rss .jpg")).toBe(false);
  });

  it("accepts ordinary names that merely contain a blocked extension's letters", () => {
    for (const n of [
      "Safety.Compliance.Manual.pdf",
      "Q3.Commission.Report.xlsx",
      "Roof.Batten.Guide.pdf",
      "v2.shingle-install.pdf",
      "J.Shah Agreement.pdf",
      "Budget.Sheet.xlsx",
    ]) {
      expect(isAllowedUploadName(n)).toBe(true);
    }
  });

  it("rejects a file with no extension", () => {
    expect(isAllowedUploadName("README")).toBe(false);
    expect(isAllowedUploadName("")).toBe(false);
  });
});
