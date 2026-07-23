import { useId, useState, type ReactNode } from "react";

/**
 * The ⓘ primitive: hover on desktop, tap-to-toggle on touch, focusable and
 * announced for keyboard/screen-reader users. Content is plain text so it can
 * never grow into a second UI.
 */
export function Tooltip({ text, children }: { text: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <span
      style={{ position: "relative", display: "inline-flex", cursor: "help" }}
      tabIndex={0}
      aria-describedby={open ? id : undefined}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      onClick={() => setOpen((p) => !p)}
      onKeyDown={(e) => {
        if (e.key === "Escape") setOpen(false);
      }}
    >
      {children}
      {open && (
        <span
          id={id}
          role="tooltip"
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
