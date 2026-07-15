// A small amber notice shown on dashboards whose figures are still placeholder
// data, so viewers don't mistake them for live numbers.
export function DevWarningBanner() {
  return (
    <div
      style={{
        background: "#fffbeb",
        border: "1px solid #fde68a",
        color: "#92400e",
        borderRadius: 8,
        padding: "10px 14px",
        fontSize: 13.5,
        fontWeight: 500,
        margin: "0 0 16px",
        display: "flex",
        alignItems: "center",
        gap: 8,
      }}
    >
      <span style={{ fontSize: 16, lineHeight: 1 }}>⚠️</span>
      <span>
        <strong>Still Under Development:</strong> Data shown are mock numbers.
      </span>
    </div>
  );
}
