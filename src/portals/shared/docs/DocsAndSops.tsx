import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useRouter } from "next/router";
import { useAuth } from "../../../contexts/AuthContext";
import { appConfirm, notify } from "../../../lib/appDialogs";
import { PdfViewer } from "./PdfViewer";
import { preloadPdfViewer } from "./pdfjsLoader";
import { needsPdfConversion } from "../../../lib/uploads/previewTypes";
import {
  type FolderNode,
  indexFolders,
  effectiveParentId,
  childFolders,
  pathTo,
  subtreeIds,
  folderOptions,
  relativeDirs,
} from "../../../lib/docs/folderTree";

type SopDoc = {
  id: string;
  title: string;
  description: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedByName: string;
  createdAt: string;
  folderId: string | null;
};

type SopFolder = FolderNode;

const UPLOAD_ROLES = ["admin", "c-level"];
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp", "image/bmp"];
const ROOT_LABEL = "Docs & SOPs";
const BRAND_RED = "#CB0002";
const DISABLED_GRAY = "#d1d5db";
const DANGER_TEXT = "#dc2626";
const DANGER_BG = "#fef2f2";
const DANGER_BORDER = "#fecaca";

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

// The server returns an existing folder (200) instead of creating a duplicate
// when the name is already taken there, so an append must not add it twice.
function withFolder(prev: SopFolder[], folder: SopFolder): SopFolder[] {
  const f = { id: folder.id, name: folder.name, parentId: folder.parentId ?? null };
  return prev.some((p) => p.id === f.id) ? prev : [...prev, f];
}

// OS clutter that rides along with a folder pick but isn't a document:
// dotfiles (.DS_Store, ._foo), Windows' Thumbs.db/desktop.ini, and macOS's
// "Icon\r" custom-folder-icon file.
const SYSTEM_FILES = new Set(["thumbs.db", "desktop.ini", "icon\r"]);
function isSystemFile(name: string): boolean {
  return name.startsWith(".") || SYSTEM_FILES.has(name.toLowerCase());
}

function iconFor(mimeType: string): string {
  if (mimeType === "application/pdf") return "📄";
  if (IMAGE_TYPES.includes(mimeType)) return "🖼️";
  if (mimeType.includes("word")) return "📝";
  if (mimeType.includes("sheet") || mimeType.includes("excel")) return "📊";
  if (mimeType.includes("presentation") || mimeType.includes("powerpoint")) return "📽️";
  return "📃";
}

// JSON request that never throws: a network failure comes back as a
// not-ok result carrying a message fit to show.
async function sendJson(url: string, method: string, body?: unknown): Promise<{ ok: boolean; status: number; data: any }> {
  try {
    const res = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { ok: res.ok, status: res.status, data: await res.json().catch(() => ({})) };
  } catch {
    return { ok: false, status: 0, data: { error: "Network error — check your connection and try again." } };
  }
}

const cardStyle: CSSProperties = {
  background: "var(--surface-default)", border: "1px solid var(--border-default)", borderRadius: 12,
  padding: 16, display: "flex", flexDirection: "column", gap: 8,
};
const metaStyle: CSSProperties = { fontSize: 11.5, color: "var(--text-subtle)" };
const inputStyle: CSSProperties = {
  width: "100%", padding: "9px 12px", border: "1px solid var(--border-default)", borderRadius: 8,
  fontSize: 13, boxSizing: "border-box", background: "var(--surface-default)", color: "var(--text-primary)",
};
const labelStyle: CSSProperties = { display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-tertiary)", marginBottom: 6 };

function SmallButton({ children, onClick, danger }: { children: ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      style={{
        padding: "5px 10px", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: "pointer",
        border: `1px solid ${danger ? DANGER_BORDER : "var(--border-default)"}`,
        background: danger ? DANGER_BG : "var(--surface-subtle)",
        color: danger ? DANGER_TEXT : "var(--text-primary)",
      }}
    >
      {children}
    </button>
  );
}

