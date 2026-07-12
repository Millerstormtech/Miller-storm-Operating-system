import { useEffect, useRef, useState, useCallback } from "react";
import { registerDialogHost, inferToastType, ToastType } from "../lib/appDialogs";

type Toast = { id: number; message: string; type: ToastType };
type ConfirmState = { message: string; resolve: (v: boolean) => void } | null;

const TONE: Record<ToastType, { bar: string; icon: string }> = {
  success: { bar: "#16a34a", icon: "✓" },
  error: { bar: "#CB0002", icon: "!" },
  info: { bar: "#2563eb", icon: "i" },
};

// Global in-app dialog host: renders branded toasts + a confirm modal, and
// replaces the browser's native alert() so every existing alert(...) call in the
// app becomes a styled toast with no other code changes. Mounted once in _app.
export function AppDialogs() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmState, setConfirmState] = useState<ConfirmState>(null);
  const idRef = useRef(1);

  const pushToast = useCallback((message: string, type: ToastType) => {
    const id = idRef.current++;
    setToasts((prev) => [...prev, { id, message, type }]);
    // Errors linger a bit longer than success/info.
    const ttl = type === "error" ? 6000 : 4000;
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), ttl);
  }, []);

  const openConfirm = useCallback(
    (message: string) =>
      new Promise<boolean>((resolve) => setConfirmState({ message, resolve })),
    []
  );

  const closeConfirm = useCallback((result: boolean) => {
    setConfirmState((s) => {
      s?.resolve(result);
      return null;
    });
  }, []);

  useEffect(() => {
    registerDialogHost(pushToast, openConfirm);

    // Replace native alert() so all existing alert(...) calls render as toasts.
    const nativeAlert = window.alert.bind(window);
    (window as any).alert = (msg?: any) => {
      const text = msg == null ? "" : String(msg);
      pushToast(text, inferToastType(text));
    };
    return () => {
      (window as any).alert = nativeAlert;
    };
  }, [pushToast, openConfirm]);

  return (
    <>
      {/* Toast stack */}
      <div
        style={{
          position: "fixed",
          top: 16,
          right: 16,
          zIndex: 100000,
          display: "flex",
          flexDirection: "column",
          gap: 10,
          maxWidth: "min(92vw, 380px)",
          pointerEvents: "none",
        }}
      >
        {toasts.map((t) => {
          const tone = TONE[t.type];
          return (
            <div
              key={t.id}
              onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
              style={{
                pointerEvents: "auto",
                cursor: "pointer",
                display: "flex",
                alignItems: "flex-start",
                gap: 10,
                background: "#fff",
                borderRadius: 12,
                padding: "12px 14px",
                borderLeft: `4px solid ${tone.bar}`,
                boxShadow: "0 10px 30px rgba(0,0,0,0.16)",
                animation: "msos-toast-in 180ms ease-out",
              }}
            >
              <span
                style={{
                  flexShrink: 0,
                  width: 20,
                  height: 20,
                  borderRadius: 999,
                  background: tone.bar,
                  color: "#fff",
                  fontSize: 13,
                  fontWeight: 800,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginTop: 1,
                }}
              >
                {tone.icon}
              </span>
              <span style={{ fontSize: 14, color: "#111827", lineHeight: 1.4, whiteSpace: "pre-line" }}>
                {t.message}
              </span>
            </div>
          );
        })}
      </div>

      {/* Confirm modal */}
      {confirmState && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 100001,
            background: "rgba(17,24,39,0.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            animation: "msos-fade-in 140ms ease-out",
          }}
          onClick={() => closeConfirm(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(94vw, 420px)",
              background: "#fff",
              borderRadius: 16,
              boxShadow: "0 24px 60px rgba(0,0,0,0.28)",
              padding: 24,
              animation: "msos-pop-in 160ms cubic-bezier(0.2,0.9,0.3,1.2)",
            }}
          >
            <div style={{ fontSize: 15, color: "#111827", lineHeight: 1.5, whiteSpace: "pre-line", fontWeight: 500 }}>
              {confirmState.message}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 22 }}>
              <button
                type="button"
                onClick={() => closeConfirm(false)}
                style={{
                  padding: "9px 18px",
                  borderRadius: 24,
                  border: "1px solid #d1d5db",
                  background: "#fff",
                  color: "#374151",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                autoFocus
                onClick={() => closeConfirm(true)}
                style={{
                  padding: "9px 18px",
                  borderRadius: 24,
                  border: "none",
                  background: "#CB0002",
                  color: "#fff",
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        @keyframes msos-toast-in {
          from { opacity: 0; transform: translateX(24px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes msos-fade-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes msos-pop-in {
          from { opacity: 0; transform: scale(0.94); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </>
  );
}
