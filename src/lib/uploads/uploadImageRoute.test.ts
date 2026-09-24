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
});
