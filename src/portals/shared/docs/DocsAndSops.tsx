import { useEffect, useRef, useState } from "react";
import { useAuth } from "../../../contexts/AuthContext";
import { appConfirm, notify } from "../../../lib/appDialogs";
import { PdfViewer } from "./PdfViewer";

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

type SopFolder = { id: string; name: string };

const UPLOAD_ROLES = ["admin", "c-level"];
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp", "image/bmp"];
const UNFILED = "__uncategorized__";
const ALL = "__all__";
const BRAND_RED = "#CB0002";
const DISABLED_GRAY = "#d1d5db";

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function iconFor(mimeType: string): string {
  if (mimeType === "application/pdf") return "📄";
  if (IMAGE_TYPES.includes(mimeType)) return "🖼️";
  if (mimeType.includes("word")) return "📝";
  if (mimeType.includes("sheet") || mimeType.includes("excel")) return "📊";
  if (mimeType.includes("presentation") || mimeType.includes("powerpoint")) return "📽️";
  return "📁";
}

// Company document library: Admin/C-Level upload, every role reads in-app
// only. Shared across every portal (pages/*/docs-sops.tsx are thin shells
// around this one component), same convention as the Canvass Map screen.
// Folders are purely organizational: a document keeps its own identity and
// permissions regardless of which folder (if any) it sits in.
export function DocsAndSops() {
  const { user } = useAuth();
  const canUpload = !!user && UPLOAD_ROLES.includes(user.role);

  const [docs, setDocs] = useState<SopDoc[]>([]);
  const [folders, setFolders] = useState<SopFolder[]>([]);
  const [activeFolder, setActiveFolder] = useState<string>(ALL);
  const [loading, setLoading] = useState(true);
  const [viewing, setViewing] = useState<SopDoc | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [folderUpload, setFolderUpload] = useState<{ folderName: string; total: number; done: number } | null>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  function load() {
    setLoading(true);
    Promise.all([
      fetch("/api/docs").then((r) => (r.ok ? r.json() : [])),
      fetch("/api/docs/folders").then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([docsData, foldersData]) => {
        setDocs(Array.isArray(docsData) ? docsData : []);
        setFolders(Array.isArray(foldersData) ? foldersData : []);
      })
      .catch(() => { setDocs([]); setFolders([]); })
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  async function handleDelete(doc: SopDoc) {
    if (!(await appConfirm(`Remove "${doc.title}"? This can't be undone.`))) return;
    try {
      const res = await fetch(`/api/docs/${doc.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setDocs((prev) => prev.filter((d) => d.id !== doc.id));
      notify("Document removed.", "success");
    } catch {
      notify("Couldn't remove that document. Try again.", "error");
    }
  }

  async function handleMove(doc: SopDoc, folderId: string | null) {
    setDocs((prev) => prev.map((d) => (d.id === doc.id ? { ...d, folderId } : d)));
    try {
      const res = await fetch(`/api/docs/${doc.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderId }),
      });
      if (!res.ok) throw new Error();
    } catch {
      notify("Couldn't move that document. Try again.", "error");
      load(); // reconcile with the server
    }
  }

  async function handleCreateFolder(name: string) {
    try {
      const res = await fetch("/api/docs/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error();
      const folder = await res.json();
      setFolders((prev) => [...prev, folder].sort((a, b) => a.name.localeCompare(b.name)));
      setNewFolderOpen(false);
    } catch {
      notify("Couldn't create that folder. Try again.", "error");
    }
  }

  // "Upload a folder from your device" — a browser folder picker gives us
  // every file inside it (via webkitRelativePath), so this creates the
  // matching SOP folder (reusing one of the same name if it already exists)
  // and uploads every file into it, one at a time so the progress readout
  // means something. Docs & SOPs folders are single-level, so a picked
  // folder's own subfolders are flattened — every file lands in the one
  // folder named after the top-level directory, not a nested tree.
  async function handleFolderPicked(files: FileList | null) {
    if (!files || files.length === 0 || folderUpload) return;
    const first = files[0] as File & { webkitRelativePath?: string };
    const folderName = (first.webkitRelativePath || first.name).split("/")[0] || "New folder";
    // Set this before any await so the button (disabled while folderUpload is
    // set) blocks a fast double-click from starting a second, concurrent
    // upload of the same folder before this one has even created it.
    setFolderUpload({ folderName, total: files.length, done: 0 });

    let folderId: string;
    const existing = folders.find((f) => f.name === folderName);
    if (existing) {
      folderId = existing.id;
    } else {
      try {
        const res = await fetch("/api/docs/folders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: folderName }),
        });
        if (!res.ok) throw new Error();
        const folder = await res.json();
        setFolders((prev) => [...prev, folder].sort((a, b) => a.name.localeCompare(b.name)));
        folderId = folder.id;
      } catch {
        notify("Couldn't create the folder. Try again.", "error");
        setFolderUpload(null);
        return;
      }
    }

    const fileList = Array.from(files);
    let uploaded = 0;
    let skipped = 0;
    const failureReasons = new Set<string>();

    for (const file of fileList) {
      try {
        const body = new FormData();
        body.append("title", file.name);
        body.append("description", "");
        body.append("folderId", folderId);
        body.append("file", file);
        const res = await fetch("/api/docs", { method: "POST", body });
        if (res.ok) {
          const doc = await res.json();
          setDocs((prev) => [doc, ...prev]);
          uploaded++;
        } else {
          skipped++;
          const data = await res.json().catch(() => ({}));
          const reason = data.error || `HTTP ${res.status}`;
          failureReasons.add(reason);
          console.error(`[docs] folder upload failed for "${file.name}": ${reason}`);
        }
      } catch (err) {
        skipped++;
        const reason = err instanceof Error ? err.message : "network error";
        failureReasons.add(reason);
        console.error(`[docs] folder upload failed for "${file.name}":`, err);
      }
      setFolderUpload((prev) => (prev ? { ...prev, done: prev.done + 1 } : prev));
    }

    setFolderUpload(null);
    notify(
      skipped === 0
        ? `Uploaded ${uploaded} file${uploaded === 1 ? "" : "s"} to "${folderName}".`
        : `Uploaded ${uploaded} file${uploaded === 1 ? "" : "s"} to "${folderName}" — ${skipped} failed (${Array.from(failureReasons).join("; ")}).`,
      skipped === 0 ? "success" : "error"
    );
  }

  async function handleDeleteFolder(folder: SopFolder) {
    if (!(await appConfirm(`Remove the "${folder.name}" folder? Its documents move to Uncategorized, not deleted.`))) return;
    try {
      const res = await fetch(`/api/docs/folders/${folder.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setFolders((prev) => prev.filter((f) => f.id !== folder.id));
      setDocs((prev) => prev.map((d) => (d.folderId === folder.id ? { ...d, folderId: null } : d)));
      if (activeFolder === folder.id) setActiveFolder(ALL);
    } catch {
      notify("Couldn't remove that folder. Try again.", "error");
    }
  }

  const visibleDocs =
    activeFolder === ALL ? docs : activeFolder === UNFILED ? docs.filter((d) => !d.folderId) : docs.filter((d) => d.folderId === activeFolder);

  const chip = (key: string, label: string, count: number, onRemove?: () => void) => {
    const active = activeFolder === key;
    return (
      <div
        key={key}
        onClick={() => setActiveFolder(key)}
        style={{
          display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer",
          padding: "6px 12px", borderRadius: 999, fontSize: 12.5, fontWeight: 600,
          background: active ? BRAND_RED : "var(--surface-subtle)",
          color: active ? "var(--text-inverse)" : "var(--text-primary)",
          border: active ? `1px solid ${BRAND_RED}` : "1px solid var(--border-default)",
          whiteSpace: "nowrap",
        }}
      >
        {label} <span style={{ opacity: 0.75 }}>({count})</span>
        {onRemove && (
          <span
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
            style={{ marginLeft: 2, opacity: 0.7, fontWeight: 800 }}
            title="Remove folder"
          >
            ×
          </span>
        )}
      </div>
    );
  };

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {chip(ALL, "All", docs.length)}
          {chip(UNFILED, "Uncategorized", docs.filter((d) => !d.folderId).length)}
          {folders.map((f) => chip(f.id, f.name, docs.filter((d) => d.folderId === f.id).length, canUpload ? () => handleDeleteFolder(f) : undefined))}
          {canUpload && (
            <button
              onClick={() => setNewFolderOpen(true)}
              style={{ padding: "6px 12px", borderRadius: 999, border: "1px dashed var(--border-default)", background: "transparent", fontSize: 12.5, fontWeight: 600, cursor: "pointer", color: "var(--text-muted)" }}
            >
              + New folder
            </button>
          )}
        </div>
        {canUpload && (
          <div style={{ display: "flex", gap: 10 }}>
            {/* webkitdirectory: a real folder picker (Chrome/Edge/Safari) — the
                FileList this yields carries every file inside the chosen
                folder, each with webkitRelativePath telling us which folder
                it came from. Firefox falls back to a plain multi-file picker,
                so a Firefox admin loses the "folder" grouping but the upload
                itself still works. */}
            <input
              ref={folderInputRef}
              type="file"
              // @ts-expect-error non-standard attributes, no TS lib types for them
              webkitdirectory=""
              directory=""
              multiple
              hidden
              onChange={(e) => { handleFolderPicked(e.target.files); e.target.value = ""; }}
            />
            <button
              onClick={() => folderInputRef.current?.click()}
              disabled={!!folderUpload}
              style={{ padding: "10px 18px", borderRadius: 10, border: "1px solid var(--border-default)", background: "var(--surface-subtle)", color: "var(--text-primary)", fontSize: 13.5, fontWeight: 700, cursor: folderUpload ? "not-allowed" : "pointer", whiteSpace: "nowrap" }}
            >
              📁 Upload a folder
            </button>
            <button
              onClick={() => setUploadOpen(true)}
              style={{ padding: "10px 18px", borderRadius: 10, border: "none", background: BRAND_RED, color: "var(--text-inverse)", fontSize: 13.5, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}
            >
              + Upload document
            </button>
          </div>
        )}
      </div>

      {folderUpload && (
        <div style={{ marginBottom: 18, padding: "10px 14px", borderRadius: 10, background: "var(--surface-subtle)", border: "1px solid var(--border-default)", fontSize: 12.5, color: "var(--text-primary)" }}>
          Uploading "{folderUpload.folderName}" — {folderUpload.done} of {folderUpload.total} files…
        </div>
      )}

      {loading ? (
        <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>Loading…</div>
      ) : visibleDocs.length === 0 ? (
        <div style={{ padding: 40, textAlign: "center", color: "var(--text-subtle)", border: "1px dashed var(--border-default)", borderRadius: 12 }}>
          {docs.length === 0 ? `No documents yet${canUpload ? " — upload the first one." : "."}` : "No documents in this folder."}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 14 }}>
          {visibleDocs.map((doc) => (
            <div
              key={doc.id}
              style={{ background: "var(--surface-default)", border: "1px solid var(--border-default)", borderRadius: 12, padding: 16, display: "flex", flexDirection: "column", gap: 8 }}
            >
              <div
                onClick={() => setViewing(doc)}
                style={{ cursor: "pointer", display: "flex", gap: 10, alignItems: "flex-start" }}
              >
                <span style={{ fontSize: 26, lineHeight: 1 }}>{iconFor(doc.mimeType)}</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", wordBreak: "break-word" }}>{doc.title}</div>
                  {doc.description && (
                    <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{doc.description}</div>
                  )}
                </div>
              </div>
              <div style={{ fontSize: 11, color: "var(--text-subtle)", marginTop: "auto" }}>
                {fmtSize(doc.sizeBytes)} · {doc.uploadedByName || "Unknown"} · {new Date(doc.createdAt).toLocaleDateString()}
              </div>
              {canUpload && folders.length > 0 && (
                <select
                  value={doc.folderId || ""}
                  onChange={(e) => handleMove(doc, e.target.value || null)}
                  style={{ fontSize: 11.5, padding: "5px 6px", borderRadius: 6, border: "1px solid var(--border-default)", background: "var(--surface-subtle)", color: "var(--text-tertiary)" }}
                >
                  <option value="">Uncategorized</option>
                  {folders.map((f) => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </select>
              )}
              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                <button
                  onClick={() => setViewing(doc)}
                  style={{ flex: 1, padding: "7px 0", borderRadius: 8, border: "1px solid var(--border-default)", background: "var(--surface-subtle)", fontSize: 12.5, fontWeight: 600, cursor: "pointer", color: "var(--text-primary)" }}
                >
                  View
                </button>
                {canUpload && (
                  <button
                    onClick={() => handleDelete(doc)}
                    style={{ padding: "7px 12px", borderRadius: 8, border: "1px solid #fecaca", background: "#fef2f2", fontSize: 12.5, fontWeight: 600, cursor: "pointer", color: "#dc2626" }}
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {viewing && <DocViewerModal doc={viewing} onClose={() => setViewing(null)} />}
      {newFolderOpen && (
        <NewFolderModal onClose={() => setNewFolderOpen(false)} onCreate={handleCreateFolder} />
      )}
      {uploadOpen && (
        <UploadModal
          folders={folders}
          defaultFolderId={activeFolder !== ALL && activeFolder !== UNFILED ? activeFolder : null}
          onClose={() => setUploadOpen(false)}
          onUploaded={(doc) => { setDocs((prev) => [doc, ...prev]); setUploadOpen(false); }}
        />
      )}
    </div>
  );
}

function DocViewerModal({ doc, onClose }: { doc: SopDoc; onClose: () => void }) {
  const fileUrl = `/api/docs/${doc.id}/file`;
  const isPdf = doc.mimeType === "application/pdf";
  const isImage = IMAGE_TYPES.includes(doc.mimeType);

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: "var(--surface-default)", borderRadius: 14, width: "100%", maxWidth: 960, maxHeight: "92vh", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}
      >
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border-default)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: "var(--text-primary)" }}>{doc.title}</div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 22, color: "var(--text-subtle)", lineHeight: 1 }}>×</button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", background: "var(--surface-subtle)" }}>
          {isPdf ? (
            <PdfViewer fileUrl={fileUrl} title={doc.title} />
          ) : isImage ? (
            <div onContextMenu={(e) => e.preventDefault()} style={{ padding: 16, display: "flex", justifyContent: "center" }}>
              <img src={fileUrl} alt={doc.title} style={{ maxWidth: "100%", height: "auto", borderRadius: 6, boxShadow: "0 1px 4px rgba(0,0,0,0.15)" }} draggable={false} />
            </div>
          ) : (
            <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
              Preview isn't available for this file type ({doc.fileName}). Ask whoever uploaded it to share it as a PDF or image instead.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function NewFolderModal({ onClose, onCreate }: { onClose: () => void; onCreate: (name: string) => Promise<void> }) {
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (!name.trim() || submitting) return;
    setSubmitting(true);
    await onCreate(name.trim());
    setSubmitting(false);
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1001, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: "var(--surface-default)", borderRadius: 14, width: "100%", maxWidth: 380, padding: "20px 22px", boxShadow: "0 20px 60px rgba(0,0,0,0.25)" }}>
        <div style={{ fontWeight: 700, fontSize: 16, color: "var(--text-primary)", marginBottom: 16 }}>New folder</div>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
          placeholder="e.g. Compliance"
          style={{ width: "100%", padding: "9px 12px", border: "1px solid var(--border-default)", borderRadius: 8, fontSize: 13, marginBottom: 16, boxSizing: "border-box" }}
        />
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button onClick={onClose} style={{ padding: "8px 18px", borderRadius: 8, border: "1px solid var(--border-default)", background: "var(--surface-default)", fontSize: 13, fontWeight: 600, cursor: "pointer", color: "var(--text-tertiary)" }}>
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!name.trim() || submitting}
            style={{ padding: "8px 20px", borderRadius: 8, border: "none", background: name.trim() && !submitting ? BRAND_RED : DISABLED_GRAY, fontSize: 13, fontWeight: 700, cursor: name.trim() && !submitting ? "pointer" : "not-allowed", color: "var(--text-inverse)" }}
          >
            Create
          </button>
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
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [folderId, setFolderId] = useState(defaultFolderId || "");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!title.trim() || !file) {
      setError("A title and a file are both required.");
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
    <div style={{ position: "fixed", inset: 0, zIndex: 1001, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: "var(--surface-default)", borderRadius: 14, width: "100%", maxWidth: 460, padding: "20px 22px", boxShadow: "0 20px 60px rgba(0,0,0,0.25)" }}>
        <div style={{ fontWeight: 700, fontSize: 16, color: "var(--text-primary)", marginBottom: 16 }}>Upload document</div>

        <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-tertiary)", marginBottom: 6 }}>Title</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Door-Knocking SOP"
          style={{ width: "100%", padding: "9px 12px", border: "1px solid var(--border-default)", borderRadius: 8, fontSize: 13, marginBottom: 14, boxSizing: "border-box" }}
        />

        <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-tertiary)", marginBottom: 6 }}>Description (optional)</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          style={{ width: "100%", padding: "9px 12px", border: "1px solid var(--border-default)", borderRadius: 8, fontSize: 13, marginBottom: 14, boxSizing: "border-box", resize: "vertical", fontFamily: "inherit" }}
        />

        <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-tertiary)", marginBottom: 6 }}>Folder (optional)</label>
        <select
          value={folderId}
          onChange={(e) => setFolderId(e.target.value)}
          style={{ width: "100%", padding: "9px 12px", border: "1px solid var(--border-default)", borderRadius: 8, fontSize: 13, marginBottom: 14, boxSizing: "border-box" }}
        >
          <option value="">Uncategorized</option>
          {folders.map((f) => (
            <option key={f.id} value={f.id}>{f.name}</option>
          ))}
        </select>

        <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-tertiary)", marginBottom: 6 }}>File</label>
        <input
          type="file"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          style={{ width: "100%", fontSize: 13, marginBottom: 16 }}
        />

        {error && <div style={{ fontSize: 12.5, color: "#dc2626", marginBottom: 12 }}>{error}</div>}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button onClick={onClose} style={{ padding: "8px 18px", borderRadius: 8, border: "1px solid var(--border-default)", background: "var(--surface-default)", fontSize: 13, fontWeight: 600, cursor: "pointer", color: "var(--text-tertiary)" }}>
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving}
            style={{ padding: "8px 20px", borderRadius: 8, border: "none", background: saving ? DISABLED_GRAY : BRAND_RED, fontSize: 13, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer", color: "var(--text-inverse)" }}
          >
            {saving ? "Uploading…" : "Upload"}
          </button>
        </div>
      </div>
    </div>
  );
}
