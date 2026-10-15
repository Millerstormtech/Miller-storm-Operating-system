import { useEffect, useMemo, useState } from "react";
import { notify } from "../lib/appDialogs";
import { roleDisplayName } from "../lib/roleLabels";

// "Create group" from the normal Storm Chat screen. Shown to the roles allowed
// to create groups (GROUP_CREATOR_ROLES in src/lib/stormchat/access.ts); the
// server makes the creator the group's first admin. New groups are private:
// public (everyone) groups are still made from the Admin management screen.

type Person = { _id: string; id?: string; name: string; role?: string };

type Props = {
  onClose: () => void;
  onCreated: (group: any) => void;
  myId?: string; // app id, so the creator isn't listed to pick
};

export function StormChatCreateGroup({ onClose, onCreated, myId }: Props) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [adminOnly, setAdminOnly] = useState(false);
  const [people, setPeople] = useState<Person[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/users/directory")
      .then((r) => (r.ok ? r.json() : []))
      .then((list) => setPeople((Array.isArray(list) ? list : []).filter((p: Person) => p.id !== myId)))
      .catch(() => {});
  }, [myId]);

  const shown = useMemo(
    () => people.filter((p) => p.name.toLowerCase().includes(search.trim().toLowerCase())),
    [people, search],
  );

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function create() {
    if (!name.trim() || picked.size === 0) return;
    setSaving(true);
    try {
      const res = await fetch("/api/storm-chat/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), description, members: [...picked], onlyAdminCanChat: adminOnly, visibility: "private" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { notify(data.error || "Could not create the group", "error"); return; }
      notify(`"${data.name}" created`, "success");
      onCreated(data);
    } finally { setSaving(false); }
  }

  const input: React.CSSProperties = {
    width: "100%", padding: "10px 12px", border: "1px solid var(--border-default)", borderRadius: 10, fontSize: 14,
    boxSizing: "border-box", background: "var(--surface-subtle)", color: "var(--text-primary)", fontFamily: "inherit", outline: "none",
  };

  return (
    <div onClick={onClose} role="dialog" aria-label="Create group"
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ background: "var(--surface-default)", color: "var(--text-primary)", borderRadius: 16, width: "100%", maxWidth: 480, maxHeight: "86vh", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
        <div style={{ padding: "16px 18px", borderBottom: "1px solid var(--border-default)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>Create group</div>
          <button onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", fontSize: 22, color: "var(--text-subtle)", cursor: "pointer", lineHeight: 1 }}>×</button>
        </div>
        <div style={{ padding: "14px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
          <input autoFocus aria-label="Group name" placeholder="Group name" value={name} onChange={(e) => setName(e.target.value)} style={input} />
          <input aria-label="Description" placeholder="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} style={input} />
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, cursor: "pointer" }}>
            <input type="checkbox" checked={adminOnly} onChange={(e) => setAdminOnly(e.target.checked)} />
            Only admins can post
          </label>
          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>You will be the group admin. Add members ({picked.size} picked):</div>
          <input aria-label="Search people" placeholder="Search people" value={search} onChange={(e) => setSearch(e.target.value)} style={input} />
        </div>
        <div style={{ overflowY: "auto", padding: "0 10px 8px", flex: 1 }}>
          {shown.map((p) => (
            <label key={p._id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 8px", cursor: "pointer", borderRadius: 8 }}>
              <input type="checkbox" checked={picked.has(String(p._id))} onChange={() => toggle(String(p._id))} />
              <span style={{ flex: 1, fontSize: 14 }}>{p.name}</span>
              <span style={{ fontSize: 12, color: "var(--text-subtle)" }}>{roleDisplayName(p.role)}</span>
            </label>
          ))}
          {shown.length === 0 && <div style={{ textAlign: "center", color: "var(--text-subtle)", padding: 20, fontSize: 13 }}>No people found</div>}
        </div>
        <div style={{ padding: "12px 18px", borderTop: "1px solid var(--border-default)", display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button onClick={onClose} style={{ padding: "9px 14px", borderRadius: 10, border: "1px solid var(--border-default)", background: "var(--surface-subtle)", color: "var(--text-primary)", cursor: "pointer", fontWeight: 600 }}>Cancel</button>
          <button onClick={create} disabled={saving || !name.trim() || picked.size === 0}
            style={{ padding: "9px 16px", borderRadius: 10, border: "none", background: "var(--brand-fill)", color: "var(--text-inverse)", cursor: saving ? "wait" : "pointer", fontWeight: 700, opacity: !name.trim() || picked.size === 0 ? 0.5 : 1 }}>
            {saving ? "Creating…" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}
