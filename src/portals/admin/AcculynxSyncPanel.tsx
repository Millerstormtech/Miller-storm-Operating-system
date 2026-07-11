// src/portals/admin/AcculynxSyncPanel.tsx
import { useEffect, useState, useCallback } from "react";

export function AcculynxSyncPanel({ adminUserId }: { adminUserId: string }) {
  const [status, setStatus] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [, setTick] = useState(0); // ticks periodically so the "x minutes ago" label stays current

  const load = useCallback(async () => {
    const s = await fetch("/api/acculynx/status").then((r) => (r.ok ? r.json() : null));
    setStatus(s);
    return s;
  }, []);

  useEffect(() => { load(); }, [load]);

  // Keep the "Last updated x minutes ago" label current without re-fetching.
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(id);
  }, []);

  // Poll status until the sync is no longer running (or we hit the cap). The
  // sync keeps running server-side after the proxy cuts our request, so this
  // is how we surface its real result instead of a false timeout error.
  const pollUntilDone = useCallback(async () => {
    for (let i = 0; i < 120; i++) { // ~10 min at 5s
      await new Promise((r) => setTimeout(r, 5000));
      const s = await load();
      if (s && !s.running) return s;
    }
    return null;
  }, [load]);

  async function refreshNow() {
    setBusy(true);
    setActionError("");
    try {
      // Kick the sync off in the background: the endpoint returns 202 right away
      // so the request never stays open long enough for nginx to 504. We then
      // poll status silently so the dashboard updates. (A full sync takes minutes.)
      const res = await fetch("/api/acculynx/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: adminUserId, mode: "incremental", background: true }),
      });
      if (res.status === 202 || res.ok) {
        const s = await pollUntilDone();
        if (s && s.lastStatus === "failed") setActionError(`Some locations failed: ${s.lastError ?? "unknown"}`);
      } else {
        setActionError(`Sync failed (HTTP ${res.status}).`);
        await load();
      }
    } catch (e: any) {
      // If the kickoff request itself dropped, the sync may still be running —
      // poll rather than show a hard failure.
      const s = await pollUntilDone();
      if (s && s.lastStatus === "failed") setActionError(`Some locations failed: ${s.lastError ?? "unknown"}`);
      else if (!s) setActionError(e?.message ?? "Sync request failed.");
    } finally {
      setBusy(false);
    }
  }

  const fmtDate = (d?: string) => (d ? new Date(d).toLocaleString() : "—");

  // Relative "x minutes ago" — timezone-independent, so every viewer sees the same.
  const timeAgo = (d?: string) => {
    if (!d) return null;
    const secs = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
    if (secs < 45) return "just now";
    const mins = Math.round(secs / 60);
    if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return `${hrs} hour${hrs === 1 ? "" : "s"} ago`;
    const days = Math.round(hrs / 24);
    return `${days} day${days === 1 ? "" : "s"} ago`;
  };

  return (
    <div style={{ marginTop: 32, paddingTop: 24, borderTop: "1px solid #e5e7eb" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span style={{ fontSize: 14, color: "#6b7280" }} title={status?.lastSyncAt ? fmtDate(status.lastSyncAt) : undefined}>
          {status?.lastSyncAt ? `Last updated ${timeAgo(status.lastSyncAt)}` : "Not updated yet"}
        </span>
        <button
          onClick={refreshNow}
          disabled={busy}
          style={{ padding: "8px 18px", background: busy ? "#9ca3af" : "#2563eb", color: "#fff", border: "none", borderRadius: 6, cursor: busy ? "default" : "pointer", fontWeight: 600 }}
        >
          {busy ? "Updating…" : "Update now"}
        </button>
      </div>
      {actionError ? <p style={{ color: "#dc2626", marginTop: 12 }}>{actionError}</p> : null}
      {status?.lastError ? <p style={{ color: "#dc2626", marginTop: 8 }}>Last error: {status.lastError}</p> : null}
    </div>
  );
}
