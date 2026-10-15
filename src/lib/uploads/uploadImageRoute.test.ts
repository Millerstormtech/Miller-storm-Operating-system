import { describe, it, expect } from "vitest";
import http from "http";
import fs from "fs";
import path from "path";
import type { AddressInfo } from "net";
import { signSession } from "../auth";

// /api/upload-image writes into public/uploads, which nginx serves by file
// extension. formidable's octet-stream parser never runs the allowlist
// `filter`, so the route must not accept that content type at all.
const handler = (await import("../../../pages/api/upload-image")).default;

const UPLOADS = path.join(process.cwd(), "public", "uploads");
const listUploads = () => (fs.existsSync(UPLOADS) ? fs.readdirSync(UPLOADS) : []);

describe("POST /api/upload-image", () => {
  it("refuses a raw octet-stream upload and writes nothing", async () => {
    const existedBefore = fs.existsSync(UPLOADS);
    const before = new Set(listUploads());
    const server = http.createServer((req, res) => {
      const shimmed = res as any;
      shimmed.status = (code: number) => { res.statusCode = code; return shimmed; };
      shimmed.json = (data: any) => { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(data)); };
      (handler as any)(req, shimmed);
    });
    await new Promise<void>((r) => server.listen(0, r));
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    try {
      const res = await fetch(`${url}/api/upload-image`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${signSession({ id: "test-user", role: "sales" })}`,
          "Content-Type": "application/octet-stream",
          "x-file-name": "evil.html",
        },
        body: "<script>alert(1)</script>",
      });
      expect(res.ok).toBe(false);
      expect(listUploads().filter((f) => !before.has(f))).toEqual([]);
    } finally {
      server.close();
      // Never leave anything behind in the real uploads dir, even on failure.
      for (const f of listUploads()) if (!before.has(f)) fs.rmSync(path.join(UPLOADS, f), { force: true });
      if (!existedBefore && fs.existsSync(UPLOADS) && listUploads().length === 0) fs.rmdirSync(UPLOADS);
    }
  });

  // Refused uploads must leave NOTHING in the public uploads folder, checked
  // at the moment the answer arrives (the old route answered first and
  // deleted later, and could leave an empty file behind for good).
  async function withServer(fn: (url: string) => Promise<void>) {
    const existedBefore = fs.existsSync(UPLOADS);
    const before = new Set(listUploads());
    const server = http.createServer((req, res) => {
      const shimmed = res as any;
      shimmed.status = (code: number) => { res.statusCode = code; return shimmed; };
      shimmed.json = (data: any) => { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(data)); };
      (handler as any)(req, shimmed);
    });
    await new Promise<void>((r) => server.listen(0, r));
    try {
      await fn(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
    } finally {
      server.close();
      for (const f of listUploads()) if (!before.has(f)) fs.rmSync(path.join(UPLOADS, f), { force: true });
      if (!existedBefore && fs.existsSync(UPLOADS) && listUploads().length === 0) fs.rmdirSync(UPLOADS);
    }
    return before;
  }
  const auth = () => ({ Authorization: `Bearer ${signSession({ id: "test-user", role: "sales" })}` });
  const form = (name: string, body: string) => { const f = new FormData(); f.append("file", new Blob([body]), name); return f; };

  it("an empty file is refused with a clear message and nothing is left behind", async () => {
    const before = new Set(listUploads());
    await withServer(async (url) => {
      const res = await fetch(`${url}/api/upload-image`, { method: "POST", headers: auth(), body: form("empty.png", "") });
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("That file is empty");
      expect(listUploads().filter((f) => !before.has(f))).toEqual([]);
    });
  });

  it("a blocked file type names the file and nothing is left behind", async () => {
    const before = new Set(listUploads());
    await withServer(async (url) => {
      const res = await fetch(`${url}/api/upload-image`, { method: "POST", headers: auth(), body: form("evil.html", "<script>alert(1)</script>") });
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe(`"evil.html" isn't an allowed file type`);
      expect(listUploads().filter((f) => !before.has(f))).toEqual([]);
    });
  });

  it("an allowed file is saved and its address returned", async () => {
    await withServer(async (url) => {
      const res = await fetch(`${url}/api/upload-image`, { method: "POST", headers: auth(), body: form("photo.png", "png-bytes") });
      expect(res.status).toBe(200);
      const { url: saved } = await res.json();
      expect(saved).toMatch(/^\/uploads\/.+\.png$/);
      expect(fs.existsSync(path.join(UPLOADS, path.basename(saved)))).toBe(true);
    });
  });
});
