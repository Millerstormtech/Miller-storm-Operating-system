import { useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";

/**
 * The ⓘ primitive: hover on desktop, tap-to-toggle on touch, focusable and
 * announced for keyboard/screen-reader users. Content is plain text so it can
 * never grow into a second UI.
 *
 * The bubble is position: fixed (viewport coordinates), NOT absolute inside
 * the trigger: the rep detail modal clips its children (overflow hidden plus
 * a scrolling body), and an absolutely-positioned bubble near its edge gets
 * cut off. Fixed positioning escapes every overflow ancestor; the bubble is
 * clamped to the viewport and flips below the trigger when there is no room
 * above. Position is measured on open (bubble renders hidden for one frame).
 */
export function Tooltip({ text, children }: { text: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; below: boolean } | null>(null);
  const anchorRef = useRef<HTMLSpanElement>(null);
  const bubbleRef = useRef<HTMLSpanElement>(null);
  const id = useId();

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const anchor = anchorRef.current?.getBoundingClientRect();
    const bubble = bubbleRef.current?.getBoundingClientRect();
    if (!anchor || !bubble) return;
    const half = bubble.width / 2;
    const center = anchor.left + anchor.width / 2;
    const left = Math.min(Math.max(center, half + 8), window.innerWidth - half - 8);
    const below = anchor.top - bubble.height - 8 < 0;
    setPos({ top: below ? anchor.bottom + 6 : anchor.top - 6, left, below });
  }, [open]);

  return (
    <span
      ref={anchorRef}
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
          ref={bubbleRef}
          id={id}
          role="tooltip"
          style={{
            position: "fixed",
            top: pos ? pos.top : -9999,
            left: pos ? pos.left : -9999,
            transform: pos?.below ? "translate(-50%, 0)" : "translate(-50%, -100%)",
            visibility: pos ? "visible" : "hidden",
            background: "#111827",
            color: "#fff",
            fontSize: 11,
            fontWeight: 500,
            padding: "6px 9px",
            borderRadius: 6,
            whiteSpace: "nowrap",
            zIndex: 1100,
            pointerEvents: "none",
          }}
        >
          {text}
        </span>
      )}
    </span>
  );
}
