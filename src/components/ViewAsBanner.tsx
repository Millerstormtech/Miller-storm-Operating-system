import { useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { roleDisplayName } from "../lib/roleLabels";

// Slim fixed bar shown while an admin is viewing another user's account in
// read-only mode. It names who is being viewed, flashes a note whenever a
// blocked write is attempted, and offers an Exit button back to the admin panel.
export function ViewAsBanner() {
  const { impersonating, user, exitViewAs } = useAuth();
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    const onBlocked = () => {
      setFlash(true);
      const t = setTimeout(() => setFlash(false), 2000);
      return () => clearTimeout(t);
    };
    window.addEventListener("viewas-blocked", onBlocked);
    return () => window.removeEventListener("viewas-blocked", onBlocked);
  }, []);

  // Push the whole app down by the bar's height so the fixed banner never covers
  // the portal's own top bar. Reset the moment the view-as session ends.
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.body.style.paddingTop = impersonating ? "40px" : "";
    return () => { document.body.style.paddingTop = ""; };
  }, [impersonating]);

  if (!impersonating || !user) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 100000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 14,
        flexWrap: "wrap",
        padding: "8px 16px",
        background: flash ? "#b91c1c" : "#7c3aed",
        color: "#fff",
        fontSize: 13,
        fontWeight: 600,
        boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
        transition: "background 0.2s",
      }}
    >
      <span>
        👁 Viewing as <strong>{user.name}</strong> ({roleDisplayName(user.role)}) — read-only
        {flash && <span style={{ marginLeft: 10, opacity: 0.95 }}>· Changes are disabled here</span>}
      </span>
      <button
        type="button"
        onClick={exitViewAs}
        style={{
          border: "1px solid rgba(255,255,255,0.6)",
          background: "rgba(255,255,255,0.15)",
          color: "#fff",
          borderRadius: 999,
          padding: "4px 14px",
          fontSize: 12,
          fontWeight: 700,
          cursor: "pointer",
        }}
      >
        Exit view
      </button>
    </div>
  );
}
