import { useEffect, useState } from "react";
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
};

const UPLOAD_ROLES = ["admin", "c-level"];
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp", "image/bmp"];

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
export function DocsAndSops() {
  const { user } = useAuth();
  const canUpload = !!user && UPLOAD_ROLES.includes(user.role);

  const [docs, setDocs] = useState<SopDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewing, setViewing] = useState<SopDoc | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);

  function load() {
    setLoading(true);
    fetch("/api/docs")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setDocs(Array.isArray(data) ? data : []))
      .catch(() => setDocs([]))
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

  return (
    <div style={{ padding: 24 }}>
      {canUpload && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 20 }}>
          <button
            onClick={() => setUploadOpen(true)}
            style={{ padding: "10px 18px", borderRadius: 10, border: "none", background: "#CB0002", color: "var(--text-inverse)", fontSize: 13.5, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}
          >
            + Upload document
          </button>
        </div>
      )}

      {loading ? (
        <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>Loading…</div>
      ) : docs.length === 0 ? (
        <div style={{ padding: 40, textAlign: "center", color: "var(--text-subtle)", border: "1px dashed var(--border-default)", borderRadius: 12 }}>
          No documents yet{canUpload ? " — upload the first one." : "."}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 14 }}>
          {docs.map((doc) => (
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
      {uploadOpen && (
        <UploadModal
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

function UploadModal({ onClose, onUploaded }: { onClose: () => void; onUploaded: (doc: SopDoc) => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
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

        <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-tertiary)", marginBottom: 6 }}>File</label>
        <input
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
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
            style={{ padding: "8px 20px", borderRadius: 8, border: "none", background: saving ? "#d1d5db" : "#CB0002", fontSize: 13, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer", color: "var(--text-inverse)" }}
          >
            {saving ? "Uploading…" : "Upload"}
          </button>
        </div>
      </div>
    </div>
  );
}
