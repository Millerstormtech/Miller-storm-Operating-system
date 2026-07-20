import { useState, type ReactNode } from "react";

/**
 * The ⓘ primitive: hover on desktop, tap-to-toggle on touch. Content is plain
 * text so it can never grow into a second UI.
 */
export function Tooltip({ text, children }: { text: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <span
      style={{ position: "relative", display: "inline-flex", cursor: "help" }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onClick={() => setOpen((p) => !p)}
    >
      {children}
      {open && (
        <span
          style={{
            position: "absolute",
            bottom: "calc(100% + 6px)",
            left: "50%",
            transform: "translateX(-50%)",
            background: "#111827",
            color: "#fff",
            fontSize: 11,
            fontWeight: 500,
            padding: "6px 9px",
            borderRadius: 6,
            whiteSpace: "nowrap",
            zIndex: 300,
            pointerEvents: "none",
          }}
        >
          {text}
        </span>
      )}
    </span>
  );
}
