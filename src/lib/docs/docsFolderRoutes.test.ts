import { describe, it, expect, vi, beforeEach } from "vitest";
import http from "http";
import type { AddressInfo } from "net";
import { signSession } from "../auth";

// The Docs & SOPs folder and document routes over real HTTP, against a small
// in-memory stand-in for the two Mongoose models.
const store = vi.hoisted(() => {
  const matches = (row: any, filter: Record<string, any>) =>
    Object.entries(filter).every(([k, v]) => {
      if (v && typeof v === "object" && "$ne" in v) return row[k] !== v.$ne;
      if (v === null) return row[k] === null || row[k] === undefined;
      return row[k] === v;
    });
  const query = (result: any) => ({ lean: async () => result, sort: () => query(result) });
  const fakeModel = (rows: any[]) => ({
    find: (filter: Record<string, any> = {}) => query(rows.filter((r) => matches(r, filter)).map((r) => ({ ...r }))),
    findOne: (filter: Record<string, any>) => query(rows.find((r) => matches(r, filter)) ?? null),
    exists: async (filter: Record<string, any>) => (rows.some((r) => matches(r, filter)) ? { _id: "x" } : null),
    create: async (data: any) => { const row = { ...data }; rows.push(row); return row; },
    updateOne: async (filter: Record<string, any>, update: any) => { const r = rows.find((x) => matches(x, filter)); if (r) Object.assign(r, update); },
    updateMany: async (filter: Record<string, any>, update: any) => { rows.filter((x) => matches(x, filter)).forEach((r) => Object.assign(r, update)); },
    deleteOne: async (filter: Record<string, any>) => { const i = rows.findIndex((x) => matches(x, filter)); if (i >= 0) rows.splice(i, 1); },
  });
  const folders: any[] = [];
  const docs: any[] = [];
  return { folders, docs, folderModel: fakeModel(folders), docModel: fakeModel(docs) };
});

