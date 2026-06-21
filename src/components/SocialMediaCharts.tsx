import { useState } from "react";

type Platform = {
  id: string;
  platform: string;
  platformName: string;
  followers: number;
  posts30d: number;
  views30d: number;
  [key: string]: any;
};

type CustomColumn = {
  id: string;
  name: string;
  datatype: "string" | "number" | "boolean" | "date";
};

type SocialMediaChartsProps = {
  platforms: Platform[];
  customColumns?: CustomColumn[];
};

export function SocialMediaCharts({ platforms, customColumns = [] }: SocialMediaChartsProps) {
  const numericColumns = customColumns.filter(col => col.datatype === "number");

  const [selectedPlatformId, setSelectedPlatformId] = useState<string>(platforms[0]?.id || "");
  const [selectedColumnId, setSelectedColumnId] = useState<string | null>(numericColumns[0]?.id || null);
  const [isChartVisible, setIsChartVisible] = useState(true);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  if (platforms.length === 0 || numericColumns.length === 0) return null;

  const selectedPlatform = platforms.find(p => p.id === selectedPlatformId);
  if (!selectedPlatform) return null;

  const columnColors = [
    "#3b82f6", "#ef4444", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899",
    "#06b6d4", "#f97316", "#6366f1", "#14b8a6", "#d946ef", "#0ea5e9"
  ];
  const getColumnColor = (index: number) => columnColors[index % columnColors.length];

  function drawPieSlices() {
    let slices: { id: string; value: number; color: string; label: string }[] = [];

    if (selectedColumnId) {
      // Column selected: show each platform's value for that column
      const col = numericColumns.find(c => c.id === selectedColumnId);
      if (!col) return null;
      slices = platforms.map((p, i) => ({
        id: p.id,
        value: typeof p[col.name] === "number" ? p[col.name] : 0,
        color: getColumnColor(i),
        label: p.platformName
      }));
    } else {
      // No column selected: show all columns for selected platform
      slices = numericColumns.map((col, i) => ({
        id: col.id,
        value: selectedPlatform && typeof selectedPlatform[col.name] === "number" ? selectedPlatform[col.name] : 0,
        color: getColumnColor(i),
        label: col.name
      }));
    }

    const total = slices.reduce((sum, s) => sum + s.value, 0);
    if (total === 0) return null;

    if (slices.length === 1) {
      return <circle cx="150" cy="150" r="120" fill={slices[0].color} stroke="#ffffff" strokeWidth="2" />;
    }

    let currentAngle = -90; // start from top
    return slices.map(slice => {
      const angle = (slice.value / total) * 360;
      const pct = Math.round((slice.value / total) * 100);
      const radius = 110, cx = 150, cy = 150;
      const start = (currentAngle * Math.PI) / 180;
      const end = ((currentAngle + angle) * Math.PI) / 180;
      const x1 = cx + radius * Math.cos(start);
      const y1 = cy + radius * Math.sin(start);
      const x2 = cx + radius * Math.cos(end);
      const y2 = cy + radius * Math.sin(end);
      const largeArc = angle > 180 ? 1 : 0;
      const d = `M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`;
      const midAngle = ((currentAngle + angle / 2) * Math.PI) / 180;
      // % label inside slice
      const innerR = radius * 0.62;
      const ix = cx + innerR * Math.cos(midAngle);
      const iy = cy + innerR * Math.sin(midAngle);
      // name label outside slice
      const outerR = radius + 22;
      const ox = cx + outerR * Math.cos(midAngle);
      const oy = cy + outerR * Math.sin(midAngle);
      currentAngle += angle;
      return (
        <g key={slice.id}>
          <path
            d={d}
            fill={slice.color}
            stroke="#ffffff"
            strokeWidth="2"
            style={{ cursor: "pointer", opacity: hoveredId === slice.id ? 0.75 : 1, transition: "opacity 0.2s" }}
            onMouseEnter={() => setHoveredId(slice.id)}
            onMouseLeave={() => setHoveredId(null)}
          />
          {pct >= 4 && (
            <text x={ix} y={iy} textAnchor="middle" dominantBaseline="middle" style={{ pointerEvents: "none", fontSize: 11, fontWeight: 700, fill: "#fff" }}>
              {pct}%
            </text>
          )}
          {angle >= 15 && (
            <text x={ox} y={oy} textAnchor="middle" dominantBaseline="middle" style={{ pointerEvents: "none", fontSize: 11, fontWeight: 600, fill: "#374151" }}>
              {slice.label}
            </text>
          )}
        </g>
      );
    });
  }

  const chartTitle = selectedColumnId
    ? `${numericColumns.find(c => c.id === selectedColumnId)?.name} - All Platforms`
    : `${selectedPlatform.platformName} - All Columns`;

  return (
    <div>
      {/* Top Row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, gap: 12, flexWrap: "wrap" }}>
        {isChartVisible && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {numericColumns.map((col, index) => (
              <span
                key={col.id}
                onClick={() => setSelectedColumnId(selectedColumnId === col.id ? null : col.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "8px 16px", fontSize: 13, fontWeight: 500, borderRadius: 6,
                  border: `1px solid ${getColumnColor(index)}`,
                  color: selectedColumnId === col.id ? "#fff" : getColumnColor(index),
                  backgroundColor: selectedColumnId === col.id ? getColumnColor(index) : "#fff",
                  whiteSpace: "nowrap", cursor: "pointer"
                }}
              >
                <span style={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: selectedColumnId === col.id ? "#fff" : getColumnColor(index), display: "inline-block" }} />
                {col.name}
              </span>
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={() => setIsChartVisible(!isChartVisible)}
          style={{ padding: "8px 16px", fontSize: 13, fontWeight: 500, borderRadius: 6, border: "1px solid #e5e7eb", backgroundColor: "#dc2626", color: "#ffffff", cursor: "pointer" }}
        >
          {isChartVisible ? "Hide Chart" : "Show Chart"}
        </button>
      </div>

      {/* Chart Section */}
      {isChartVisible && (
        <div style={{ display: "flex", gap: 32, alignItems: "flex-start" }}>
          {/* Left: Pie Chart */}
          <div style={{ flex: 0.4 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#111827", marginBottom: 16 }}>{chartTitle}</div>
            <div style={{ position: "relative", width: 340, height: 340 }}>
              <svg width="340" height="340" viewBox="0 0 300 300">
                {drawPieSlices()}
              </svg>
            </div>
          </div>

          {/* Right: Platform rows */}
          <div style={{ flex: 0.6 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {platforms.map((platform, index) => {
                // When column selected, show progress bar for that column per platform
                if (selectedColumnId) {
                  const col = numericColumns.find(c => c.id === selectedColumnId);
                  const value = col && typeof platform[col.name] === "number" ? platform[col.name] : 0;
                  const total = col ? platforms.reduce((sum, p) => sum + (typeof p[col.name] === "number" ? p[col.name] : 0), 0) : 0;
                  const percentage = total > 0 ? (value / total) * 100 : 0;
                  const color = getColumnColor(index);
                  return (
                    <div key={platform.id} style={{ padding: "12px 16px", borderRadius: 8, border: "1px solid #e5e7eb", backgroundColor: "#f9fafb" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>{platform.platformName}</span>
                        <span style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>{value.toLocaleString()} ({percentage.toFixed(1)}%)</span>
                      </div>
                      <div style={{ width: "100%", height: 8, backgroundColor: "#e5e7eb", borderRadius: 4, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${percentage}%`, backgroundColor: color, borderRadius: 4, transition: "width 0.3s ease" }} />
                      </div>
                    </div>
                  );
                }
                // Default: platform selector rows
                return (
                  <div
                    key={platform.id}
                    onClick={() => { setSelectedPlatformId(platform.id); setSelectedColumnId(null); }}
                    style={{
                      padding: "12px 16px", borderRadius: 8, border: "1px solid #e5e7eb",
                      backgroundColor: selectedPlatformId === platform.id && !selectedColumnId ? "#eff6ff" : "#f9fafb",
                      borderLeft: selectedPlatformId === platform.id && !selectedColumnId ? "4px solid #2563eb" : "4px solid transparent",
                      cursor: "pointer", fontSize: 14,
                      fontWeight: selectedPlatformId === platform.id && !selectedColumnId ? 600 : 400,
                      color: selectedPlatformId === platform.id && !selectedColumnId ? "#2563eb" : "#374151",
                      transition: "all 0.2s ease"
                    }}
                  >
                    {platform.platformName}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
