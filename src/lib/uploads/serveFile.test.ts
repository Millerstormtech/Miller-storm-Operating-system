import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import http from "http";
import os from "os";
import path from "path";
import type { AddressInfo } from "net";
import { sendFile } from "./serveFile";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "serve-file-test-"));
const file = path.join(dir, "doc.pdf");
const content = "0123456789abcdefghij"; // 20 bytes
let server: http.Server;
let base: string;

beforeAll(async () => {
  fs.writeFileSync(file, content);
  server = http.createServer((req, res) => sendFile(req, res, file, { "Content-Type": "application/pdf", "Cache-Control": "private, max-age=86400" }));
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => {
  server.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

const get = (range?: string) => fetch(base, { headers: range ? { Range: range } : {} });

describe("sendFile", () => {
  it("sends the whole file with its length and range support advertised", async () => {
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.headers.get("accept-ranges")).toBe("bytes");
    expect(res.headers.get("content-length")).toBe("20");
    expect(res.headers.get("cache-control")).toBe("private, max-age=86400");
    expect(await res.text()).toBe(content);
  });

  it("serves a byte range as 206", async () => {
    const res = await get("bytes=5-9");
    expect(res.status).toBe(206);
    expect(res.headers.get("content-range")).toBe("bytes 5-9/20");
    expect(res.headers.get("content-length")).toBe("5");
    expect(await res.text()).toBe("56789");
  });

  it("serves open-ended and suffix ranges, clamping past the end", async () => {
    expect(await (await get("bytes=15-")).text()).toBe("fghij");
    expect(await (await get("bytes=-3")).text()).toBe("hij");
    const past = await get("bytes=18-999");
    expect(past.headers.get("content-range")).toBe("bytes 18-19/20");
    expect(await past.text()).toBe("ij");
  });

  it("refuses a range that starts past the end", async () => {
    const res = await get("bytes=50-60");
    expect(res.status).toBe(416);
    expect(res.headers.get("content-range")).toBe("bytes */20");
  });

  it("answers a multi-range request with the whole file", async () => {
    const res = await get("bytes=0-1,5-6");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(content);
  });
});
