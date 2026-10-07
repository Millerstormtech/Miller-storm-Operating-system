// Admin: Team History. Team warnings, recent moves, and one rep's timeline with
// two fixes: change a move's date, or add a move from before recording began.
// Every fix previews what shifts between teams, needs a reason, and can be undone.
// Admins only (enforced by the API). Teams are named by their lead's full name.
import { useCallback, useEffect, useState } from "react";
import { shortDate } from "../../lib/teamhistory/segments";

type Team = { name: string; branch: string };
type Period = { team: string; branch: string; from: string; to: string | null; source: string };
type Detail = { repcardUserId: string; repName: string; version: number; periods: Period[]; edits: { id: string; action: string; reason: string; createdAt: string; undone: boolean }[] };
type Shift = { from: string; to: string; revenue: number; won: number; filed: number; verifiedKnocks: number };

const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const teamText = (t: string) => t || "No team";
const SOURCE_LABEL: Record<string, string> = { initial: "start of records", sync: "User Management", backup: "backups", admin: "admin fix" };

export function TeamHistory() {
  const [list, setList] = useState<{ warnings: { key: string; text: string }[]; moves: any[]; matches: any[]; teams: Team[] } | null>(null);
  const [q, setQ] = useState("");
  const [detail, setDetail] = useState<Detail | null>(null);
  const [form, setForm] = useState<{ action: "move-date" | "add-move"; index?: number; date: string; earlierTeam: string; reason: string } | null>(null);
  const [preview, setPreview] = useState<Shift[] | null>(null);
  const [error, setError] = useState("");

  const loadList = useCallback(async (query = "") => {
    const r = await fetch(`/api/admin/team-history${query ? `?q=${encodeURIComponent(query)}` : ""}`);
    if (r.ok) setList(await r.json());
  }, []);
  useEffect(() => { loadList(); }, [loadList]);

  const openRep = async (id: string) => {
    setError(""); setForm(null); setPreview(null);
    const r = await fetch(`/api/admin/team-history/${encodeURIComponent(id)}`);
    if (r.ok) setDetail(await r.json());
  };

  const post = async (body: any) => {
    if (!detail) return null;
    const r = await fetch(`/api/admin/team-history/${encodeURIComponent(detail.repcardUserId)}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setError(j.message || j.error || "Something went wrong."); return null; }
    setError("");
    return j;
  };

  const branchOf = (t: string) => list?.teams.find((x) => x.name === t)?.branch || "";
  const payload = () => form && detail && ({
    action: form.action, version: detail.version, index: form.index, date: form.date,
    earlierTeam: form.earlierTeam, earlierBranch: branchOf(form.earlierTeam), reason: form.reason,
  });
  const doPreview = async () => { const j = await post({ op: "preview", ...payload() }); if (j) setPreview(j.shifts); };
  const doSave = async () => { const j = await post({ op: "save", ...payload() }); if (j) { await openRep(detail!.repcardUserId); loadList(q); } };
  const doUndo = async (editId: string) => { const j = await post({ op: "undo", editId }); if (j) { await openRep(detail!.repcardUserId); loadList(q); } };

  if (!list) return <div style={{ padding: 24 }}>Loading...</div>;

  return (
    <div style={{ padding: 24, display: "grid", gap: 24, maxWidth: 960 }}>
      {list.warnings.length > 0 && (
        <section style={{ border: "1px solid var(--warning-on-surface)", borderRadius: 8, padding: 16 }}>
          <h2 style={{ marginTop: 0 }}>Needs attention in User Management</h2>
          <ul>{list.warnings.map((w) => <li key={w.key}>{w.text}</li>)}</ul>
        </section>
      )}

      <section>
        <h2>Find a rep</h2>
        <input value={q} onChange={(e) => { setQ(e.target.value); loadList(e.target.value); }} placeholder="Name" style={{ padding: 8, width: "100%", maxWidth: 360 }} />
        <ul>{list.matches.map((m) => <li key={m.repcardUserId}><button onClick={() => openRep(m.repcardUserId)}>{m.repName}</button></li>)}</ul>
      </section>

      {detail && (
        <section style={{ borderRadius: 8, padding: 16, border: "1px solid currentColor" }}>
          <h2 style={{ marginTop: 0 }}>{detail.repName}</h2>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><th align="left">Team</th><th align="left">Branch</th><th align="left">From</th><th align="left">To</th><th align="left">How we know</th><th /></tr></thead>
            <tbody>
              {detail.periods.map((p, i) => (
                <tr key={p.from}>
                  <td>{teamText(p.team)}</td><td>{p.branch || "None"}</td>
                  <td>{shortDate(p.from)}</td><td>{p.to ? shortDate(p.to) : "Now"}</td>
                  <td>{SOURCE_LABEL[p.source] || p.source}</td>
                  <td>{i > 0 && <button onClick={() => { setPreview(null); setForm({ action: "move-date", index: i, date: p.from, earlierTeam: "", reason: "" }); }}>Change date</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p><button onClick={() => { setPreview(null); setForm({ action: "add-move", date: "", earlierTeam: "", reason: "" }); }}>Add an earlier move</button></p>

          {form && (
            <div style={{ display: "grid", gap: 8, maxWidth: 420 }}>
              <label>{form.action === "move-date" ? "New date of the move" : "Date they joined the team they were on next"}
                <input type="date" value={form.date} onChange={(e) => { setPreview(null); setForm({ ...form, date: e.target.value }); }} />
              </label>
              {form.action === "add-move" && (
                <label>Team before that date
                  <select value={form.earlierTeam} onChange={(e) => { setPreview(null); setForm({ ...form, earlierTeam: e.target.value }); }}>
                    <option value="">Choose a team</option>
                    {list.teams.map((t) => <option key={t.name} value={t.name}>{t.name}</option>)}
                  </select>
                </label>
              )}
              <label>Reason (required)
                <input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="e.g. Nadine confirmed the move date" />
              </label>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={doPreview} disabled={!form.date || (form.action === "add-move" && !form.earlierTeam)}>Preview</button>
                <button onClick={doSave} disabled={!preview || !form.reason.trim()}>Save</button>
                <button onClick={() => { setForm(null); setPreview(null); }}>Cancel</button>
              </div>
              {preview && (preview.length === 0
                ? <p>No numbers move between teams.</p>
                : <ul>{preview.map((s, i) => (
                    <li key={i}>Moves {money(s.revenue)} revenue, {s.won} contracts, {s.filed} claims and {s.verifiedKnocks} knocks from {teamText(s.from)} to {teamText(s.to)}.</li>
                  ))}</ul>)}
            </div>
          )}
          {error && <p style={{ color: "var(--danger, #c00)" }}>{error}</p>}

          {detail.edits.length > 0 && (
            <>
              <h3>Changes made here</h3>
              <ul>{detail.edits.map((e) => (
                <li key={e.id}>
                  {new Date(e.createdAt).toLocaleDateString("en-US")}: {e.action === "move-date" ? "Changed a move date" : e.action === "add-move" ? "Added an earlier move" : "Undo"}. {e.reason}
                  {!e.undone && e.action !== "undo" && <> <button onClick={() => doUndo(e.id)}>Undo</button></>}
                  {e.undone && " (undone)"}
                </li>
              ))}</ul>
            </>
          )}
        </section>
      )}

      <section>
        <h2>Recent moves</h2>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr><th align="left">Rep</th><th align="left">From</th><th align="left">To</th><th align="left">On</th><th align="left">How we know</th></tr></thead>
          <tbody>
            {list.moves.map((m) => (
              <tr key={`${m.repcardUserId}:${m.on}`} onClick={() => openRep(m.repcardUserId)} style={{ cursor: "pointer" }}>
                <td>{m.repName}</td><td>{teamText(m.fromTeam)}</td><td>{teamText(m.toTeam)}</td><td>{shortDate(m.on)}</td><td>{SOURCE_LABEL[m.source] || m.source}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
