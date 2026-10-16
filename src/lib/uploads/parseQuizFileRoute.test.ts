import { describe, it, expect, vi, afterEach } from "vitest";
import http from "http";
import fs from "fs";
import type { AddressInfo } from "net";
import { signSession } from "../auth";

// /api/admin/parse-quiz-file reads an uploaded quiz into text. It deleted its
// temp copy only when reading worked, so every unreadable file stayed behind.
const handler = (await import("../../../pages/api/admin/parse-quiz-file")).default;

async function post(name: string, body: string) {
  const server = http.createServer((req, res) => {
    const shimmed = res as any;
    shimmed.status = (code: number) => { res.statusCode = code; return shimmed; };
    shimmed.json = (data: any) => { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(data)); };
    (handler as any)(req, shimmed);
  });
  await new Promise<void>((r) => server.listen(0, r));
  try {
    const f = new FormData();
    f.append("file", new Blob([body]), name);
    const res = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/admin/parse-quiz-file`, {
      method: "POST",
      headers: { Authorization: `Bearer ${signSession({ id: "test-admin", role: "admin" })}` },
      body: f,
    });
    return await res.json();
  } finally {
    server.close();
  }
}

describe("POST /api/admin/parse-quiz-file", () => {
  afterEach(() => vi.restoreAllMocks());

  it("deletes the temp copy when the file can't be read", async () => {
    const unlink = vi.spyOn(fs.promises, "unlink");
    const answer = await post("quiz.pdf", "%PDF-not-a-quiz");
    expect(answer.ok).toBe(false);
    expect(answer.error).toMatch(/Unsupported file type/);
    expect(unlink).toHaveBeenCalledTimes(1);
    expect(fs.existsSync(String(unlink.mock.calls[0][0]))).toBe(false);
  });

  it("deletes the temp copy after a successful read", async () => {
    const unlink = vi.spyOn(fs.promises, "unlink");
    const answer = await post("quiz.txt", "# Course: Roofing 101\n1. Question?\n* right\n- wrong");
    expect(answer).toEqual({ ok: true, doc: "# Course: Roofing 101\n1. Question?\n* right\n- wrong" });
    expect(unlink).toHaveBeenCalledTimes(1);
    expect(fs.existsSync(String(unlink.mock.calls[0][0]))).toBe(false);
  });
});
