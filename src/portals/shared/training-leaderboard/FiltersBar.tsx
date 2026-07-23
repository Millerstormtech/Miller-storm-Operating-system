import { useState, type ReactNode } from "react";
import type { BoardFilters } from "../../../lib/training/board";

const selectStyle: React.CSSProperties = {
  background: "#f9fafb",
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  padding: "6px 10px",
  color: "#374151",
  fontSize: 12,
};

/**
 * View toggle + search + branch/team filters. On narrow screens the two
 * dropdowns fold behind one "Filters" button. adminSlot renders the ⋯ menu
 * (container passes it for admins only).
 */
export function FiltersBar({
  view,
  onView,
  filters,
  onFilters,
  branches,
  teams,
  isNarrow,
  adminSlot,
}: {
  view: "overall" | "course";
  onView: (v: "overall" | "course") => void;
  filters: BoardFilters;
  onFilters: (f: BoardFilters) => void;
  branches: string[];
  teams: string[];
  isNarrow: boolean;
  adminSlot?: ReactNode;
}) {
  const [showNarrowFilters, setShowNarrowFilters] = useState(false);
  const toggle = (v: "overall" | "course", label: string) => (
    <button
      onClick={() => onView(v)}
      style={{
        flex: isNarrow ? 1 : undefined,
        textAlign: "center",
        background: view === v ? "#fff" : "transparent",
        color: view === v ? "#111827" : "#6b7280",
        fontWeight: view === v ? 600 : 500,
        fontSize: 12,
        padding: "5px 12px",
        border: "none",
        borderRadius: 6,
        boxShadow: view === v ? "0 1px 2px rgba(0,0,0,0.08)" : "none",
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
  const selects = (
    <>
      <select value={filters.branch} onChange={(e) => onFilters({ ...filters, branch: e.target.value })} style={selectStyle}>
        <option value="">All branches</option>
        {branches.map((b) => (
          <option key={b} value={b}>
            {b}
          </option>
        ))}
      </select>
      <select value={filters.team} onChange={(e) => onFilters({ ...filters, team: e.target.value })} style={selectStyle}>
        <option value="">All teams</option>
        {teams.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
    </>
  );
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        background: "#fff",
        border: "1px solid #e5e7eb",
        borderRadius: 12,
        padding: "9px 11px",
        marginBottom: 10,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <div style={{ display: "flex", background: "#f3f4f6", borderRadius: 8, padding: 2, flex: isNarrow ? "1 1 100%" : undefined }}>
          {toggle("overall", "Overall")}
          {toggle("course", "By Course")}
        </div>
        <input
          value={filters.search}
          onChange={(e) => onFilters({ ...filters, search: e.target.value })}
          placeholder="🔍 Search reps…"
          style={{
            flex: 1,
            minWidth: 120,
            background: "#f9fafb",
            border: "1px solid #e5e7eb",
            borderRadius: 8,
            padding: "6px 10px",
            fontSize: 12,
            outline: "none",
          }}
        />
        {isNarrow ? (
          <button onClick={() => setShowNarrowFilters((p) => !p)} style={{ ...selectStyle, cursor: "pointer" }}>
            Filters {showNarrowFilters ? "▴" : "▾"}
          </button>
        ) : (
          selects
        )}
        {adminSlot}
      </div>
      {isNarrow && showNarrowFilters && <div style={{ display: "flex", gap: 8 }}>{selects}</div>}
    </div>
  );
}
