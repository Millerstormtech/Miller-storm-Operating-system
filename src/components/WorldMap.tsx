"use client";
import { useState, useCallback } from "react";
import {
  ComposableMap,
  Geographies,
  Geography,
  ZoomableGroup,
} from "react-simple-maps";

const GEO_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

// data: ISO numeric id (matches geo.id) -> distinct user count.
type WorldMapProps = { data?: Record<string, number> };

// Colour a country by its share of the busiest country: a light→saturated blue
// ramp, matching the legend under the map. Countries with no usage stay grey.
function fillFor(count: number | undefined, max: number): string {
  if (!count || count <= 0 || max <= 0) return "#CBD5E1";
  const t = Math.min(count / max, 1);
  // #e0f2fe (very light) -> #0369a1 (deep blue)
  const from = [224, 242, 254];
  const to = [3, 105, 161];
  const c = from.map((f, i) => Math.round(f + (to[i] - f) * t));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

export default function WorldMap({ data }: WorldMapProps) {
  const [position, setPosition] = useState({ coordinates: [0, 20] as [number, number], zoom: 1 });
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null);

  const counts = data ?? {};
  const max = Object.values(counts).reduce((m, v) => Math.max(m, v), 0);

  const handleMoveEnd = useCallback((pos: any) => {
    setPosition(pos);
  }, []);

  function handleZoomIn() {
    setPosition(p => ({ ...p, zoom: Math.min(p.zoom * 1.5, 10) }));
  }

  function handleZoomOut() {
    setPosition(p => ({ ...p, zoom: Math.max(p.zoom / 1.5, 1) }));
  }

  function handleReset() {
    setPosition({ coordinates: [0, 20], zoom: 1 });
  }

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <ComposableMap
        projectionConfig={{ scale: 155, center: [0, 20] }}
        style={{ width: "100%", height: "100%" }}
        width={900}
        height={380}
      >
        <ZoomableGroup
          zoom={position.zoom}
          center={position.coordinates}
          onMoveEnd={handleMoveEnd}
          minZoom={1}
          maxZoom={10}
        >
          <Geographies geography={GEO_URL}>
            {({ geographies }) =>
              geographies.map((geo) => {
                const id = String(geo.id);
                const count = counts[id];
                const base = fillFor(count, max);
                const name = geo.properties?.name ?? "";
                return (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    onMouseEnter={(e: any) => {
                      setTooltip({
                        x: e.clientX,
                        y: e.clientY,
                        text: count ? `${name}: ${count} user${count === 1 ? "" : "s"}` : `${name}: 0`,
                      });
                    }}
                    onMouseMove={(e: any) => {
                      setTooltip(t => (t ? { ...t, x: e.clientX, y: e.clientY } : t));
                    }}
                    onMouseLeave={() => setTooltip(null)}
                    style={{
                      default: { fill: base, stroke: "#fff", strokeWidth: 0.4, outline: "none" },
                      hover: { fill: count ? "#0369a1" : "#94a3b8", stroke: "#fff", strokeWidth: 0.4, outline: "none", cursor: "pointer" },
                      pressed: { fill: "#075985", outline: "none" },
                    }}
                  />
                );
              })
            }
          </Geographies>
        </ZoomableGroup>
      </ComposableMap>

      {/* Tooltip */}
      {tooltip && (
        <div
          style={{
            position: "fixed",
            left: tooltip.x + 12,
            top: tooltip.y + 12,
            background: "#111827",
            color: "#fff",
            fontSize: "11px",
            padding: "4px 8px",
            borderRadius: "6px",
            pointerEvents: "none",
            whiteSpace: "nowrap",
            zIndex: 50,
            boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
          }}
        >
          {tooltip.text}
        </div>
      )}

      {/* Zoom controls */}
      <div style={{
        position: "absolute", bottom: "12px", right: "12px",
        display: "flex", flexDirection: "column", gap: "4px"
      }}>
        {[
          { label: "+", action: handleZoomIn, title: "Zoom in" },
          { label: "−", action: handleZoomOut, title: "Zoom out" },
          { label: "⊙", action: handleReset, title: "Reset" },
        ].map(btn => (
          <button
            key={btn.label}
            onClick={btn.action}
            title={btn.title}
            style={{
              width: 30, height: 30, borderRadius: "6px",
              border: "1px solid #e5e7eb", background: "#fff",
              cursor: "pointer", fontSize: btn.label === "⊙" ? "14px" : "18px",
              fontWeight: 600, color: "#374151", lineHeight: 1,
              boxShadow: "0 1px 4px rgba(0,0,0,0.1)",
              display: "flex", alignItems: "center", justifyContent: "center"
            }}
          >
            {btn.label}
          </button>
        ))}
      </div>

      {/* Hint */}
      <div style={{ position: "absolute", bottom: "12px", left: "12px", fontSize: "10px", color: "#9ca3af" }}>
        Scroll to zoom · Drag to pan
      </div>
    </div>
  );
}
