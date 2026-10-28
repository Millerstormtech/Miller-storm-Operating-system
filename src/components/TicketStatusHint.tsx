import { useEffect, useRef, useState } from "react";
import { TICKET_STATUS_HINT, TICKET_STATUS_LABEL, type TicketStatus } from "../lib/support/ticketStatus";

// The "?" next to a ticket's status: what each status means and whether it
// changes by itself (Youssef, 2026-10-28). Used on the staff tickets page and
// in the rep's own ticket view. `note` adds a line under the list, e.g. that
// Approved/Rejected only exist on some ticket types.
//
// The box is position: fixed, placed from the button's position: on the staff
// page the button sits inside the table's horizontal scroll area, which clips
// anything absolutely positioned inside it.
const BOX_WIDTH = 300;

export function TicketStatusHint({ statuses, note }: { statuses: TicketStatus[]; note?: string }) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const ref = useRef<HTMLSpanElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const open = pos !== null;

  const toggle = () => {
    if (open) { setPos(null); return; }
    const r = buttonRef.current?.getBoundingClientRect();
    if (!r) return;
    // clientWidth, not innerWidth (which includes the page scrollbar), and a
    // 20px right margin to clear the inner content scrollbar too.
    const vw = document.documentElement.clientWidth;
    const width = Math.min(BOX_WIDTH, vw - 16);
    setPos({ top: r.bottom + 6, left: Math.max(8, Math.min(r.left, vw - width - 20)) });
  };

  // Close on a click anywhere else, on Escape, or when the page scrolls (the
  // box is fixed, so it would otherwise float away from its button).
  useEffect(() => {
    if (!open) return;
    const close = () => setPos(null);
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) close(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  return (
    <span ref={ref} style={{ display: "inline-flex", verticalAlign: "middle" }}>
      <button
        ref={buttonRef}
        type="button"
        onClick={(e) => { e.stopPropagation(); toggle(); }}
        aria-label="What do the statuses mean?"
        aria-expanded={open}
        title="What do the statuses mean?"
        style={{ width: 20, height: 20, borderRadius: 999, border: "1px solid var(--border-default)", background: "var(--surface-subtle)", color: "var(--text-muted)", fontSize: 12, fontWeight: 700, lineHeight: 1, cursor: "pointer", padding: 0, display: "inline-flex", alignItems: "center", justifyContent: "center" }}
      >
        ?
      </button>
      {pos && (
        <div
          role="dialog"
          aria-label="Ticket statuses"
          onClick={(e) => e.stopPropagation()}
          style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 10001, width: BOX_WIDTH, maxWidth: "calc(100vw - 16px)", boxSizing: "border-box", background: "var(--surface-default)", border: "1px solid var(--border-default)", borderRadius: 10, boxShadow: "0 10px 24px rgba(15,23,42,0.18)", padding: "12px 14px", textAlign: "left", textTransform: "none", letterSpacing: 0, fontWeight: 400 }}
        >
          {statuses.map((s) => (
            <div key={s} style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>{TICKET_STATUS_LABEL[s]}</div>
              <div style={{ fontSize: 13, color: "var(--text-tertiary)", lineHeight: 1.4 }}>{TICKET_STATUS_HINT[s]}</div>
            </div>
          ))}
          {note && <div style={{ fontSize: 12, color: "var(--text-muted)", fontStyle: "italic" }}>{note}</div>}
        </div>
      )}
    </span>
  );
}
