// src/portals/shared/canvass-map/Filters.tsx
// The map's filters (spec A3): colours to show, hide houses knocked recently,
// only houses with hail since a day, only owner-occupied houses, and the hail
// layer on or off. Purely a form: the values go straight into the request that
// src/lib/canvass/mapView.ts builds. No em dashes on screen.

import type { Color } from "../../../lib/canvass/grade";
import { DOT_RGB, LEGEND, type FilterState } from "../../../lib/canvass/mapView";

const rgb = (c: readonly number[]) => `rgb(${c[0]}, ${c[1]}, ${c[2]})`;

export function Filters({ value, onChange, today }: { value: FilterState; onChange: (next: FilterState) => void; today: string }) {
  const toggleColor = (color: Color) => {
    const has = value.colors.includes(color);
    const colors = has ? value.colors.filter((c) => c !== color) : [...value.colors, color];
    if (colors.length === 0) return; // at least one colour stays on
    onChange({ ...value, colors });
  };
  const label: React.CSSProperties = { display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--text-primary)", cursor: "pointer" };

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        {LEGEND.map((row) => (
          <label key={row.color} style={label}>
            <input type="checkbox" checked={value.colors.includes(row.color)} onChange={() => toggleColor(row.color)} />
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: rgb(DOT_RGB[row.color]), display: "inline-block" }} />
            {row.label}
          </label>
        ))}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
        <label style={label}>
          <input type="checkbox" checked={value.hideKnockedDays !== null} onChange={(e) => onChange({ ...value, hideKnockedDays: e.target.checked ? 30 : null })} />
          Hide houses knocked in the last
          <input
            type="number"
            min={0}
            max={3650}
            value={value.hideKnockedDays ?? 30}
            disabled={value.hideKnockedDays === null}
            onChange={(e) => onChange({ ...value, hideKnockedDays: Math.max(0, Math.min(3650, Number(e.target.value) || 0)) })}
            style={{ width: 64, padding: "2px 6px", borderRadius: 6, border: "1px solid var(--border-default)", background: "var(--surface-default)", color: "var(--text-primary)" }}
          />
          days
        </label>

        <label style={label}>
          <input type="checkbox" checked={value.hailSince !== null} onChange={(e) => onChange({ ...value, hailSince: e.target.checked ? today.slice(0, 4) + "-01-01" : null })} />
          Only hail since
          <input
            type="date"
            value={value.hailSince ?? ""}
            disabled={value.hailSince === null}
            max={today}
            onChange={(e) => onChange({ ...value, hailSince: e.target.value || null })}
            style={{ padding: "2px 6px", borderRadius: 6, border: "1px solid var(--border-default)", background: "var(--surface-default)", color: "var(--text-primary)" }}
          />
        </label>

        <label style={label}>
          <input type="checkbox" checked={value.ownerOnly} onChange={(e) => onChange({ ...value, ownerOnly: e.target.checked })} />
          Owner lives there
        </label>

        <label style={label}>
          <input type="checkbox" checked={value.showHail} onChange={(e) => onChange({ ...value, showHail: e.target.checked })} />
          Show hail
        </label>
      </div>
    </div>
  );
}