vi.mock("../mongodb", () => ({ connectMongo: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../models/SopFolder", () => ({ SopFolderModel: store.folderModel }));
vi.mock("../models/SopDocument", () => ({ SopDocumentModel: store.docModel }));
vi.mock("../models/User", () => ({
  UserModel: { findOne: () => ({ lean: async () => ({ name: "Test Admin" }) }) },
}));

const foldersIndex = (await import("../../../pages/api/docs/folders/index")).default;
const folderById = (await import("../../../pages/api/docs/folders/[id]")).default;
const docById = (await import("../../../pages/api/docs/[id]/index")).default;
const docsIndex = (await import("../../../pages/api/docs/index")).default;
const docFile = (await import("../../../pages/api/docs/[id]/file")).default;

const server = http.createServer(async (req, res) => {
  const shimmed = res as any;
  shimmed.status = (code: number) => { res.statusCode = code; return shimmed; };
  shimmed.json = (data: any) => { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(data)); };
  let raw = "";
  for await (const chunk of req) raw += chunk;
  (req as any).body = raw ? JSON.parse(raw) : {};
  const path = (req.url || "").split("?")[0];
  let m: RegExpExecArray | null;
  if (path === "/api/docs/folders") return (foldersIndex as any)(req, shimmed);
  if ((m = /^\/api\/docs\/folders\/([^/]+)$/.exec(path))) { (req as any).query = { id: m[1] }; return (folderById as any)(req, shimmed); }
  if (path === "/api/docs") return (docsIndex as any)(req, shimmed);
  if ((m = /^\/api\/docs\/([^/]+)\/file$/.exec(path))) { (req as any).query = { id: m[1] }; return (docFile as any)(req, shimmed); }
  if ((m = /^\/api\/docs\/([^/]+)$/.exec(path))) { (req as any).query = { id: m[1] }; return (docById as any)(req, shimmed); }
  res.statusCode = 404;
  res.end();
});
await new Promise<void>((r) => server.listen(0, r));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

async function call(method: string, path: string, body?: unknown, role = "admin") {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { Authorization: `Bearer ${signSession({ id: "u1", role })}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}
const createFolder = (name: string, parentId: string | null = null) => call("POST", "/api/docs/folders", { name, parentId });

beforeEach(() => {
  store.folders.length = 0;
  store.docs.length = 0;
});

describe("folders", () => {
  it("nests folders, reusing a same-named folder only within the same parent", async () => {
    const hr = await createFolder("HR");
    expect(hr.status).toBe(201);
    expect(hr.data.parentId).toBeNull();

    const y24 = await createFolder("2024", hr.data.id);
    expect(y24.status).toBe(201);
    expect(y24.data.parentId).toBe(hr.data.id);

    const again = await createFolder("  2024 ", hr.data.id);
    expect(again.status).toBe(200);
    expect(again.data.id).toBe(y24.data.id);

    const topLevel2024 = await createFolder("2024");
    expect(topLevel2024.status).toBe(201);
    expect(topLevel2024.data.id).not.toBe(y24.data.id);
  });

  it("refuses a folder inside one that no longer exists, and an empty name", async () => {
    expect((await createFolder("X", "sopfolder-gone")).status).toBe(400);
    expect((await createFolder("   ")).status).toBe(400);
  });

  it("lists parentId for every folder, with pre-nesting folders at the top level", async () => {
    store.folders.push({ id: "legacy", name: "Old folder" }); // created before nesting: no parentId field
    const hr = await createFolder("HR");
    await createFolder("Policies", hr.data.id);
    const { status, data } = await call("GET", "/api/docs/folders", undefined, "sales");
    expect(status).toBe(200);
    expect(data).toEqual(expect.arrayContaining([
      { id: "legacy", name: "Old folder", parentId: null },
      { id: hr.data.id, name: "HR", parentId: null },
      expect.objectContaining({ name: "Policies", parentId: hr.data.id }),
    ]));
  });

  it("renames, refusing a name a sibling already has", async () => {
    const hr = await createFolder("HR");
    const a = await createFolder("2024", hr.data.id);
    await createFolder("2025", hr.data.id);

    expect((await call("PATCH", `/api/docs/folders/${a.data.id}`, { name: "2023" })).data.name).toBe("2023");
    const clash = await call("PATCH", `/api/docs/folders/${a.data.id}`, { name: "2025" });
    expect(clash.status).toBe(409);
    expect(clash.data.error).toMatch(/already exists/);
    expect((await call("PATCH", `/api/docs/folders/${a.data.id}`, { name: "" })).status).toBe(400);
  });

  it("moves folders, but never into themselves or their own subfolders", async () => {
    const hr = await createFolder("HR");
    const y24 = await createFolder("2024", hr.data.id);
    const offers = await createFolder("Offers", y24.data.id);
    const sales = await createFolder("Sales");

    expect((await call("PATCH", `/api/docs/folders/${hr.data.id}`, { parentId: offers.data.id })).status).toBe(400);
    expect((await call("PATCH", `/api/docs/folders/${hr.data.id}`, { parentId: hr.data.id })).status).toBe(400);
    expect((await call("PATCH", `/api/docs/folders/${hr.data.id}`, { parentId: "sopfolder-gone" })).status).toBe(400);

    const moved = await call("PATCH", `/api/docs/folders/${offers.data.id}`, { parentId: sales.data.id });
    expect(moved.status).toBe(200);
    expect(store.folders.find((f) => f.id === offers.data.id).parentId).toBe(sales.data.id);

    expect((await call("PATCH", `/api/docs/folders/${offers.data.id}`, { parentId: null })).data.parentId).toBeNull();
  });

  it("deleting a folder moves its documents and subfolders up a level instead of deleting them", async () => {
    const hr = await createFolder("HR");
    const y24 = await createFolder("2024", hr.data.id);
    const offers = await createFolder("Offers", y24.data.id);
    store.docs.push({ id: "d1", title: "Offer", folderId: y24.data.id }, { id: "d2", title: "Other", folderId: hr.data.id });

    const del = await call("DELETE", `/api/docs/folders/${y24.data.id}`);
    expect(del.status).toBe(200);
    expect(del.data.movedTo).toBe(hr.data.id);
    expect(store.folders.some((f) => f.id === y24.data.id)).toBe(false);
    expect(store.folders.find((f) => f.id === offers.data.id).parentId).toBe(hr.data.id);
    expect(store.docs.find((d) => d.id === "d1").folderId).toBe(hr.data.id);
    expect(store.docs.find((d) => d.id === "d2").folderId).toBe(hr.data.id);
  });

  it("only admin and C-Level can change folders", async () => {
    expect((await call("POST", "/api/docs/folders", { name: "X" }, "sales")).status).toBe(403);
    const hr = await createFolder("HR");
    expect((await call("PATCH", `/api/docs/folders/${hr.data.id}`, { name: "Y" }, "marketing")).status).toBe(403);
    expect((await call("DELETE", `/api/docs/folders/${hr.data.id}`, undefined, "sales")).status).toBe(403);
    expect((await call("POST", "/api/docs/folders", { name: "C-level folder" }, "c-level")).status).toBe(201);
  });
});

describe("documents", () => {
  it("renames a document, cleaning the name and refusing an empty one", async () => {
    store.docs.push({ id: "d1", title: "old", folderId: null });
    const ok = await call("PATCH", "/api/docs/d1", { title: "  Offer   letter – Dipak " });
    expect(ok.status).toBe(200);
    expect(ok.data.title).toBe("Offer letter – Dipak");
    expect(store.docs[0].title).toBe("Offer letter – Dipak");
    expect((await call("PATCH", "/api/docs/d1", { title: " " })).status).toBe(400);
    expect((await call("PATCH", "/api/docs/d1", { title: "x" }, "sales")).status).toBe(403);
  });

  it("moves a document only into a folder that exists", async () => {
    const hr = await createFolder("HR");
    store.docs.push({ id: "d1", title: "Doc", folderId: null });
    expect((await call("PATCH", "/api/docs/d1", { folderId: "sopfolder-gone" })).status).toBe(400);
    expect(store.docs[0].folderId).toBeNull();
    const moved = await call("PATCH", "/api/docs/d1", { folderId: hr.data.id });
    expect(moved.status).toBe(200);
    expect(store.docs[0].folderId).toBe(hr.data.id);
    expect((await call("PATCH", "/api/docs/d1", { folderId: null })).data.folderId).toBeNull();
  });
});

describe("who can see which folder", () => {
  //  HR (Sales only)
  //  └── Payroll (Marketing only — but HR already hides Marketing)
  //  Public (everyone)
  //  Locked (Admin & C-Level only)
  beforeEach(() => {
    store.folders.push(
      { id: "hr", name: "HR", parentId: null, visibleTo: ["sales"] },
      { id: "pay", name: "Payroll", parentId: "hr", visibleTo: ["marketing"] },
      { id: "pub", name: "Public", parentId: null },
      { id: "locked", name: "Locked", parentId: null, visibleTo: [] },
    );
    store.docs.push(
      { id: "d-top", title: "Top", folderId: null, storageKey: "none.pdf" },
      { id: "d-hr", title: "HR doc", folderId: "hr", storageKey: "none.pdf" },
      { id: "d-pay", title: "Pay doc", folderId: "pay", storageKey: "none.pdf" },
      { id: "d-pub", title: "Public doc", folderId: "pub", storageKey: "none.pdf" },
      { id: "d-locked", title: "Locked doc", folderId: "locked", storageKey: "none.pdf" },
    );
  });
  const ids = (rows: any[]) => rows.map((r) => r.id).sort();

  it("a viewer only receives the folders and documents their account type may see", async () => {
    const folders = await call("GET", "/api/docs/folders", undefined, "sales");
    expect(ids(folders.data)).toEqual(["hr", "pub"]);
    expect(folders.data.every((f: any) => !("visibleTo" in f))).toBe(true); // access settings stay with managers
    expect(ids((await call("GET", "/api/docs", undefined, "sales")).data)).toEqual(["d-hr", "d-pub", "d-top"]);

    // Payroll lets Marketing in, but HR (above it) doesn't — so neither shows.
    expect(ids((await call("GET", "/api/docs/folders", undefined, "marketing")).data)).toEqual(["pub"]);
    expect(ids((await call("GET", "/api/docs", undefined, "marketing")).data)).toEqual(["d-pub", "d-top"]);
    expect(ids((await call("GET", "/api/docs/folders", undefined, "branch-manager")).data)).toEqual(["pub"]);
  });

  it("Admin and C-Level see everything, with each folder's setting", async () => {
    for (const role of ["admin", "c-level"]) {
      const folders = await call("GET", "/api/docs/folders", undefined, role);
      expect(ids(folders.data)).toEqual(["hr", "locked", "pay", "pub"]);
      expect(folders.data.find((f: any) => f.id === "hr").visibleTo).toEqual(["sales"]);
      expect(folders.data.find((f: any) => f.id === "pub").visibleTo).toBeNull();
      expect((await call("GET", "/api/docs", undefined, role)).data).toHaveLength(5);
    }
  });

  it("a hidden document's link answers like a document that doesn't exist", async () => {
    expect(await call("GET", "/api/docs/d-pay/file", undefined, "sales")).toEqual({ status: 404, data: { error: "Not found" } });
    expect(await call("GET", "/api/docs/d-locked/file", undefined, "marketing")).toEqual({ status: 404, data: { error: "Not found" } });
    // An allowed one gets past the access check (its test file just isn't on disk).
    expect((await call("GET", "/api/docs/d-hr/file", undefined, "sales")).data.error).toBe("File missing");
    expect((await call("GET", "/api/docs/d-locked/file", undefined, "admin")).data.error).toBe("File missing");
  });

  it("managers set who can see a folder; only real viewer account types are accepted", async () => {
    const set = await call("PATCH", "/api/docs/folders/pub", { visibleTo: ["marketing", "sales", "sales"] });
    expect(set.status).toBe(200);
    expect(set.data.visibleTo).toEqual(["sales", "marketing"]);
    expect(store.folders.find((f) => f.id === "pub").visibleTo).toEqual(["sales", "marketing"]);

    expect((await call("PATCH", "/api/docs/folders/pub", { visibleTo: ["admin"] })).status).toBe(400);
    expect((await call("PATCH", "/api/docs/folders/pub", { visibleTo: "sales" })).status).toBe(400);
    expect((await call("PATCH", "/api/docs/folders/pub", { visibleTo: null }, "c-level")).data.visibleTo).toBeNull();
    expect((await call("PATCH", "/api/docs/folders/pub", { visibleTo: [] }, "sales")).status).toBe(403);
    expect(store.folders.find((f) => f.id === "pub").visibleTo).toBeNull();
  });

  it("deleting a restricted folder keeps its subfolders restricted", async () => {
    store.folders.push(
      { id: "sub", name: "Sub", parentId: "hr", visibleTo: null },
      { id: "sub2", name: "Sub2", parentId: "hr", visibleTo: ["sales", "marketing"] },
    );
    expect((await call("DELETE", "/api/docs/folders/hr")).status).toBe(200);
    const sub = store.folders.find((f) => f.id === "sub");
    expect(sub.parentId).toBeNull();
    expect(sub.visibleTo).toEqual(["sales"]);
    expect(store.folders.find((f) => f.id === "sub2").visibleTo).toEqual(["sales"]);
    expect(store.folders.find((f) => f.id === "pay").visibleTo).toEqual([]); // marketing ∩ sales = nobody but managers
  });
});
