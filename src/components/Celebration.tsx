import { useEffect, useMemo, useState } from "react";
import usePrefersReducedMotion from "../hooks/usePrefersReducedMotion";

// The wins a rep earns on screen. Deliberately cheap: no animation library, no
// canvas, no sound (Youssef, 2026-09-16: animations only for now). Everything
// here is an ENTRANCE that ends on its own, and a viewer whose system asks for
// reduced motion gets the same words with nothing moving.

const PAPER = ["#CB0002", "#F4C542", "#2C3345", "#D8DDE4", "#D89A62"];

/** A short burst of paper falling past the screen. Mount it with a changing
 *  `key` to fire it again; it cleans itself up when the fall is over. */
export function ConfettiBurst(props: { pieces?: number; durationMs?: number }): JSX.Element | null {
  const reduced = usePrefersReducedMotion();
  const count = props.pieces ?? 34;
  const durationMs = props.durationMs ?? 1900;
  const [spent, setSpent] = useState(false);

  const bits = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 260,
        drift: (Math.random() * 2 - 1) * 90,
        spin: 180 + Math.random() * 540,
        width: 8 + Math.random() * 6,
        color: PAPER[i % PAPER.length],
      })),
    [count]
  );

  useEffect(() => {
    const timer = setTimeout(() => setSpent(true), durationMs + 400);
    return () => clearTimeout(timer);
  }, [durationMs]);

  if (reduced || spent) return null;

  return (
    <div className="ms-confetti" aria-hidden="true">
      {bits.map((b, i) => (
        <span
          key={i}
          style={
            {
              left: `${b.left}%`,
              width: `${b.width}px`,
              height: `${b.width + 4}px`,
              background: b.color,
              animationDelay: `${b.delay}ms`,
              animationDuration: `${durationMs}ms`,
              "--ms-drift": `${b.drift}px`,
              "--ms-spin": `${b.spin}deg`,
            } as React.CSSProperties
          }
        />
      ))}
      <style jsx>{`
        .ms-confetti { position: fixed; inset: 0; overflow: hidden; pointer-events: none; z-index: 4000; }
        .ms-confetti span {
          position: absolute; top: -16px; border-radius: 1px; opacity: 0;
          animation-name: ms-confetti-fall; animation-timing-function: cubic-bezier(0.25, 0.6, 0.35, 1); animation-fill-mode: forwards;
        }
        @keyframes ms-confetti-fall {
          0% { opacity: 0; transform: translate3d(0, 0, 0) rotate(0deg); }
          8% { opacity: 1; }
          100% { opacity: 0; transform: translate3d(var(--ms-drift), 82vh, 0) rotate(var(--ms-spin)); }
        }
      `}</style>
    </div>
  );
}

/** The bigger moment: a card over the page for something earned, not just
 *  passed. Closes on a tap, on Escape, or by itself. */
export function WinMoment(props: {
  mark: string;
  title: string;
  line: string;
  onClose: () => void;
  autoCloseMs?: number;
}): JSX.Element {
  const reduced = usePrefersReducedMotion();
  const autoCloseMs = props.autoCloseMs ?? 4600;
  const { onClose } = props;

  useEffect(() => {
    const timer = setTimeout(onClose, autoCloseMs);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => { clearTimeout(timer); window.removeEventListener("keydown", onKey); };
  }, [autoCloseMs, onClose]);

  return (
    <div className={`ms-win${reduced ? " ms-win--still" : ""}`} role="status" onClick={onClose}>
      <ConfettiBurst pieces={44} durationMs={2400} />
      <div className="ms-win__card" onClick={(e) => e.stopPropagation()}>
        <div className="ms-win__mark" aria-hidden="true">{props.mark}</div>
        <div className="ms-win__title">{props.title}</div>
        <div className="ms-win__line">{props.line}</div>
        <button type="button" className="ms-win__btn" onClick={onClose}>Nice</button>
      </div>
      <style jsx>{`
        .ms-win { position: fixed; inset: 0; z-index: 4001; display: flex; align-items: center; justify-content: center; padding: 20px; background: rgba(15, 18, 24, 0.55); animation: ms-win-veil 220ms ease-out both; }
        .ms-win__card { position: relative; width: min(360px, 100%); border-radius: 18px; padding: 26px 22px 20px; text-align: center; background: var(--surface-default); color: var(--text-primary); box-shadow: 0 24px 60px rgba(0, 0, 0, 0.35); animation: ms-win-card 420ms cubic-bezier(0.22, 1, 0.36, 1) both; }
        .ms-win__mark { font-size: 46px; line-height: 1; animation: ms-win-mark 700ms cubic-bezier(0.22, 1, 0.36, 1) 120ms both; }
        .ms-win__title { margin-top: 10px; font-size: 22px; font-weight: 800; letter-spacing: -0.01em; }
        .ms-win__line { margin-top: 6px; font-size: 14px; line-height: 1.45; color: var(--text-muted); }
        .ms-win__btn { margin-top: 18px; width: 100%; padding: 11px 18px; border: none; border-radius: 24px; background: var(--brand-fill); color: var(--text-inverse); font-size: 15px; font-weight: 700; cursor: pointer; }
        .ms-win--still .ms-win__card, .ms-win--still .ms-win__mark, .ms-win--still { animation: none; }
        @keyframes ms-win-veil { from { opacity: 0; } to { opacity: 1; } }
        @keyframes ms-win-card { from { opacity: 0; transform: translateY(16px) scale(0.96); } to { opacity: 1; transform: none; } }
        @keyframes ms-win-mark { 0% { transform: scale(0.4) rotate(-12deg); } 60% { transform: scale(1.12) rotate(4deg); } 100% { transform: none; } }
      `}</style>
    </div>
  );
}