// Company document library, browsed like a file explorer: folders nest, the
// path bar and the browser's Back button move between levels (the open folder
// lives in the URL as ?folder=), and search spans every folder. Admin and
// C-Level manage it; every role views in-app only. Shared across every portal
// (pages/*/docs-sops.tsx are thin shells around this component).
export function DocsAndSops() {
  const { user } = useAuth();
  const router = useRouter();
  const canManage = !!user && UPLOAD_ROLES.includes(user.role);

  const [docs, setDocs] = useState<SopDoc[]>([]);
  const [folders, setFolders] = useState<SopFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [viewing, setViewing] = useState<SopDoc | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [nameDialog, setNameDialog] = useState<NameDialogConfig | null>(null);
  const [moveDialog, setMoveDialog] = useState<MoveDialogConfig | null>(null);
  const [folderUpload, setFolderUpload] = useState<{ folderName: string; total: number; done: number } | null>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  async function load(quiet = false) {
    if (!quiet) setLoading(true);
    try {
      const [docsRes, foldersRes] = await Promise.all([fetch("/api/docs"), fetch("/api/docs/folders")]);
      const docsData = docsRes.ok ? await docsRes.json() : [];
      const foldersData = foldersRes.ok ? await foldersRes.json() : [];
      setDocs(Array.isArray(docsData) ? docsData : []);
      setFolders(Array.isArray(foldersData) ? foldersData.map((f: SopFolder) => withFolder([], f)[0]) : []);
    } catch {
      if (!quiet) { setDocs([]); setFolders([]); }
    } finally {
      if (!quiet) setLoading(false);
    }
  }

  useEffect(() => {
    load();
    preloadPdfViewer();
  }, []);

  // Resting on a document's card starts fetching it, so by the time it's
  // clicked the viewer usually finds it already in the browser cache (the
  // file routes allow private caching). Very large files are left alone.
  const prefetched = useRef(new Set<string>());
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prefetchSoon = (doc: SopDoc) => {
    const { kind, url } = viewerSource(doc);
    if (kind === "none" || prefetched.current.has(doc.id) || doc.sizeBytes > 15 * 1024 * 1024) return;
    hoverTimer.current = setTimeout(() => {
      prefetched.current.add(doc.id);
      fetch(url).then((r) => (r.ok ? r.arrayBuffer() : null)).catch(() => prefetched.current.delete(doc.id));
    }, 150);
  };
  const cancelPrefetch = () => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = null;
  };

  const byId = useMemo(() => indexFolders(folders), [folders]);
  const queryFolder = typeof router.query.folder === "string" ? router.query.folder : null;
  // A folder that no longer exists (deleted, or an old link) shows the top level.
  const currentId = effectiveParentId(queryFolder, byId);
  const breadcrumb = pathTo(currentId, byId);
  const currentName = breadcrumb.length ? breadcrumb[breadcrumb.length - 1].name : ROOT_LABEL;
  const locationOf = (folderId: string | null) => pathTo(folderId, byId).map((f) => f.name).join(" › ") || ROOT_LABEL;
  const docFolder = (d: SopDoc) => effectiveParentId(d.folderId, byId);

  function openFolder(id: string | null) {
    setSearch("");
    const query = { ...router.query };
    delete query.folder;
    if (id) query.folder = id;
    router.push({ pathname: router.pathname, query }, undefined, { shallow: true, scroll: false });
  }

  // What each folder directly contains, for the "2 folders · 5 documents" line.
  const counts = useMemo(() => {
    const m = new Map<string, { folders: number; docs: number }>();
    const bump = (id: string | null, key: "folders" | "docs") => {
      if (!id) return;
      const c = m.get(id) ?? { folders: 0, docs: 0 };
      c[key]++;
      m.set(id, c);
    };
    for (const f of folders) bump(effectiveParentId(f.parentId, byId), "folders");
    for (const d of docs) bump(effectiveParentId(d.folderId, byId), "docs");
    return m;
  }, [folders, docs, byId]);

  const contentsLabel = (folderId: string) => {
    const c = counts.get(folderId);
    if (!c) return "Empty";
    return [c.folders ? plural(c.folders, "folder") : "", c.docs ? plural(c.docs, "document") : ""].filter(Boolean).join(" · ");
  };

  const byName = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
  const q = search.trim().toLowerCase();
  const searching = q.length > 0;
  const shownFolders = searching
    ? folders.filter((f) => f.name.toLowerCase().includes(q)).sort((a, b) => byName(a.name, b.name))
    : childFolders(folders, byId, currentId);
  const shownDocs = (searching
    ? docs.filter((d) => [d.title, d.fileName, d.description].some((s) => (s || "").toLowerCase().includes(q)))
    : docs.filter((d) => docFolder(d) === currentId)
  ).sort((a, b) => byName(a.title, b.title));

  function askNewFolder() {
    const parentId = currentId;
    setNameDialog({
      title: parentId ? `New folder in "${currentName}"` : "New folder",
      initial: "",
      submitLabel: "Create",
      placeholder: "e.g. Offer letters",
      onSubmit: async (name) => {
        const r = await sendJson("/api/docs/folders", "POST", { name, parentId });
        if (!r.ok) {
          if (r.status === 400) load(true);
          return r.data.error || "Couldn't create that folder. Try again.";
        }
        setFolders((prev) => withFolder(prev, r.data));
        if (r.status === 200) notify(`A folder named "${r.data.name}" is already here.`, "info");
        return null;
      },
    });
  }

  function askRenameFolder(folder: SopFolder) {
    setNameDialog({
      title: "Rename folder",
      initial: folder.name,
      submitLabel: "Rename",
      onSubmit: async (name) => {
        const r = await sendJson(`/api/docs/folders/${folder.id}`, "PATCH", { name });
        if (!r.ok) {
          if (r.status === 404) load(true);
          return r.data.error || "Couldn't rename that folder. Try again.";
        }
        setFolders((prev) => prev.map((f) => (f.id === folder.id ? { ...f, name: r.data.name } : f)));
        return null;
      },
    });
  }

  function askRenameDoc(doc: SopDoc) {
    setNameDialog({
      title: "Rename document",
      initial: doc.title,
      submitLabel: "Rename",
      onSubmit: async (title) => {
        const r = await sendJson(`/api/docs/${doc.id}`, "PATCH", { title });
        if (!r.ok) {
          if (r.status === 404) load(true);
          return r.data.error || "Couldn't rename that document. Try again.";
        }
        setDocs((prev) => prev.map((d) => (d.id === doc.id ? { ...d, title: r.data.title } : d)));
        return null;
      },
    });
  }

  function askMoveDoc(doc: SopDoc) {
    setMoveDialog({
      title: `Move "${doc.title}"`,
      from: docFolder(doc),
      exclude: new Set(),
      onMove: async (target) => {
        const r = await sendJson(`/api/docs/${doc.id}`, "PATCH", { folderId: target });
        if (!r.ok) {
          if (r.status === 400 || r.status === 404) load(true);
          return r.data.error || "Couldn't move that document. Try again.";
        }
        setDocs((prev) => prev.map((d) => (d.id === doc.id ? { ...d, folderId: target } : d)));
        notify(`Moved to "${locationOf(target)}".`, "success");
        return null;
      },
    });
  }

  function askMoveFolder(folder: SopFolder) {
    setMoveDialog({
      title: `Move folder "${folder.name}"`,
      from: effectiveParentId(folder.parentId, byId),
      // Not into itself or anything inside it.
      exclude: subtreeIds(folder.id, folders),
      onMove: async (target) => {
        const r = await sendJson(`/api/docs/folders/${folder.id}`, "PATCH", { parentId: target });
        if (!r.ok) {
          if (r.status === 400 || r.status === 404) load(true);
          return r.data.error || "Couldn't move that folder. Try again.";
        }
        setFolders((prev) => prev.map((f) => (f.id === folder.id ? { ...f, parentId: target } : f)));
        notify(`Moved to "${locationOf(target)}".`, "success");
        return null;
      },
    });
  }

  async function deleteFolder(folder: SopFolder) {
    const parentId = effectiveParentId(folder.parentId, byId);
    const c = counts.get(folder.id);
    const inside = c
      ? ` Its ${[c.folders ? plural(c.folders, "folder") : "", c.docs ? plural(c.docs, "document") : ""].filter(Boolean).join(" and ")} will move to "${locationOf(parentId)}" — nothing inside is deleted.`
      : "";
    if (!(await appConfirm(`Delete the folder "${folder.name}"?${inside}`))) return;
    const r = await sendJson(`/api/docs/folders/${folder.id}`, "DELETE");
    // 404: someone else already removed it — drop it here all the same.
    if (!r.ok && r.status !== 404) {
      notify(r.data.error || "Couldn't delete that folder. Try again.", "error");
      return;
    }
    setFolders((prev) => prev.filter((f) => f.id !== folder.id).map((f) => (f.parentId === folder.id ? { ...f, parentId } : f)));
    setDocs((prev) => prev.map((d) => (d.folderId === folder.id ? { ...d, folderId: parentId } : d)));
    if (currentId === folder.id) openFolder(parentId);
    notify(`Folder "${folder.name}" deleted.`, "success");
  }

  async function deleteDoc(doc: SopDoc) {
    if (!(await appConfirm(`Remove "${doc.title}"? This can't be undone.`))) return;
    const r = await sendJson(`/api/docs/${doc.id}`, "DELETE");
    if (!r.ok && r.status !== 404) {
      notify("Couldn't remove that document. Try again.", "error");
      return;
    }
    setDocs((prev) => prev.filter((d) => d.id !== doc.id));
    notify("Document removed.", "success");
  }

  // "Upload a folder from your device": the browser folder picker gives every
  // file inside it with its path (webkitRelativePath), so the folder and all
  // of its subfolders are recreated inside the folder being viewed, and each
  // file lands in its own subfolder. Files go one at a time so the progress
  // readout means something.
  async function handleFolderPicked(picked: File[]) {
    if (picked.length === 0 || folderUpload) return;
    const pathOf = (f: File) => (f as File & { webkitRelativePath?: string }).webkitRelativePath || "";
    const files = picked.filter((f) => !isSystemFile(f.name));
    // Null when the browser can't pick folders (mobile): the files then go
    // straight into the folder being viewed.
    const topName = relativeDirs(pathOf(picked[0]))[0] ?? null;
    const label = topName ?? currentName;
    if (files.length === 0) {
      notify(`"${label}" has no files to upload.`, "info");
      return;
    }
    // Set before any await so the button (disabled while this is set) blocks
    // a fast double-click from starting a second, concurrent upload.
    setFolderUpload({ folderName: label, total: files.length, done: 0 });

    // Each subfolder is created once; the server hands back an existing
    // same-named folder in the same place instead of making a duplicate.
    const baseId = currentId;
    const folderIdByPath = new Map<string, string>();
    async function folderFor(dirs: string[]): Promise<string | null> {
      let parentId = baseId;
      let key = "";
      for (const name of dirs) {
        key += `/${name}`;
        let id = folderIdByPath.get(key);
        if (!id) {
          const r = await sendJson("/api/docs/folders", "POST", { name, parentId });
          if (!r.ok) throw new Error(r.data.error || "Couldn't create a folder");
          setFolders((prev) => withFolder(prev, r.data));
          id = r.data.id as string;
          folderIdByPath.set(key, id);
        }
        parentId = id;
      }
      return parentId;
    }

    let uploaded = 0;
    let failed = 0;
    const reasons = new Set<string>();
    for (const file of files) {
      try {
        const folderId = await folderFor(relativeDirs(pathOf(file)));
        const body = new FormData();
        body.append("title", file.name);
        body.append("description", "");
        if (folderId) body.append("folderId", folderId);
        body.append("file", file);
        const res = await fetch("/api/docs", { method: "POST", body });
        if (res.ok) {
          const doc = await res.json();
          setDocs((prev) => [doc, ...prev]);
          uploaded++;
        } else {
          failed++;
          const data = await res.json().catch(() => ({}));
          const reason = data.error || `HTTP ${res.status}`;
          reasons.add(reason);
          console.error(`[docs] folder upload failed for "${file.name}": ${reason}`);
        }
      } catch (err) {
        failed++;
        reasons.add(err instanceof Error ? err.message : "network error");
        console.error(`[docs] folder upload failed for "${file.name}":`, err);
      }
      setFolderUpload((prev) => (prev ? { ...prev, done: prev.done + 1 } : prev));
    }

    setFolderUpload(null);
    // Reconcile with the server, which is right even if another admin moved or
    // deleted a folder while this ran.
    await load(true);
    const topId = topName ? folderIdByPath.get(`/${topName}`) : undefined;
    if (uploaded > 0 && topId) openFolder(topId);
    notify(
      failed === 0
        ? `Uploaded ${plural(uploaded, "file")} to "${label}".`
        : `Uploaded ${plural(uploaded, "file")} to "${label}" — ${failed} failed (${Array.from(reasons).join("; ")}).`,
      failed === 0 ? "success" : "error"
    );
  }

  const renderFolder = (f: SopFolder) => (
    <div
      key={`f-${f.id}`}
      role="button"
      tabIndex={0}
      onClick={() => openFolder(f.id)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openFolder(f.id); } }}
      style={{ ...cardStyle, cursor: "pointer" }}
    >
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <span style={{ fontSize: 30, lineHeight: 1 }}>📁</span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", wordBreak: "break-word" }}>{f.name}</div>
          <div style={metaStyle}>{contentsLabel(f.id)}</div>
        </div>
      </div>
      {searching && <div style={metaStyle}>in {locationOf(effectiveParentId(f.parentId, byId))}</div>}
      {canManage && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: "auto" }}>
          <SmallButton onClick={() => askRenameFolder(f)}>Rename</SmallButton>
          <SmallButton onClick={() => askMoveFolder(f)}>Move</SmallButton>
          <SmallButton danger onClick={() => deleteFolder(f)}>Delete</SmallButton>
        </div>
      )}
    </div>
  );

  const renderDoc = (doc: SopDoc) => (
    <div key={`d-${doc.id}`} style={cardStyle} onPointerEnter={() => prefetchSoon(doc)} onPointerLeave={cancelPrefetch}>
      <div onClick={() => setViewing(doc)} style={{ cursor: "pointer", display: "flex", gap: 10, alignItems: "flex-start" }}>
        <span style={{ fontSize: 26, lineHeight: 1 }}>{iconFor(doc.mimeType)}</span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", wordBreak: "break-word" }}>{doc.title}</div>
          {doc.description && <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{doc.description}</div>}
        </div>
      </div>
      <div style={{ ...metaStyle, marginTop: "auto" }}>
        {fmtSize(doc.sizeBytes)} · {doc.uploadedByName || "Unknown"} · {new Date(doc.createdAt).toLocaleDateString()}
      </div>
      {searching && <div style={metaStyle}>in {locationOf(docFolder(doc))}</div>}
      <button
        onClick={() => setViewing(doc)}
        style={{ padding: "7px 0", borderRadius: 8, border: "1px solid var(--border-default)", background: "var(--surface-subtle)", fontSize: 12.5, fontWeight: 600, cursor: "pointer", color: "var(--text-primary)" }}
      >
        View
      </button>
      {canManage && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <SmallButton onClick={() => askRenameDoc(doc)}>Rename</SmallButton>
          <SmallButton onClick={() => askMoveDoc(doc)}>Move</SmallButton>
          <SmallButton danger onClick={() => deleteDoc(doc)}>Remove</SmallButton>
        </div>
      )}
    </div>
  );

  const crumb = (label: string, onClick?: () => void) =>
    onClick ? (
      <button type="button" onClick={onClick} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: 14, fontWeight: 600, color: "var(--text-muted)" }}>
        {label}
      </button>
    ) : (
      <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>{label}</span>
    );

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
        <nav aria-label="Folder path" style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 6, minWidth: 0 }}>
          {searching ? (
            crumb(`Search results for "${search.trim()}"`)
          ) : (
            <>
              {crumb(ROOT_LABEL, breadcrumb.length ? () => openFolder(null) : undefined)}
              {breadcrumb.map((f, i) => (
                <Fragment key={f.id}>
                  <span aria-hidden="true" style={{ color: "var(--text-subtle)" }}>›</span>
                  {crumb(f.name, i < breadcrumb.length - 1 ? () => openFolder(f.id) : undefined)}
                </Fragment>
              ))}
            </>
          )}
        </nav>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search all documents…"
            aria-label="Search all documents"
            style={{ ...inputStyle, width: 220, borderRadius: 10 }}
          />
          {canManage && (
            <>
              <button
                onClick={askNewFolder}
                style={{ padding: "10px 16px", borderRadius: 10, border: "1px dashed var(--border-default)", background: "transparent", color: "var(--text-primary)", fontSize: 13.5, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}
              >
                + New folder
              </button>
              {/* webkitdirectory: a real folder picker on desktop browsers — every
                  file inside the chosen folder comes with its webkitRelativePath.
                  Mobile browsers ignore it and offer a plain multi-file picker;
                  those files go into the folder being viewed. */}
              <input
                ref={folderInputRef}
                type="file"
                // @ts-expect-error non-standard attributes, no TS lib types for them
                webkitdirectory=""
                directory=""
                multiple
                hidden
                onChange={(e) => {
                  // Copy out of the FileList BEFORE clearing the input: in Chrome
                  // the FileList is live, so resetting value empties the list the
                  // async upload is still holding, and every file gets dropped.
                  const picked = Array.from(e.target.files ?? []);
                  e.target.value = "";
                  handleFolderPicked(picked);
                }}
              />
              <button
                onClick={() => folderInputRef.current?.click()}
                disabled={!!folderUpload}
                style={{ padding: "10px 16px", borderRadius: 10, border: "1px solid var(--border-default)", background: "var(--surface-subtle)", color: "var(--text-primary)", fontSize: 13.5, fontWeight: 700, cursor: folderUpload ? "not-allowed" : "pointer", whiteSpace: "nowrap" }}
              >
                📁 Upload a folder
              </button>
              <button
                onClick={() => setUploadOpen(true)}
                style={{ padding: "10px 16px", borderRadius: 10, border: "none", background: BRAND_RED, color: "var(--text-inverse)", fontSize: 13.5, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}
              >
                + Upload document
              </button>
            </>
          )}
        </div>
      </div>

      {folderUpload && (
        <div style={{ marginBottom: 18, padding: "10px 14px", borderRadius: 10, background: "var(--surface-subtle)", border: "1px solid var(--border-default)", fontSize: 12.5, color: "var(--text-primary)" }}>
          Uploading "{folderUpload.folderName}" — {folderUpload.done} of {folderUpload.total} files…
        </div>
      )}

      {loading ? (
        <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>Loading…</div>
      ) : shownFolders.length === 0 && shownDocs.length === 0 ? (
        <div style={{ padding: 40, textAlign: "center", color: "var(--text-subtle)", border: "1px dashed var(--border-default)", borderRadius: 12 }}>
          {searching
            ? `Nothing matches "${search.trim()}".`
            : currentId === null && docs.length === 0 && folders.length === 0
              ? `No documents yet${canManage ? " — upload the first one, or create a folder." : "."}`
              : `This folder is empty.${canManage ? " Upload documents here or create a subfolder." : ""}`}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 14 }}>
          {shownFolders.map(renderFolder)}
          {shownDocs.map(renderDoc)}
        </div>
      )}

      {viewing && <DocViewerModal doc={viewing} onClose={() => setViewing(null)} />}
      {nameDialog && <NameModal config={nameDialog} onClose={() => setNameDialog(null)} />}
      {moveDialog && <MoveModal config={moveDialog} folders={folders} onClose={() => setMoveDialog(null)} />}
      {uploadOpen && (
        <UploadModal
          folders={folders}
          defaultFolderId={currentId}
          onClose={() => setUploadOpen(false)}
          onUploaded={(doc) => { setDocs((prev) => [doc, ...prev]); setUploadOpen(false); }}
        />
      )}
    </div>
  );
}

