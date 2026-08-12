// src/components/report/ExportReportButton.tsx
// Shared "Export report" button + options dialog for both leaderboards.
//
// The button knows nothing about leaderboards: each board passes three closures
// (defaultTitle / fieldsFor / buildDocument), so one component serves two very
// different screens with no board-specific branching inside it.
//
// Role gate note: generation happens in the browser, and both leaderboard APIs
// already send every row to every role that can open a board. So hiding this
// button stops the easy path, it is NOT a security boundary. Making it one means
// trimming what the APIs return, which is deliberately out of scope here.
//
// Modal styling mirrors training-leaderboard/HideModal.tsx so it looks native.

import { useMemo, useState } from "react";
import { useAuth } from "../../contexts/AuthContext";
import {
  defaultSelection,
  pickableFields,
  type FieldSpec,
  type ReportDocument,
} from "../../lib/report/document";
import { renderReportPdf } from "./renderReportPdf";

export const EXPORT_ROLES = ["admin", "c-level", "branch-manager", "sales-team-lead"] as const;

export function canExport(role: string | undefined): boolean {
  return !!role && (EXPORT_ROLES as readonly string[]).includes(role);
}

export type ExportScope = "view" | "board";

export type ExportRequest = {
  scope: ExportScope;
  title: string;
  note: string;
  selectedKeys: string[];
};

const btn: React.CSSProperties = {
  padding: "8px 14px",
  borderRadius: 8,
  border: "1px solid #d1d5db",
  background: "var(--surface-default)",
  color: "var(--text-tertiary)",
  fontWeight: 600,
  fontSize: 13,
  cursor: "pointer",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "9px 12px",
  border: "1px solid #d1d5db",
  borderRadius: 8,
  fontSize: 13,
  outline: "none",
  boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 600,
  color: "var(--text-tertiary)",
  marginBottom: 6,
};

export function ExportReportButton({
  viewCount,
  boardCount,
  defaultTitle,
  fieldsFor,
  buildDocument,
  disabledReason,
}: {
  viewCount: number;
  boardCount: number;
  defaultTitle: (scope: ExportScope) => string;
  fieldsFor: (scope: ExportScope) => FieldSpec<any>[];
  buildDocument: (req: ExportRequest) => ReportDocument;
  disabledReason?: string;
}) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<ExportScope>("view");
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pickable = useMemo(() => (open ? pickableFields(fieldsFor(scope)) : []), [open, fieldsFor, scope]);

  if (!canExport(user?.role)) return null;

  const nothingToExport = viewCount === 0 && boardCount === 0;
  const disabled = nothingToExport || !!disabledReason;
  const tooltip = nothingToExport ? "Nothing to export" : disabledReason || "";
  // The button stays enabled when only the CURRENT view is empty, because
  // "Full board" is still worth exporting. Submitting is what gets blocked, so
  // a filter matching nobody can never produce a blank PDF.
  const selectedCount = scope === "view" ? viewCount : boardCount;
  const emptySelection = selectedCount === 0;

  // Seeds the form from a scope. Changing scope re-seeds the title and the
  // column list, because the two scopes can offer different columns (the sales
  // board hides Branch/Team while a branch filter is on).
  function seed(next: ExportScope) {
    setScope(next);
    setTitle(defaultTitle(next));
    setSelected(defaultSelection(fieldsFor(next)));
  }

  function openDialog() {
    setError(null);
    setNote("");
    seed("view");
    setOpen(true);
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const doc = buildDocument({
        scope,
        title: title.trim() || defaultTitle(scope),
        note: note.trim(),
        selectedKeys: selected,
      });
      await renderReportPdf(doc);
      setOpen(false);
    } catch (e) {
      console.error(e);
      setError("Couldn't create the PDF. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const toggle = (key: string) =>
    setSelected((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

  return (
    <>
      <button
        data-tour="export-report"
        onClick={openDialog}
        disabled={disabled}
        title={tooltip}
        style={{ ...btn, opacity: disabled ? 0.5 : 1, cursor: disabled ? "not-allowed" : "pointer" }}
      >
        Export report
      </button>

      {open && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            background: "rgba(0,0,0,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div
            style={{
              background: "var(--surface-default)",
              borderRadius: 14,
              width: "100%",
              maxWidth: 460,
              maxHeight: "85vh",
              display: "flex",
              flexDirection: "column",
              boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "18px 24px",
                borderBottom: "1px solid var(--border-default)",
                background: "#f8fafc",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, color: "var(--text-primary)" }}>Export report</div>
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
                  Downloads a PDF of the board.
                </div>
              </div>
              <button
                onClick={() => setOpen(false)}
                style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "var(--text-subtle)", lineHeight: 1, padding: 4 }}
              >
                ×
              </button>
            </div>

            <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px" }}>
              <label style={labelStyle}>Report title</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} style={inputStyle} />

              <label style={{ ...labelStyle, marginTop: 14 }}>Note (optional)</label>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Shown under the title"
                style={inputStyle}
              />

              <div style={{ ...labelStyle, marginTop: 16 }}>What to include</div>
              {(
                [
                  ["view", `This view (${viewCount} rep${viewCount === 1 ? "" : "s"})`],
                  ["board", `Full board (${boardCount} rep${boardCount === 1 ? "" : "s"})`],
                ] as [ExportScope, string][]
              ).map(([value, label]) => (
                <label
                  key={value}
                  style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 2px", fontSize: 13, cursor: "pointer" }}
                >
                  <input
                    type="radio"
                    name="export-scope"
                    checked={scope === value}
                    onChange={() => seed(value)}
                  />
                  {label}
                </label>
              ))}

              <div style={{ ...labelStyle, marginTop: 16 }}>Columns</div>
              <label style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 2px", fontSize: 13, color: "var(--text-subtle)" }}>
                <input type="checkbox" checked disabled readOnly />
                Rep (always included)
              </label>
              {pickable.map((f) => (
                <label
                  key={f.key}
                  style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 2px", fontSize: 13, cursor: "pointer" }}
                >
                  <input type="checkbox" checked={selected.includes(f.key)} onChange={() => toggle(f.key)} />
                  {f.label}
                </label>
              ))}

              {emptySelection && (
                <div style={{ marginTop: 14, fontSize: 12.5, color: "#b45309", fontWeight: 600 }}>
                  Nothing to export: no reps match these filters. Pick Full board, or close this and clear a filter.
                </div>
              )}

              {error && (
                <div style={{ marginTop: 14, fontSize: 12.5, color: "#dc2626", fontWeight: 600 }}>{error}</div>
              )}
            </div>

            <div
              style={{
                padding: "14px 24px",
                borderTop: "1px solid var(--border-default)",
                display: "flex",
                justifyContent: "flex-end",
                gap: 10,
                background: "#f8fafc",
              }}
            >
              <button
                onClick={() => setOpen(false)}
                style={{ padding: "8px 18px", borderRadius: 8, border: "1px solid #d1d5db", background: "var(--surface-default)", fontSize: 13, fontWeight: 600, color: "var(--text-tertiary)", cursor: "pointer" }}
              >
                Cancel
              </button>
              <button
                onClick={submit}
                disabled={busy || emptySelection}
                title={emptySelection ? "Nothing to export" : ""}
                style={{
                  padding: "8px 20px", borderRadius: 8, border: "none", background: "#2563eb",
                  fontSize: 13, fontWeight: 600, color: "var(--text-inverse)",
                  cursor: busy ? "wait" : emptySelection ? "not-allowed" : "pointer",
                  opacity: busy || emptySelection ? 0.55 : 1,
                }}
              >
                {busy ? "Creating…" : "Export PDF"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
