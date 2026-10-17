import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import http from "http";
import fs from "fs";
import path from "path";
import type { AddressInfo } from "net";
import { signSession } from "../auth";

// The two AI-bot upload routes write into public/uploads, which nginx serves
// from the app's own origin. They used to keep ANY file type (an .html page
// became same-origin script) and left refused or failed uploads on disk.

const bots = new Map<string, any>();
vi.mock("../mongodb", () => ({ connectMongo: async () => {} }));
vi.mock("../models/AiBot", () => ({ AiBotModel: { findOne: async ({ id }: { id: string }) => bots.get(id) ?? null } }));
vi.mock("../rag", () => ({ reindexBotInBackground: () => {} }));

const UPLOADS = path.join(process.cwd(), "public", "uploads");
const BOT_UPLOADS = path.join(UPLOADS, "bots");
const uploadsExisted = fs.existsSync(UPLOADS);
const botUploadsExisted = fs.existsSync(BOT_UPLOADS);

const avatarHandler = (await import("../../../pages/api/ai-bots/upload-avatar")).default;
const botFileHandler = (await import("../../../pages/api/ai-bots/upload")).default; // creates public/uploads/bots

const list = (dir: string) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f !== "bots") : []);

async function withServer(handler: any, dir: string, fn: (url: string, isNew: () => string[]) => Promise<void>) {
  const before = new Set(list(dir));
  const server = http.createServer((req, res) => {
    const shimmed = res as any;
    shimmed.status = (code: number) => { res.statusCode = code; return shimmed; };
    shimmed.json = (data: any) => { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(data)); };
    handler(req, shimmed);
  });
  await new Promise<void>((r) => server.listen(0, r));
  try {
    await fn(`http://127.0.0.1:${(server.address() as AddressInfo).port}`, () => list(dir).filter((f) => !before.has(f)));
  } finally {
    server.close();
    // Never leave anything behind in the real uploads dirs, even on failure.
    for (const f of list(dir)) if (!before.has(f)) fs.rmSync(path.join(dir, f), { force: true });
  }
}

const adminAuth = () => ({ Authorization: `Bearer ${signSession({ id: "test-admin", role: "admin" })}` });
const form = (name: string, body: string, extra: Record<string, string> = {}) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(extra)) f.append(k, v);
  f.append("file", new Blob([body]), name);
  return f;
};

describe("POST /api/ai-bots/upload-avatar", () => {
  for (const name of ["logo.svg", "page.html", "notes.pdf"]) {
    it(`refuses ${name} with a clear message and leaves nothing behind`, async () => {
      await withServer(avatarHandler, UPLOADS, async (url, isNew) => {
        const res = await fetch(`${url}/api/ai-bots/upload-avatar`, { method: "POST", headers: adminAuth(), body: form(name, "<svg onload=alert(1)>") });
        expect(res.status).toBe(400);
        expect((await res.json()).error).toBe(`"${name}" can't be used as an avatar. Use a JPG, PNG, GIF or WebP image.`);
        expect(isNew()).toEqual([]);
      });
    });
  }

  it("an empty image is refused and nothing is left behind", async () => {
    await withServer(avatarHandler, UPLOADS, async (url, isNew) => {
      const res = await fetch(`${url}/api/ai-bots/upload-avatar`, { method: "POST", headers: adminAuth(), body: form("face.png", "") });
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("That file is empty");
      expect(isNew()).toEqual([]);
    });
  });

  it("a PNG is saved under a random name and its address returned", async () => {
    await withServer(avatarHandler, UPLOADS, async (url, isNew) => {
      const res = await fetch(`${url}/api/ai-bots/upload-avatar`, { method: "POST", headers: adminAuth(), body: form("Face.PNG", "png-bytes") });
      expect(res.status).toBe(200);
      const { url: saved } = await res.json();
      expect(saved).toMatch(/^\/uploads\/[0-9a-f]{32}\.png$/);
      expect(isNew()).toEqual([path.basename(saved)]);
    });
  });

  it("is admin only", async () => {
    await withServer(avatarHandler, UPLOADS, async (url, isNew) => {
      const res = await fetch(`${url}/api/ai-bots/upload-avatar`, {
        method: "POST",
        headers: { Authorization: `Bearer ${signSession({ id: "test-rep", role: "sales" })}` },
        body: form("face.png", "png-bytes"),
      });
      expect(res.status).toBe(403);
      expect(isNew()).toEqual([]);
    });
  });
});

describe("POST /api/ai-bots/upload", () => {
  beforeEach(() => {
    bots.clear();
    bots.set("bot-1", { id: "bot-1", trainingLinks: [], trainingText: "", save: async () => {} });
  });

  it("refuses a web page with a clear message and leaves nothing behind", async () => {
    await withServer(botFileHandler, BOT_UPLOADS, async (url, isNew) => {
      const res = await fetch(`${url}/api/ai-bots/upload`, { method: "POST", headers: adminAuth(), body: form("guide.html", "<script>alert(1)</script>", { botId: "bot-1" }) });
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe(`"guide.html" can't be used to train a bot. Use a PDF, Word, Excel, CSV, text, audio or video file.`);
      expect(isNew()).toEqual([]);
      expect(bots.get("bot-1").trainingLinks).toEqual([]);
    });
  });

  it("a file for a bot that doesn't exist is deleted", async () => {
    await withServer(botFileHandler, BOT_UPLOADS, async (url, isNew) => {
      const res = await fetch(`${url}/api/ai-bots/upload`, { method: "POST", headers: adminAuth(), body: form("notes.txt", "hello", { botId: "no-such-bot" }) });
      expect(res.status).toBe(404);
      expect(isNew()).toEqual([]);
    });
  });

  it("a file that can't be read is deleted", async () => {
    await withServer(botFileHandler, BOT_UPLOADS, async (url, isNew) => {
      const res = await fetch(`${url}/api/ai-bots/upload`, { method: "POST", headers: adminAuth(), body: form("broken.pdf", "not really a pdf", { botId: "bot-1" }) });
      expect(res.status).toBe(500);
      expect(isNew()).toEqual([]);
    });
  });

  it("a text file trains the bot and is kept", async () => {
    await withServer(botFileHandler, BOT_UPLOADS, async (url, isNew) => {
      const res = await fetch(`${url}/api/ai-bots/upload`, { method: "POST", headers: adminAuth(), body: form("Roof Guide.txt", "Shingles overlap by 5 inches.", { botId: "bot-1" }) });
      expect(res.status).toBe(200);
      const { link } = await res.json();
      expect(link.url).toMatch(/^\/uploads\/bots\/[0-9a-f]{32}\.txt$/);
      expect(link.originalName).toBe("Roof Guide.txt");
      expect(isNew()).toEqual([path.basename(link.url)]);
      expect(bots.get("bot-1").trainingText).toContain("[File: Roof Guide.txt]\nShingles overlap by 5 inches.");
    });
  });
});

// Leave the real public folders as we found them.
afterAll(() => {
  if (!botUploadsExisted && fs.existsSync(BOT_UPLOADS) && fs.readdirSync(BOT_UPLOADS).length === 0) fs.rmdirSync(BOT_UPLOADS);
  if (!uploadsExisted && fs.existsSync(UPLOADS) && fs.readdirSync(UPLOADS).length === 0) fs.rmdirSync(UPLOADS);
});
