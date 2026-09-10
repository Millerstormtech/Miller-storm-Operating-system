import { describe, it, expect } from "vitest";
import { isAllowedUploadName } from "./allowedTypes";

describe("isAllowedUploadName", () => {
  it("accepts ordinary media and documents", () => {
    for (const n of ["photo.jpg", "clip.MP4", "Report.pdf", "sheet.xlsx", "notes.txt", "bundle.zip"]) {
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
  });

  it("rejects a file with no extension", () => {
    expect(isAllowedUploadName("README")).toBe(false);
    expect(isAllowedUploadName("")).toBe(false);
  });
});
