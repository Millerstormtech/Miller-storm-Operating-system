import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { needsPdfConversion } from "./previewTypes";

// A stand-in for LibreOffice: writes <outdir>/<stem>.pdf like soffice does,
// counts its runs, and (like the real thing) exits 0 without output for a
// file it can't read.
const FAKE_SOFFICE = `#!/usr/bin/env node
const fs = require("fs"), path = require("path");
const args = process.argv.slice(2);
const outdir = args[args.indexOf("--outdir") + 1];
const src = args[args.length - 1];
fs.appendFileSync(process.env.FAKE_SOFFICE_COUNTER, "x");
setTimeout(() => {
  if (path.basename(src).includes("broken")) process.exit(0);
  const base = path.basename(src);
  fs.writeFileSync(path.join(outdir, base.slice(0, base.lastIndexOf(".")) + ".pdf"), "%PDF-1.4 fake");
}, 100);
`;

const root = fs.mkdtempSync(path.join(os.tmpdir(), "sop-preview-test-"));
const docsRoot = path.join(root, "docs");
const counter = path.join(root, "runs");
let mod: typeof import("./docPreview");

function source(name: string): string {
  const p = path.join(docsRoot, name);
  fs.writeFileSync(p, "fake office bytes");
  return p;
}
const runs = () => (fs.existsSync(counter) ? fs.readFileSync(counter, "utf8").length : 0);

beforeAll(async () => {
  fs.mkdirSync(docsRoot, { recursive: true });
  const bin = path.join(root, "soffice");
  fs.writeFileSync(bin, FAKE_SOFFICE, { mode: 0o755 });
  process.env.SOP_DOCS_DIR = docsRoot;
  process.env.SOFFICE_PATH = bin;
  process.env.FAKE_SOFFICE_COUNTER = counter;
  mod = await import("./docPreview");
});

afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
  delete process.env.SOP_DOCS_DIR;
  delete process.env.SOFFICE_PATH;
  delete process.env.FAKE_SOFFICE_COUNTER;
});

describe("needsPdfConversion", () => {
  it("covers Office formats but not ones the browser already shows", () => {
    for (const n of ["202411055-Dipak.doc", "plan.DOCX", "sheet.xlsx", "deck.pptx", "notes.txt", "data.csv"]) {
      expect(needsPdfConversion(n), n).toBe(true);
    }
    for (const n of ["scan.pdf", "photo.jpg", "clip.mp4", "bundle.zip", "README"]) {
      expect(needsPdfConversion(n), n).toBe(false);
    }
  });
});

describe("pdfPreviewFor", () => {
  it("converts once, then serves the cached PDF", async () => {
    const before = runs();
    const src = source("aaa.doc");
    const first = await mod.pdfPreviewFor(src, "aaa.doc");
    expect(first).toBe(mod.previewPathFor("aaa.doc"));
    expect(fs.readFileSync(first, "utf8")).toBe("%PDF-1.4 fake");
    await mod.pdfPreviewFor(src, "aaa.doc");
    expect(runs() - before).toBe(1);
  });

  it("shares one conversion between concurrent requests for the same document", async () => {
    const before = runs();
    const src = source("bbb.docx");
    const results = await Promise.all([1, 2, 3].map(() => mod.pdfPreviewFor(src, "bbb.docx")));
    expect(new Set(results).size).toBe(1);
    expect(runs() - before).toBe(1);
  });

  it("fails cleanly when LibreOffice produces nothing, leaving no cache or work dirs", async () => {
    const src = source("broken.doc");
    await expect(mod.pdfPreviewFor(src, "broken.doc")).rejects.toThrow("could not convert");
    expect(fs.existsSync(mod.previewPathFor("broken.doc"))).toBe(false);
    expect(fs.readdirSync(path.join(docsRoot, "previews")).filter((f) => f.startsWith(".work-"))).toEqual([]);
  });

  it("reports ENOENT when soffice isn't installed", async () => {
    const saved = process.env.SOFFICE_PATH;
    process.env.SOFFICE_PATH = path.join(root, "no-such-soffice");
    try {
      await expect(mod.pdfPreviewFor(source("ccc.doc"), "ccc.doc")).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      process.env.SOFFICE_PATH = saved;
    }
  });
});
