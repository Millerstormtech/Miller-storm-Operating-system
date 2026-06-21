"use client";
import { useState, useCallback } from "react";
import {
  ComposableMap,
  Geographies,
  Geography,
  ZoomableGroup,
} from "react-simple-maps";

const GEO_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

export default function WorldMap() {
  const [position, setPosition] = useState({ coordinates: [0, 20] as [number, number], zoom: 1 });

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
              geographies.map((geo) => (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  style={{
                    default: { fill: "#CBD5E1", stroke: "#fff", strokeWidth: 0.4, outline: "none" },
                    hover:   { fill: "#6366f1", stroke: "#fff", strokeWidth: 0.4, outline: "none", cursor: "pointer" },
                    pressed: { fill: "#4f46e5", outline: "none" },
                  }}
                />
              ))
            }
          </Geographies>
        </ZoomableGroup>
      </ComposableMap>

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