function ModalShell({ width, onClose, children }: { width: number; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1001, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: "var(--surface-default)", borderRadius: 14, width: "100%", maxWidth: width, padding: "20px 22px", boxShadow: "0 20px 60px rgba(0,0,0,0.25)" }}>
        {children}
      </div>
    </div>
  );
}

function ModalButtons({ onCancel, onSubmit, submitLabel, disabled }: { onCancel: () => void; onSubmit: () => void; submitLabel: string; disabled: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
      <button onClick={onCancel} style={{ padding: "8px 18px", borderRadius: 8, border: "1px solid var(--border-default)", background: "var(--surface-default)", fontSize: 13, fontWeight: 600, cursor: "pointer", color: "var(--text-tertiary)" }}>
        Cancel
      </button>
      <button
        onClick={onSubmit}
        disabled={disabled}
        style={{ padding: "8px 20px", borderRadius: 8, border: "none", background: disabled ? DISABLED_GRAY : BRAND_RED, fontSize: 13, fontWeight: 700, cursor: disabled ? "not-allowed" : "pointer", color: "var(--text-inverse)" }}
      >
        {submitLabel}
      </button>
    </div>
  );
}

type NameDialogConfig = {
  title: string;
  initial: string;
  submitLabel: string;
  placeholder?: string;
  // Resolves to an error message to show, or null on success.
  onSubmit: (name: string) => Promise<string | null>;
};

