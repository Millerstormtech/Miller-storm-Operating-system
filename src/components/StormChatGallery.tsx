import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { safeHref } from "../lib/stormchat/compose";
import { linksIn, GALLERY_PAGE, type GalleryKind } from "../lib/stormchat/findMessages";

// A chat's shared photos & videos, files and links (GroupMe-style gallery;
// Youssef, 2026-10-16), so last week's contract photo or price sheet is found
// without scrolling. Opened from the chat header; newest first.

type Item = { _id: string; messageType: string; mediaUrl?: string; message?: string; senderName?: string; createdAt: string };

type Props = {
  groupId: string;
  onClose: () => void;
  onJump: (messageId: string) => void;
};

const TABS: { key: GalleryKind; label: string }[] = [
  { key: "photos", label: "Photos & videos" },
  { key: "files", label: "Files" },
  { key: "links", label: "Links" },
];

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric" });

export function StormChatGallery({ groupId, onClose, onJump }: Props) {
  const [tab, setTab] = useState<GalleryKind>("photos");
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [failed, setFailed] = useState(false);
  // A photo opened full size, on top of the gallery.
  const [viewing, setViewing] = useState<Item | null>(null);

  async function load(kind: GalleryKind, beforeId?: string) {
    setLoading(true);
    setFailed(false);
    try {
      const res = await fetch(`/api/storm-chat/messages/${groupId}?media=${kind}${beforeId ? `&beforeId=${beforeId}` : ""}`);
      if (!res.ok) throw new Error(String(res.status));
      const page: Item[] = await res.json();
      setItems((prev) => (beforeId ? [...prev, ...page] : page));
      setHasMore(page.length === GALLERY_PAGE);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { setItems([]); load(tab); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [tab, groupId]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { if (viewing) setViewing(null); else onClose(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, viewing]);

  const jump = (id: string) => { onClose(); onJump(id); };
  const showInChat = (id: string) => (
    <button onClick={() => jump(id)} style={{ background: "none", border: "none", color: "var(--brand-on-surface)", cursor: "pointer", fontSize: 12, fontWeight: 600, padding: 0, whiteSpace: "nowrap" }}>
      Show in chat
    </button>
  );

  if (typeof document === "undefined") return null;
  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 2000, background: "rgba(0,0,0,0.45)", display: "flex", justifyContent: "flex-end" }} onClick={onClose} role="dialog" aria-label="Photos and files">
      <div onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", maxWidth: 460, height: "100%", overflowY: "auto", background: "var(--surface-default)", color: "var(--text-primary)", boxShadow: "-8px 0 24px rgba(0,0,0,0.18)", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border-default)", display: "flex", alignItems: "center", gap: 10, position: "sticky", top: 0, background: "var(--surface-default)", zIndex: 1 }}>
          <button onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "var(--text-primary)" }}>✕</button>
          <div style={{ fontWeight: 700, fontSize: 16 }}>Photos & files</div>
        </div>
        <div role="tablist" style={{ display: "flex", gap: 6, padding: "10px 18px", borderBottom: "1px solid var(--border-default)" }}>
          {TABS.map((t) => (
            <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
              style={{ flex: 1, padding: "7px 8px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 700,
                background: tab === t.key ? "var(--surface-inverse)" : "var(--surface-subtle)", color: tab === t.key ? "var(--text-inverse)" : "var(--text-muted)" }}>
              {t.label}
            </button>
          ))}
        </div>

        <div style={{ padding: 14, flex: 1 }}>
          {failed ? (
            <div style={{ color: "var(--text-muted)", fontSize: 14 }}>Couldn&apos;t load this. Close and try again.</div>
          ) : !loading && items.length === 0 ? (
            <div style={{ color: "var(--text-muted)", fontSize: 14, textAlign: "center", padding: "40px 0" }}>
              {tab === "photos" ? "No photos or videos yet" : tab === "files" ? "No files yet" : "No links yet"}
            </div>
          ) : tab === "photos" ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 4 }}>
              {items.map((m) => {
                const href = safeHref(m.mediaUrl);
                if (!href) return null;
                return (
                  <div key={m._id} style={{ position: "relative", aspectRatio: "1 / 1", background: "var(--surface-subtle)", borderRadius: 6, overflow: "hidden" }}>
                    {m.messageType === "video" ? (
                      <button onClick={() => window.open(href, "_blank", "noopener")} aria-label="Play video"
                        style={{ all: "unset", cursor: "pointer", position: "absolute", inset: 0 }}>
                        <video src={href} muted preload="metadata" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                        <span aria-hidden style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, color: "var(--text-inverse)", textShadow: "0 1px 4px rgba(0,0,0,0.6)" }}>▶</span>
                      </button>
                    ) : (
                      <button onClick={() => setViewing(m)} aria-label="Open photo" style={{ all: "unset", cursor: "pointer", position: "absolute", inset: 0 }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={href} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                      </button>
                    )}
                    <button onClick={() => jump(m._id)} title="Show in chat" aria-label="Show in chat"
                      style={{ position: "absolute", right: 4, bottom: 4, width: 26, height: 26, borderRadius: "50%", border: "none", background: "rgba(0,0,0,0.55)", color: "var(--text-inverse)", cursor: "pointer", fontSize: 13 }}>↗</button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column" }}>
              {items.flatMap((m) => {
                const meta = `${m.senderName || ""} · ${shortDate(m.createdAt)}`;
                if (tab === "files") {
                  return [(
                    <div key={m._id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 2px", borderBottom: "1px solid var(--border-subtle)" }}>
                      <span style={{ fontSize: 20 }}>📎</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <a href={safeHref(m.mediaUrl)} target="_blank" rel="noopener noreferrer" style={{ fontSize: 14, color: "var(--text-primary)", fontWeight: 600, wordBreak: "break-word" }}>{m.message || "File"}</a>
                        <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{meta}</div>
                      </div>
                      {showInChat(m._id)}
                    </div>
                  )];
                }
                return linksIn(m.message || "").map((url, i) => (
                  <div key={`${m._id}-${i}`} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 2px", borderBottom: "1px solid var(--border-subtle)" }}>
                    <span style={{ fontSize: 18 }}>🔗</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <a href={safeHref(url)} target="_blank" rel="noopener noreferrer" style={{ fontSize: 14, color: "var(--brand-on-surface)", wordBreak: "break-all" }}>{url}</a>
                      <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{meta}</div>
                    </div>
                    {showInChat(m._id)}
                  </div>
                ));
              })}
            </div>
          )}
          {loading && <div style={{ color: "var(--text-subtle)", fontSize: 13, textAlign: "center", padding: 16 }}>Loading…</div>}
          {!loading && hasMore && !failed && (
            <div style={{ textAlign: "center", padding: 14 }}>
              <button onClick={() => load(tab, items[items.length - 1]?._id)}
                style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid var(--border-default)", background: "var(--surface-subtle)", color: "var(--text-primary)", cursor: "pointer", fontWeight: 600, fontSize: 13 }}>
                Load more
              </button>
            </div>
          )}
        </div>
      </div>
      {viewing && safeHref(viewing.mediaUrl) && (
        <div onClick={(e) => { e.stopPropagation(); setViewing(null); }}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.9)", zIndex: 2100, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ position: "absolute", top: 16, right: 16, display: "flex", gap: 10 }}>
            <button onClick={(e) => { e.stopPropagation(); jump(viewing._id); }}
              style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: "rgb(var(--white-rgb) / 0.15)", color: "var(--text-inverse)", cursor: "pointer", fontSize: 14, fontWeight: 600 }}>Show in chat</button>
            <button onClick={(e) => { e.stopPropagation(); setViewing(null); }} aria-label="Close photo"
              style={{ width: 38, height: 38, borderRadius: 8, border: "none", background: "rgb(var(--white-rgb) / 0.15)", color: "var(--text-inverse)", cursor: "pointer", fontSize: 20, lineHeight: 1 }}>×</button>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={safeHref(viewing.mediaUrl)} alt="" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "92vw", maxHeight: "86vh", objectFit: "contain", borderRadius: 8 }} />
          <div style={{ position: "absolute", bottom: 18, left: 0, right: 0, textAlign: "center", color: "var(--text-inverse)", fontSize: 13, opacity: 0.85 }}>
            {viewing.senderName} · {shortDate(viewing.createdAt)}
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}
