import { describe, it, expect, vi, afterAll } from "vitest";
import http from "http";
import fs from "fs";
import os from "os";
import path from "path";
import type { AddressInfo } from "net";
import { signSession } from "../auth";

// The Docs & SOPs upload and file routes, exercised through a real HTTP server
// with a real formidable multipart parse and real disk writes. Only the
// Mongoose models are mocked. Files go to a throwaway temp directory — never
// the real library, which this test must not be able to touch even when run
// from a production checkout.
const TEST_DOCS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "sop-docs-test-"));
process.env.SOP_DOCS_DIR = TEST_DOCS_DIR;
vi.mock("../mongodb", () => ({ connectMongo: vi.fn().mockResolvedValue(undefined) }));

const docsById = new Map<string, any>();
vi.mock("../models/SopDocument", () => ({
  SopDocumentModel: {
    create: vi.fn(async (data: any) => {
      docsById.set(data.id, data);
      return { ...data };
    }),
    find: vi.fn(() => ({ sort: () => ({ lean: async () => [] }) })),
    findOne: vi.fn(({ id }: { id: string }) => ({ lean: async () => docsById.get(id) ?? null })),
  },
}));
vi.mock("../models/SopFolder", () => ({
  SopFolderModel: {
    exists: vi.fn(async ({ id }: { id: string }) => (id === "sopfolder-known" ? { _id: "x" } : null)),
  },
}));
vi.mock("../models/User", () => ({
  UserModel: { findOne: vi.fn(() => ({ lean: async () => ({ name: "Test Admin", email: "a@a.com" }) })) },
}));

const uploadHandler = (await import("../../../pages/api/docs/index")).default;
const fileHandler = (await import("../../../pages/api/docs/[id]/file")).default;
const previewHandler = (await import("../../../pages/api/docs/[id]/preview")).default;

// Stand-in for LibreOffice's soffice: writes <outdir>/<stem>.pdf.
const FAKE_SOFFICE = path.join(TEST_DOCS_DIR, "..", `fake-soffice-${path.basename(TEST_DOCS_DIR)}`);
fs.writeFileSync(
  FAKE_SOFFICE,
  `#!/usr/bin/env node
const fs = require("fs"), path = require("path");
const a = process.argv.slice(2), src = a[a.length - 1], base = path.basename(src);
fs.writeFileSync(path.join(a[a.indexOf("--outdir") + 1], base.slice(0, base.lastIndexOf(".")) + ".pdf"), "%PDF-1.4 converted");
`,
  { mode: 0o755 },
);

// A plain http server standing in for Next: shim the res helpers Next adds and
// route by path.
function startServer() {
  const server = http.createServer((req, res) => {
    const shimmed = res as any;
    shimmed.status = (code: number) => { res.statusCode = code; return shimmed; };
    shimmed.json = (data: any) => { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(data)); };
    const fileMatch = /^\/api\/docs\/([^/]+)\/(file|preview)$/.exec(req.url || "");
    if (fileMatch) {
      (req as any).query = { id: fileMatch[1] };
      ((fileMatch[2] === "file" ? fileHandler : previewHandler) as any)(req, shimmed);
    } else {
      (uploadHandler as any)(req, shimmed);
    }
  });
  return new Promise<{ server: http.Server; url: string }>((resolve) => {
    server.listen(0, () => {
      const port = (server.address() as AddressInfo).port;
      resolve({ server, url: `http://127.0.0.1:${port}` });
    });
  });
}

const token = () => signSession({ id: "test-admin", role: "admin" });

async function upload(url: string, opts: { name?: string; bytes?: string; type?: string; folderId?: string } = {}) {
  const name = opts.name ?? "test.pdf";
  const body = new FormData();
  body.append("title", name);
  body.append("description", "");
  if (opts.folderId) body.append("folderId", opts.folderId);
  body.append("file", new Blob([Buffer.from(opts.bytes ?? "%PDF-1.4 fake pdf bytes")], { type: opts.type ?? "application/pdf" }), name);
  return fetch(`${url}/api/docs`, { method: "POST", headers: { Authorization: `Bearer ${token()}` }, body });
}

async function withServer<T>(fn: (url: string) => Promise<T>): Promise<T> {
  const { server, url } = await startServer();
  try {
    return await fn(url);
  } finally {
    server.close();
  }
}

afterAll(() => {
  fs.rmSync(TEST_DOCS_DIR, { recursive: true, force: true });
  fs.rmSync(FAKE_SOFFICE, { force: true });
  delete process.env.SOP_DOCS_DIR;
  delete process.env.SOFFICE_PATH;
});