function NameModal({ config, onClose }: { config: NameDialogConfig; onClose: () => void }) {
  const [name, setName] = useState(config.initial);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const trimmed = name.trim();

  async function submit() {
    if (!trimmed || submitting) return;
    if (trimmed === config.initial.trim()) {
      onClose();
      return;
    }
    setSubmitting(true);
    setError(null);
    const err = await config.onSubmit(trimmed);
    setSubmitting(false);
    if (err) setError(err);
    else onClose();
  }

  return (
    <ModalShell width={400} onClose={onClose}>
      <div style={{ fontWeight: 700, fontSize: 16, color: "var(--text-primary)", marginBottom: 16 }}>{config.title}</div>
      <input
        autoFocus
        value={name}
        onChange={(e) => { setName(e.target.value); setError(null); }}
        onFocus={(e) => e.target.select()}
        onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
        placeholder={config.placeholder}
        style={{ ...inputStyle, marginBottom: error ? 8 : 16 }}
      />
      {error && <div style={{ fontSize: 12.5, color: DANGER_TEXT, marginBottom: 12 }}>{error}</div>}
      <ModalButtons onCancel={onClose} onSubmit={submit} submitLabel={config.submitLabel} disabled={!trimmed || submitting} />
    </ModalShell>
  );
}

const TOP_LEVEL = "__top__";

