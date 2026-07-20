import { useEffect, useState } from "react";

/**
 * One-line dismissible welcome. Dismissal persists per user in localStorage,
 * matching the app's existing localStorage conventions.
 */
export function WelcomeBanner({ userId }: { userId: string }) {
  const key = `clbWelcomeDismissed:${userId}`;
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    try {
      setVisible(localStorage.getItem(key) !== "1");
    } catch {
      setVisible(true);
    }
  }, [key]);
  if (!visible) return null;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        background: "#eef2ff",
        border: "1px solid #c7d2fe",
        borderRadius: 12,
        padding: "10px 14px",
        marginBottom: 12,
      }}
    >
      <div style={{ fontSize: 13, color: "#3730a3" }}>
        👋 This board ranks everyone across all training. Finish courses to level up and earn badges.
      </div>
      <button
        onClick={() => {
          try {
            localStorage.setItem(key, "1");
          } catch {}
          setVisible(false);
        }}
        style={{
          border: "none",
          background: "none",
          color: "#6366f1",
          fontSize: 16,
          fontWeight: 700,
          cursor: "pointer",
          lineHeight: 1,
          padding: 4,
        }}
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
}
