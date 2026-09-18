// src/portals/shared/canvass-map/Legend.tsx
// The legend on the map and the "How the colours work" panel behind it
// (spec A3). The words come from src/lib/canvass/mapView.ts, where a test keeps
// them in step with the grade's real points and free of em dashes.

import { useState } from "react";
import { DOT_RGB, HOW_COLORS_WORK, KNOCKED_RING_RGB, LEGEND } from "../../../lib/canvass/mapView";

const rgb = (c: readonly number[]) => `rgb(${c[0]}, ${c[1]}, ${c[2]})`;

export function Legend() {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ background: "var(--surface-default)", border: "1px solid var(--border-default)", borderRadius: 10, padding: "8px 10px", fontSize: 12, color: "var(--text-primary)", boxShadow: "0 2px 10px rgba(0,0,0,0.12)" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 12px" }}>
        {LEGEND.map((row) => (
          <span key={row.color} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: rgb(DOT_RGB[row.color]), display: "inline-block" }} />
            {row.label}
          </span>
        ))}
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
          <span style={{ width: 10, height: 10, borderRadius: "50%", border: `2px solid ${rgb(KNOCKED_RING_RGB)}`, display: "inline-block", boxSizing: "border-box" }} />
          Knocked by us
        </span>
      </div>
      <button type="button" onClick={() => setOpen((o) => !o)} style={{ marginTop: 6, border: 0, background: "transparent", color: "var(--text-muted)", cursor: "pointer", padding: 0, fontSize: 12, textDecoration: "underline" }}>
        {open ? "Hide how the colours work" : "How the colours work"}
      </button>
      {open && (
        <div style={{ marginTop: 6, display: "grid", gap: 6, maxHeight: 220, overflowY: "auto", color: "var(--text-secondary)" }}>
          {LEGEND.map((row) => (
            <div key={row.color}>
              <b>{row.label}:</b> {row.meaning}
            </div>
          ))}
          {HOW_COLORS_WORK.map((line, i) => (
            <div key={i}>{line}</div>
          ))}
        </div>
      )}
    </div>
  );
}