type MoveDialogConfig = {
  title: string;
  from: string | null;
  // Folders that can't be chosen (a folder can't go inside itself).
  exclude: Set<string>;
  onMove: (target: string | null) => Promise<string | null>;
};

function MoveModal({ config, folders, onClose }: { config: MoveDialogConfig; folders: SopFolder[]; onClose: () => void }) {
  const options = folderOptions(folders).filter((o) => !config.exclude.has(o.id));
  const start = config.from ?? TOP_LEVEL;
  const [target, setTarget] = useState(start);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (submitting || target === start) return;
    setSubmitting(true);
    setError(null);
    const err = await config.onMove(target === TOP_LEVEL ? null : target);
    setSubmitting(false);
    if (err) setError(err);
    else onClose();
  }

  return (
    <ModalShell width={440} onClose={onClose}>
      <div style={{ fontWeight: 700, fontSize: 16, color: "var(--text-primary)", marginBottom: 16, wordBreak: "break-word" }}>{config.title}</div>
      <label style={labelStyle}>Move to</label>
      <select value={target} onChange={(e) => { setTarget(e.target.value); setError(null); }} style={{ ...inputStyle, marginBottom: error ? 8 : 16 }}>
        <option value={TOP_LEVEL}>{ROOT_LABEL} (top level)</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>{o.label}</option>
        ))}
      </select>
      {error && <div style={{ fontSize: 12.5, color: DANGER_TEXT, marginBottom: 12 }}>{error}</div>}
      <ModalButtons onCancel={onClose} onSubmit={submit} submitLabel="Move" disabled={submitting || target === start} />
    </ModalShell>
  );
}