describe("POST /api/docs", () => {
  it("accepts a PDF with no folderId (Uncategorized), written only to the configured directory", () =>
    withServer(async (url) => {
      const realDir = path.join(process.cwd(), "private-uploads", "docs");
      const snapshot = () => (fs.existsSync(realDir) ? fs.readdirSync(realDir).sort() : null);
      const before = snapshot();
      const res = await upload(url);
      expect(res.status).toBe(201);
      expect((await res.json()).folderId).toBeNull();
      expect(fs.readdirSync(TEST_DOCS_DIR).length).toBeGreaterThan(0);
      expect(snapshot()).toEqual(before); // the real library is untouched
    }));

  it("stores the file under a random name with only its validated extension", () =>
    withServer(async (url) => {
      const res = await upload(url, { name: "J.Shah Agreement.pdf" });
      expect(res.status).toBe(201);
      const { id } = await res.json();
      expect(docsById.get(id).storageKey).toMatch(/^[0-9a-f]{32}\.pdf$/);
    }));

  it("files a PDF into an existing folder", () =>
    withServer(async (url) => {
      const res = await upload(url, { folderId: "sopfolder-known" });
      expect(res.status).toBe(201);
      expect((await res.json()).folderId).toBe("sopfolder-known");
    }));

  it("files into Uncategorized when the folder no longer exists", () =>
    withServer(async (url) => {
      const res = await upload(url, { folderId: "sopfolder-deleted" });
      expect(res.status).toBe(201);
      expect((await res.json()).folderId).toBeNull();
    }));

  it("names the refused file instead of claiming none was sent", () =>
    withServer(async (url) => {
      const res = await upload(url, { name: "Quotation of cashier" });
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe(`"Quotation of cashier" isn't an allowed file type`);
    }));

  it("says so when the file is empty", () =>
    withServer(async (url) => {
      const res = await upload(url, { name: "empty.pdf", bytes: "" });
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("That file is empty");
    }));

  it("refuses a raw octet-stream upload, whose parser would skip the allowlist filter", () =>
    withServer(async (url) => {
      const before = fs.readdirSync(TEST_DOCS_DIR).sort();
      const res = await fetch(`${url}/api/docs`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/octet-stream", "x-file-name": "evil.html" },
        body: "<script>alert(1)</script>",
      });
      expect(res.status).toBe(415);
      expect(fs.readdirSync(TEST_DOCS_DIR).sort()).toEqual(before);
    }));

  it("stores a type from the extension, not the one the client claimed", () =>
    withServer(async (url) => {
      const res = await upload(url, { name: "notes.pdf", type: "text/html", bytes: "<script>alert(1)</script>" });
      expect(res.status).toBe(201);
      expect((await res.json()).mimeType).toBe("application/pdf");
    }));
});

describe("GET /api/docs/[id]/file", () => {
  it("serves by extension with nosniff and a sandbox CSP, even for a record holding a spoofed type", () =>
    withServer(async (url) => {
      const up = await upload(url, { name: "legacy.pdf" });
      const { id } = await up.json();
      docsById.get(id).mimeType = "text/html"; // as an older, client-typed record would hold
      const res = await fetch(`${url}/api/docs/${id}/file`, { headers: { Authorization: `Bearer ${token()}` } });
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("application/pdf");
      expect(res.headers.get("x-content-type-options")).toBe("nosniff");
      expect(res.headers.get("content-security-policy")).toBe("sandbox");
    }));
});

describe("GET /api/docs/[id]/preview", () => {
  const get = (url: string, id: string) =>
    fetch(`${url}/api/docs/${id}/preview`, { headers: { Authorization: `Bearer ${token()}` } });

  it("serves a Word document as a view-only PDF", () =>
    withServer(async (url) => {
      process.env.SOFFICE_PATH = FAKE_SOFFICE;
      const { id } = await (await upload(url, { name: "202411055-Dipak.doc" })).json();
      const res = await get(url, id);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("application/pdf");
      expect(res.headers.get("x-content-type-options")).toBe("nosniff");
      expect(res.headers.get("content-security-policy")).toBe("sandbox");
      expect(await res.text()).toBe("%PDF-1.4 converted");
    }));

  it("refuses types the browser shows directly or can't preview at all", () =>
    withServer(async (url) => {
      const { id } = await (await upload(url, { name: "bundle.zip" })).json();
      expect((await get(url, id)).status).toBe(415);
    }));

  it("says previews aren't set up when LibreOffice isn't installed", () =>
    withServer(async (url) => {
      process.env.SOFFICE_PATH = path.join(TEST_DOCS_DIR, "no-such-soffice");
      const { id } = await (await upload(url, { name: "sheet.xlsx" })).json();
      const res = await get(url, id);
      expect(res.status).toBe(503);
      expect((await res.json()).error).toMatch(/aren't set up/);
    }));
});
