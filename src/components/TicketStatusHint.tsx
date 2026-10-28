import { useEffect, useRef, useState } from "react";
import { TICKET_STATUS_HINT, TICKET_STATUS_LABEL, type TicketStatus } from "../lib/support/ticketStatus";

// The "?" next to a ticket's status: what each status means and whether it
// changes by itself (Youssef, 2026-10-28). Used on the staff tickets page and
// in the rep's own ticket view. `note` adds a line under the list, e.g. that
// Approved/Rejected only exist on some ticket types.
export function TicketStatusHint({ statuses, note }: { statuses: TicketStatus[]; note?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  // Close on a click anywhere else, or on Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  return (
    <span ref={ref} style={{ position: "relative", display: "inline-flex", verticalAlign: "middle" }}>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        aria-label="What do the statuses mean?"
        aria-expanded={open}
        title="What do the statuses mean?"
        style={{ width: 20, height: 20, borderRadius: 999, border: "1px solid var(--border-default)", background: "var(--surface-subtle)", color: "var(--text-muted)", fontSize: 12, fontWeight: 700, lineHeight: 1, cursor: "pointer", padding: 0, display: "inline-flex", alignItems: "center", justifyContent: "center" }}
      >
        ?
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Ticket statuses"
          onClick={(e) => e.stopPropagation()}
          style={{ position: "absolute", top: 26, left: 0, zIndex: 50, width: 300, maxWidth: "80vw", background: "var(--surface-default)", border: "1px solid var(--border-default)", borderRadius: 10, boxShadow: "0 10px 24px rgba(15,23,42,0.18)", padding: "12px 14px", textAlign: "left", textTransform: "none", letterSpacing: 0, fontWeight: 400 }}
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