// How the viewer shows a document: drawn as PDF pages (PDFs, and Office files
// the server converts), as an image, or not at all.
function viewerSource(doc: SopDoc): { kind: "pdf" | "image" | "none"; url: string } {
  if (doc.mimeType === "application/pdf") return { kind: "pdf", url: `/api/docs/${doc.id}/file` };
  if (IMAGE_TYPES.includes(doc.mimeType)) return { kind: "image", url: `/api/docs/${doc.id}/file` };
  if (needsPdfConversion(doc.fileName)) return { kind: "pdf", url: `/api/docs/${doc.id}/preview` };
  return { kind: "none", url: "" };
}

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 4;
const ZOOM_STEP = 1.25;

// Zoom for the document inside the viewer, not the page behind it. Pinch
// (Chrome/Edge/Firefox send it as Ctrl+wheel, Safari as gesture events, touch
// screens as two-finger touches), Ctrl/Cmd+wheel and Ctrl/Cmd +/−/0 are all
// caught while the viewer is open and applied here instead of letting the
// browser zoom the whole site. Zooming keeps the point under the cursor (or
// between the fingers) where it is.
function useViewerZoom(overlayRef: React.RefObject<HTMLDivElement | null>, scrollRef: React.RefObject<HTMLDivElement | null>, enabled: boolean) {
  const [zoom, setZoom] = useState(1);
  const [width, setWidth] = useState(0);
  const zoomRef = useRef(1);
  const pendingScroll = useRef<{ left: number; top: number } | null>(null);

  const zoomTo = (next: number, anchor?: { x: number; y: number }) => {
    const prev = zoomRef.current;
    const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(next * 100) / 100));
    if (z === prev) return;
    const el = scrollRef.current;
    if (el) {
      const ax = anchor ? Math.min(Math.max(anchor.x, 0), el.clientWidth) : el.clientWidth / 2;
      const ay = anchor ? Math.min(Math.max(anchor.y, 0), el.clientHeight) : el.clientHeight / 2;
      const r = z / prev;
      pendingScroll.current = { left: (el.scrollLeft + ax) * r - ax, top: (el.scrollTop + ay) * r - ay };
    }
    zoomRef.current = z;
    setZoom(z);
  };
  const zoomToRef = useRef(zoomTo);
  zoomToRef.current = zoomTo;

  // Runs after the pages have taken their new size (child layout effects run first).
  useLayoutEffect(() => {
    const el = scrollRef.current;
    const p = pendingScroll.current;
    pendingScroll.current = null;
    if (el && p) {
      el.scrollLeft = Math.max(0, p.left);
      el.scrollTop = Math.max(0, p.top);
    }
  }, [zoom, scrollRef]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [scrollRef]);

  useEffect(() => {
    const overlay = overlayRef.current;
    const el = scrollRef.current;
    if (!enabled || !overlay || !el) return;
    const at = (cx: number, cy: number) => {
      const r = el.getBoundingClientRect();
      return { x: cx - r.left, y: cy - r.top };
    };
    let gesturing = false;
    let gestureStart = 1;
    let pinch: { dist: number; zoom: number } | null = null;
    const fingers = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);

    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return; // a plain wheel still scrolls
      e.preventDefault();
      if (gesturing) return;
      const dy = Math.max(-50, Math.min(50, e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY));
      zoomToRef.current(zoomRef.current * Math.exp(-dy * 0.006), at(e.clientX, e.clientY));
    };
    const onGestureStart = (e: Event) => { e.preventDefault(); gesturing = true; gestureStart = zoomRef.current; };
    const onGestureChange = (e: Event) => {
      e.preventDefault();
      const g = e as Event & { scale: number; clientX: number; clientY: number };
      zoomToRef.current(gestureStart * g.scale, at(g.clientX, g.clientY));
    };
    const onGestureEnd = (e: Event) => { e.preventDefault(); gesturing = false; };
    const onTouchStart = (e: TouchEvent) => { if (e.touches.length === 2) pinch = { dist: fingers(e.touches), zoom: zoomRef.current }; };
    const onTouchMove = (e: TouchEvent) => {
      if (!pinch || e.touches.length !== 2) return;
      e.preventDefault();
      const [a, b] = [e.touches[0], e.touches[1]];
      zoomToRef.current(pinch.zoom * (fingers(e.touches) / pinch.dist), at((a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2));
    };
    const onTouchEnd = (e: TouchEvent) => { if (e.touches.length < 2) pinch = null; };
    const onKey = (e: KeyboardEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      if (e.key === "+" || e.key === "=") { e.preventDefault(); zoomToRef.current(zoomRef.current * ZOOM_STEP); }
      else if (e.key === "-" || e.key === "_") { e.preventDefault(); zoomToRef.current(zoomRef.current / ZOOM_STEP); }
      else if (e.key === "0") { e.preventDefault(); zoomToRef.current(1); }
    };

    overlay.addEventListener("wheel", onWheel, { passive: false });
    overlay.addEventListener("gesturestart", onGestureStart);
    overlay.addEventListener("gesturechange", onGestureChange);
    overlay.addEventListener("gestureend", onGestureEnd);
    overlay.addEventListener("touchstart", onTouchStart, { passive: true });
    overlay.addEventListener("touchmove", onTouchMove, { passive: false });
    overlay.addEventListener("touchend", onTouchEnd);
    window.addEventListener("keydown", onKey);
    return () => {
      overlay.removeEventListener("wheel", onWheel);
      overlay.removeEventListener("gesturestart", onGestureStart);
      overlay.removeEventListener("gesturechange", onGestureChange);
      overlay.removeEventListener("gestureend", onGestureEnd);
      overlay.removeEventListener("touchstart", onTouchStart);
      overlay.removeEventListener("touchmove", onTouchMove);
      overlay.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("keydown", onKey);
    };
  }, [enabled, overlayRef, scrollRef]);

  return {
    zoom,
    width,
    zoomIn: () => zoomTo(zoomRef.current * ZOOM_STEP),
    zoomOut: () => zoomTo(zoomRef.current / ZOOM_STEP),
    reset: () => zoomTo(1),
  };
}

