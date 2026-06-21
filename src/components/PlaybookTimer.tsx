import { useState, useEffect, useRef, useCallback } from "react";

type Props = {
  userId: string;
  courseId: string;
  courseTitle: string;
  onComplete: () => Promise<{ pct: number; done: number; total: number }>;
};

const STORAGE_KEY = (userId: string, courseId: string) =>
  `playbook-timer-${userId}-${courseId}`;

const HOURS = [1, 2, 3, 4];

function fmt(secs: number) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function sendSmsEvent(type: string, userId: string, courseTitle: string, durationHours?: number, timeRemainingSeconds?: number) {
  fetch("/api/training-timer-sms", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type, userId, courseTitle, durationHours, timeRemainingSeconds }),
  }).catch(console.error);
}

export function PlaybookTimer({ userId, courseId, courseTitle, onComplete }: Props) {
  const key = STORAGE_KEY(userId, courseId);

  const [state, setState] = useState<"idle" | "picking" | "running" | "done">(() => {
    if (typeof window === "undefined") return "idle";
    const saved = localStorage.getItem(key);
    if (!saved) return "idle";
    const { endsAt } = JSON.parse(saved);
    return Date.now() < endsAt ? "running" : "done";
  });

  const [remaining, setRemaining] = useState<number>(() => {
    if (typeof window === "undefined") return 0;
    const saved = localStorage.getItem(key);
    if (!saved) return 0;
    const { endsAt } = JSON.parse(saved);
    return Math.max(0, Math.round((endsAt - Date.now()) / 1000));
  });

  const [pickedHours, setPickedHours] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const completedRef = useRef(false);
  // Track which SMS alerts have already fired (survive re-renders)
  const midpointFiredRef = useRef(false);
  const finalFiredRef = useRef(false);

  // Restore fired flags from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem(key);
    if (saved) {
      const { midpointFired, finalFired } = JSON.parse(saved);
      midpointFiredRef.current = !!midpointFired;
      finalFiredRef.current = !!finalFired;
    }
  }, [key]);

  // Tick
  useEffect(() => {
    if (state !== "running") return;
    const id = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) { clearInterval(id); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [state]);

  // SMS milestone checks on every tick
  useEffect(() => {
    if (state !== "running") return;
    const saved = localStorage.getItem(key);
    if (!saved) return;
    const { hours } = JSON.parse(saved);
    if (!hours) return;

    const totalSecs = hours * 3600;
    const midpointSecs = totalSecs / 2;
    const finalSecs = 30 * 60; // 30 minutes

    // Midpoint alert — fire when remaining crosses below midpoint
    if (!midpointFiredRef.current && remaining <= midpointSecs && remaining > 0) {
      midpointFiredRef.current = true;
      // Persist flag so page refresh doesn't re-fire
      const data = JSON.parse(localStorage.getItem(key) || "{}");
      localStorage.setItem(key, JSON.stringify({ ...data, midpointFired: true }));
      sendSmsEvent("midpoint", userId, courseTitle, hours, remaining);
    }

    // Final 30-min alert — only meaningful for sessions > 30 min
    if (!finalFiredRef.current && totalSecs > finalSecs && remaining <= finalSecs && remaining > 0) {
      finalFiredRef.current = true;
      const data = JSON.parse(localStorage.getItem(key) || "{}");
      localStorage.setItem(key, JSON.stringify({ ...data, finalFired: true }));
      sendSmsEvent("final", userId, courseTitle, hours, remaining);
    }
  }, [remaining, state, key, userId, courseTitle]);

  // Fire completion when remaining hits 0
  useEffect(() => {
    if (state !== "running" || remaining > 0 || completedRef.current) return;
    completedRef.current = true;
    setState("done");
    localStorage.removeItem(key);

    setSending(true);
    onComplete().then(({ pct, done, total }) => {
      // Send completion SMS
      sendSmsEvent("complete", userId, courseTitle);
      // Also send completion email (existing behaviour)
      fetch("/api/training-timer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "complete", userId, courseTitle, progressPct: pct, lessonsCompleted: done, lessonsTotal: total }),
      }).catch(console.error).finally(() => setSending(false));
    });
  }, [remaining, state]);

  const handleStart = useCallback(() => {
    if (!pickedHours) return;
    const endsAt = Date.now() + pickedHours * 3600 * 1000;
    localStorage.setItem(key, JSON.stringify({ endsAt, hours: pickedHours, midpointFired: false, finalFired: false }));
    completedRef.current = false;
    midpointFiredRef.current = false;
    finalFiredRef.current = false;
    setRemaining(pickedHours * 3600);
    setState("running");

    // Send start SMS + email
    sendSmsEvent("start", userId, courseTitle, pickedHours);
    fetch("/api/training-timer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "start", userId, courseTitle, durationHours: pickedHours }),
    }).catch(console.error);
  }, [pickedHours, key, userId, courseTitle]);

  const handleCancel = () => {
    localStorage.removeItem(key);
    completedRef.current = false;
    midpointFiredRef.current = false;
    finalFiredRef.current = false;
    setState("idle");
    setPickedHours(null);
    setRemaining(0);
  };

  // ── IDLE ──
  if (state === "idle") {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", background: "#f8fafc", border: "1px solid #e5e7eb", borderRadius: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 18 }}>⏱️</span>
        <span style={{ fontSize: 13, color: "#374151", fontWeight: 500 }}>Training Timer</span>
        <button onClick={() => setState("picking")} style={{ marginLeft: "auto", padding: "6px 14px", borderRadius: 6, background: "#2563eb", color: "#fff", border: "none", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
          Start Timer
        </button>
      </div>
    );
  }

  // ── PICKING ──
  if (state === "picking") {
    return (
      <div style={{ padding: "14px 16px", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 8, marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#1d4ed8", marginBottom: 10 }}>⏱️ Select Timer Duration</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          {HOURS.map((h) => (
            <button key={h} onClick={() => setPickedHours(h)} style={{ padding: "8px 18px", borderRadius: 6, border: "2px solid", borderColor: pickedHours === h ? "#2563eb" : "#d1d5db", background: pickedHours === h ? "#2563eb" : "#fff", color: pickedHours === h ? "#fff" : "#374151", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
              {h} hr
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={handleStart} disabled={!pickedHours} style={{ padding: "7px 18px", borderRadius: 6, background: pickedHours ? "#2563eb" : "#93c5fd", color: "#fff", border: "none", fontSize: 13, fontWeight: 600, cursor: pickedHours ? "pointer" : "not-allowed" }}>
            Confirm & Start
          </button>
          <button onClick={() => setState("idle")} style={{ padding: "7px 14px", borderRadius: 6, background: "none", border: "1px solid #d1d5db", fontSize: 13, color: "#6b7280", cursor: "pointer" }}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // ── RUNNING ──
  if (state === "running") {
    const pct = (() => {
      const saved = typeof window !== "undefined" ? localStorage.getItem(key) : null;
      if (!saved) return 0;
      const { endsAt, hours } = JSON.parse(saved);
      const total = hours * 3600;
      const elapsed = total - remaining;
      return Math.min(100, Math.round((elapsed / total) * 100));
    })();

    return (
      <div style={{ padding: "12px 16px", background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 8, marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 18 }}>⏱️</span>
            <div>
              <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 500 }}>Time Remaining</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: "#15803d", fontVariantNumeric: "tabular-nums" }}>{fmt(remaining)}</div>
            </div>
          </div>
          <div style={{ flex: 1, minWidth: 120, maxWidth: 240 }}>
            <div style={{ height: 6, borderRadius: 999, background: "#dcfce7", overflow: "hidden" }}>
              <div style={{ width: `${pct}%`, height: "100%", background: "#22c55e", transition: "width 1s linear" }} />
            </div>
          </div>
          <button onClick={handleCancel} style={{ padding: "5px 12px", borderRadius: 6, background: "none", border: "1px solid #d1d5db", fontSize: 12, color: "#6b7280", cursor: "pointer" }}>
            Cancel Timer
          </button>
        </div>
      </div>
    );
  }

  // ── DONE ──
  return (
    <div style={{ padding: "12px 16px", background: "#fef3c7", border: "1px solid #fcd34d", borderRadius: 8, marginBottom: 12, display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{ fontSize: 18 }}>🏁</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: 13, color: "#92400e" }}>
          Timer Complete! {sending ? "Sending summary..." : "Summary sent."}
        </div>
      </div>
      <button onClick={handleCancel} style={{ padding: "5px 12px", borderRadius: 6, background: "none", border: "1px solid #d1d5db", fontSize: 12, color: "#6b7280", cursor: "pointer" }}>
        Dismiss
      </button>
    </div>
  );
}