function ImageView({ src, alt, zoom, availableWidth }: { src: string; alt: string; zoom: number; availableWidth: number }) {
  const [natural, setNatural] = useState<number | null>(null);
  // 100% = the image's own width, or the viewer's width if it's wider than that.
  const fit = natural ? Math.min(natural, Math.max(availableWidth - 32, 120)) : null;
  return (
    <div onContextMenu={(e) => e.preventDefault()} style={{ padding: 16, width: "max-content", minWidth: "100%", boxSizing: "border-box", textAlign: "center" }}>
      <img
        src={src}
        alt={alt}
        draggable={false}
        onLoad={(e) => setNatural(e.currentTarget.naturalWidth)}
        style={{ width: fit ? fit * zoom : undefined, maxWidth: fit ? "none" : "100%", height: "auto", borderRadius: 6, boxShadow: "0 1px 4px rgba(0,0,0,0.15)", verticalAlign: "top" }}
      />
    </div>
  );
}

function DocViewerModal({ doc, onClose }: { doc: SopDoc; onClose: () => void }) {
  const source = viewerSource(doc);
  const overlayRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const zoomable = source.kind !== "none";
  const { zoom, width, zoomIn, zoomOut, reset } = useViewerZoom(overlayRef, scrollRef, zoomable);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Escape closes; the page behind doesn't scroll while the viewer is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCloseRef.current(); };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  const toolButton: CSSProperties = {
    minWidth: 32, height: 30, padding: "0 8px", borderRadius: 8, border: "1px solid var(--border-default)",
    background: "var(--surface-subtle)", color: "var(--text-primary)", fontSize: 15, fontWeight: 700, cursor: "pointer",
  };

  return (
    <div
      ref={overlayRef}
      style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, touchAction: "pan-x pan-y" }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: "var(--surface-default)", borderRadius: 14, width: "100%", maxWidth: 1000, height: "92vh", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}
      >
        <div style={{ padding: "12px 16px 12px 20px", borderBottom: "1px solid var(--border-default)", display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0, fontWeight: 700, fontSize: 15, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{doc.title}</div>
          {zoomable && (
            <div role="group" aria-label="Zoom" style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <button type="button" onClick={zoomOut} disabled={zoom <= MIN_ZOOM} title="Zoom out (Ctrl/⌘ −)" aria-label="Zoom out" style={toolButton}>−</button>
              <button type="button" onClick={reset} title="Fit to width (Ctrl/⌘ 0)" aria-label="Reset zoom" style={{ ...toolButton, minWidth: 58, fontSize: 12.5 }}>
                {Math.round(zoom * 100)}%
              </button>
              <button type="button" onClick={zoomIn} disabled={zoom >= MAX_ZOOM} title="Zoom in (Ctrl/⌘ +)" aria-label="Zoom in" style={toolButton}>+</button>
            </div>
          )}
          <button onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 22, color: "var(--text-subtle)", lineHeight: 1, padding: "0 4px" }}>×</button>
        </div>
        <div ref={scrollRef} data-viewer-scroll style={{ flex: 1, overflow: "auto", background: "var(--surface-subtle)", overscrollBehavior: "contain" }}>
          {source.kind === "pdf" ? (
            <PdfViewer
              fileUrl={source.url}
              title={doc.title}
              zoom={zoom}
              availableWidth={width}
              loadingText={source.url.endsWith("/preview") ? "Preparing preview…" : "Loading document…"}
            />
          ) : source.kind === "image" ? (
            <ImageView src={source.url} alt={doc.title} zoom={zoom} availableWidth={width} />
          ) : (
            <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
              Preview isn't available for this file type ({doc.fileName}). Ask whoever uploaded it to share it as a PDF, Word/Excel/PowerPoint file, or image instead.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function UploadModal({
  folders,
  defaultFolderId,
  onClose,
  onUploaded,
}: {
  folders: SopFolder[];
  defaultFolderId: string | null;
  onClose: () => void;
  onUploaded: (doc: SopDoc) => void;
}) {
  const options = folderOptions(folders);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [folderId, setFolderId] = useState(defaultFolderId || "");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!title.trim() || !file) {
      setError("A name and a file are both required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("title", title.trim());
      body.append("description", description.trim());
      if (folderId) body.append("folderId", folderId);
      body.append("file", file);
      const res = await fetch("/api/docs", { method: "POST", body });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Upload failed.");
        return;
      }
      onUploaded(await res.json());
      notify("Document uploaded.", "success");
    } catch {
      setError("Upload failed. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell width={460} onClose={onClose}>
      <div style={{ fontWeight: 700, fontSize: 16, color: "var(--text-primary)", marginBottom: 16 }}>Upload document</div>

      <label style={labelStyle}>File</label>
      <input
        type="file"
        onChange={(e) => {
          const picked = e.target.files?.[0] || null;
          setFile(picked);
          // Name it after the file unless a name was already typed.
          if (picked && !title.trim()) setTitle(picked.name.replace(/\.[^.]+$/, ""));
        }}
        style={{ width: "100%", fontSize: 13, marginBottom: 14, color: "var(--text-primary)" }}
      />

      <label style={labelStyle}>Name</label>
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Door-Knocking SOP" style={{ ...inputStyle, marginBottom: 14 }} />

      <label style={labelStyle}>Description (optional)</label>
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={3}
        style={{ ...inputStyle, marginBottom: 14, resize: "vertical", fontFamily: "inherit" }}
      />

      <label style={labelStyle}>Folder</label>
      <select value={folderId} onChange={(e) => setFolderId(e.target.value)} style={{ ...inputStyle, marginBottom: 16 }}>
        <option value="">{ROOT_LABEL} (top level)</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>{o.label}</option>
        ))}
      </select>

      {error && <div style={{ fontSize: 12.5, color: DANGER_TEXT, marginBottom: 12 }}>{error}</div>}
      <ModalButtons onCancel={onClose} onSubmit={save} submitLabel={saving ? "Uploading…" : "Upload"} disabled={saving} />
    </ModalShell>
  );
}
