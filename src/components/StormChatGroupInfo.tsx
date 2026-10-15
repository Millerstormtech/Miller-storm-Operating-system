import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { appConfirm, notify } from "../lib/appDialogs";

// "Group info" sheet for one Storm Chat group, opened by tapping the group's
// name in the chat header (GroupMe-style). Everyone sees the members and can
// Leave; the group's own admins also get the management tools. What is shown
// comes from the server's `myRights` (src/lib/stormchat/access.ts chatRights),
// so the screen never offers an action the server would refuse.

export type ChatRights = {
  isMember: boolean;
  isGroupAdmin: boolean;
  canRead: boolean;
  canSend: boolean;
  canPin: boolean;
  canModerate: boolean;
  canManage: boolean;
  canDelete: boolean;
  canLeave: boolean;
};

type GroupDoc = {
  _id: string;
  name: string;
  description?: string;
  imageUrl?: string;
  members?: string[];
  admins?: string[];
  onlyAdminCanChat?: boolean;
  visibility?: "public" | "private";
  myRights: ChatRights;
  myMongoId?: string;
  muted?: boolean;
  subgroupCount?: number;
};

type Person = { _id: string; id?: string; name: string; role?: string; headshotUrl?: string };
type JoinRequest = { _id: string; userId: string; userName?: string };

type Props = {
  groupId: string;
  // The viewer's Mongo _id, so their own row offers Leave, not Remove.
  myMongoId?: string;
  onClose: () => void;
  // The group changed (renamed, members, admin-only...): the room refreshes.
  onChanged: (group: GroupDoc) => void;
  // The viewer left, or the group was deleted: the room closes.
  onGone: () => void;
};

const SHEET: React.CSSProperties = {
  position: "fixed", inset: 0, zIndex: 2000, background: "rgba(0,0,0,0.45)",
  display: "flex", justifyContent: "flex-end",
};
const PANEL: React.CSSProperties = {
  width: "100%", maxWidth: 420, height: "100%", overflowY: "auto",
  background: "var(--surface-default)", color: "var(--text-primary)",
  boxShadow: "-8px 0 24px rgba(0,0,0,0.18)", display: "flex", flexDirection: "column",
};
const SECTION: React.CSSProperties = { padding: "14px 18px", borderBottom: "1px solid var(--border-default)" };
const LABEL: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 8 };
const INPUT: React.CSSProperties = {
  width: "100%", padding: "9px 11px", border: "1px solid var(--border-default)", borderRadius: 8,
  fontSize: 14, boxSizing: "border-box", background: "var(--surface-subtle)", color: "var(--text-primary)", fontFamily: "inherit",
};
const BTN: React.CSSProperties = {
  padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border-default)", background: "var(--surface-subtle)",
  color: "var(--text-primary)", cursor: "pointer", fontSize: 13, fontWeight: 600,
};
const PRIMARY: React.CSSProperties = { ...BTN, background: "var(--brand-fill)", borderColor: "var(--brand-fill)", color: "var(--text-inverse)" };
const DANGER: React.CSSProperties = { ...BTN, color: "#e5484d", borderColor: "rgba(229,72,77,0.4)" };
const SMALL: React.CSSProperties = { ...BTN, padding: "4px 8px", fontSize: 12, fontWeight: 600 };

export function StormChatGroupInfo({ groupId, myMongoId, onClose, onChanged, onGone }: Props) {
  const [group, setGroup] = useState<GroupDoc | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [requests, setRequests] = useState<JoinRequest[]>([]);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftDesc, setDraftDesc] = useState("");
  const [adding, setAdding] = useState(false);
  const [directory, setDirectory] = useState<Person[]>([]);
  const [search, setSearch] = useState("");
  const [pickNewAdmin, setPickNewAdmin] = useState(false);

  const rights = group?.myRights;
  const meId = myMongoId || group?.myMongoId || "";
  const memberIds = useMemo(() => (group?.members || []).map(String), [group]);
  const adminIds = useMemo(() => new Set((group?.admins || []).map(String)), [group]);

  async function load() {
    const res = await fetch(`/api/storm-chat/groups/${groupId}`);
    if (!res.ok) { onGone(); return; }
    const g: GroupDoc = await res.json();
    setGroup(g);
    setDraftName(g.name || "");
    setDraftDesc(g.description || "");
    const ids = (g.members || []).join(",");
    if (ids) {
      fetch(`/api/users/by-mongo-ids?ids=${ids}`)
        .then((r) => (r.ok ? r.json() : []))
        .then((list) => setPeople(Array.isArray(list) ? list : []))
        .catch(() => {});
    } else setPeople([]);
    if (g.myRights?.canManage) {
      fetch(`/api/storm-chat/join-requests?groupId=${groupId}`)
        .then((r) => (r.ok ? r.json() : []))
        .then((list) => setRequests(Array.isArray(list) ? list : []))
        .catch(() => {});
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [groupId]);
  // Escape closes the sheet (keyboard users; the phone has the ✕).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Tell the room the latest group (name, members, settings) after a change.
  async function refreshRoom() {
    const res = await fetch(`/api/storm-chat/groups/${groupId}`);
    if (res.ok) onChanged(await res.json());
  }

  // Save a partial change; the server only touches the fields sent.
  async function save(patch: Record<string, unknown>, okText?: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/storm-chat/groups/${groupId}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { notify(data.error || "Could not save the change", "error"); return false; }
      if (okText) notify(okText, "success");
      await load();
      await refreshRoom();
      return true;
    } finally { setBusy(false); }
  }

  async function setMute(m: boolean) {
    setBusy(true);
    try {
      const res = await fetch(`/api/storm-chat/groups/${groupId}/mute`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ muted: m }),
      });
      if (!res.ok) { notify("Couldn't change notifications", "error"); return; }
      notify(m ? "Group muted. You'll still get @mentions." : "Group unmuted", "success");
      await load();
      await refreshRoom();
    } finally { setBusy(false); }
  }

  async function removeMember(p: Person) {
    if (!(await appConfirm(`Remove ${p.name} from this group?`))) return;
    await save({ members: memberIds.filter((m) => m !== String(p._id)) }, `${p.name} was removed`);
  }

  async function toggleAdmin(p: Person) {
    const id = String(p._id);
    const next = adminIds.has(id) ? [...adminIds].filter((a) => a !== id) : [...adminIds, id];
    await save({ admins: next }, adminIds.has(id) ? `${p.name} is no longer an admin` : `${p.name} is now an admin`);
  }

  async function openAdd() {
    setAdding(true);
    setSearch("");
    if (directory.length === 0) {
      const res = await fetch("/api/users/directory");
      const list = res.ok ? await res.json() : [];
      setDirectory(Array.isArray(list) ? list : []);
    }
  }

  async function addMember(p: Person) {
    await save({ members: [...memberIds, String(p._id)] }, `${p.name} was added`);
  }

  async function decide(r: JoinRequest, action: "approve" | "deny") {
    setBusy(true);
    try {
      const res = await fetch("/api/storm-chat/join-requests", {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestId: r._id, action }),
      });
      if (!res.ok) { notify("Could not update the request", "error"); return; }
      notify(action === "approve" ? `${r.userName || "They"} joined the group` : "Request declined", "success");
      await load();
      await refreshRoom();
    } finally { setBusy(false); }
  }

  async function leave(newAdminId?: string) {
    if (!newAdminId && !(await appConfirm("Leave this group? You will stop getting its messages."))) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/storm-chat/groups/${groupId}/leave`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(newAdminId ? { newAdminId } : {}),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 409 && data.needsNewAdmin) { setPickNewAdmin(true); return; }
      if (!res.ok) { notify(data.error || "Could not leave the group", "error"); return; }
      notify("You left the group", "success");
      onGone();
    } finally { setBusy(false); }
  }

  async function deleteGroup() {
    const subs = group?.subgroupCount || 0;
    const extra = subs ? ` and its ${subs} ${subs === 1 ? 'subgroup' : 'subgroups'}` : '';
    if (!(await appConfirm(`Delete "${group?.name}"${extra} for everyone, with all messages? This can't be undone.`))) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/storm-chat/groups/${groupId}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { notify(data.error || "Could not delete the group", "error"); return; }
      notify("Group deleted", "success");
      onGone();
    } finally { setBusy(false); }
  }

  const byId = new Map(people.map((p) => [String(p._id), p]));
  const sortedMembers = memberIds
    .map((id) => byId.get(id) || { _id: id, name: "Former user" })
    .sort((a, b) => Number(adminIds.has(String(b._id))) - Number(adminIds.has(String(a._id))) || a.name.localeCompare(b.name));
  const addable = directory
    .filter((p) => !memberIds.includes(String(p._id)))
    .filter((p) => p.name.toLowerCase().includes(search.trim().toLowerCase()));

  // Rendered into <body>: inside the chat room it sat under the page's
  // stacking layers, so on a phone the ☰ menu button covered its ✕.
  if (typeof document === "undefined") return null;
  return createPortal(
    <div style={SHEET} onClick={onClose} role="dialog" aria-label="Group info">
      <div style={PANEL} onClick={(e) => e.stopPropagation()}>
        <div style={{ ...SECTION, display: "flex", alignItems: "center", gap: 10, position: "sticky", top: 0, background: "var(--surface-default)", zIndex: 1 }}>
          <button onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "var(--text-primary)" }}>✕</button>
          <div style={{ fontWeight: 700, fontSize: 16 }}>Group info</div>
        </div>

        {!group ? (
          <div style={{ padding: 24, color: "var(--text-muted)" }}>Loading…</div>
        ) : (
          <>
            {/* Name, description, picture */}
            <div style={{ ...SECTION, display: "flex", gap: 14, alignItems: "flex-start" }}>
              <div style={{
                width: 56, height: 56, borderRadius: 12, flexShrink: 0, background: "#000", color: "var(--text-inverse)",
                backgroundImage: group.imageUrl ? `url(${group.imageUrl})` : "none", backgroundSize: "cover",
                backgroundPosition: "center", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24,
              }}>{!group.imageUrl && "👥"}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                {editing ? (
                  <>
                    <input aria-label="Group name" value={draftName} onChange={(e) => setDraftName(e.target.value)} style={{ ...INPUT, marginBottom: 8 }} />
                    <textarea aria-label="Group description" value={draftDesc} onChange={(e) => setDraftDesc(e.target.value)} rows={3} placeholder="Description (optional)" style={{ ...INPUT, resize: "vertical" }} />
                    <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                      <button style={PRIMARY} disabled={busy || !draftName.trim()}
                        onClick={async () => { if (await save({ name: draftName, description: draftDesc }, "Group updated")) setEditing(false); }}>Save</button>
                      <button style={BTN} onClick={() => { setEditing(false); setDraftName(group.name); setDraftDesc(group.description || ""); }}>Cancel</button>
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ fontWeight: 700, fontSize: 17, wordBreak: "break-word" }}>{group.name}</div>
                    {group.description ? <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4, whiteSpace: "pre-wrap" }}>{group.description}</div> : null}
                    <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 6 }}>
                      {memberIds.length} {memberIds.length === 1 ? "member" : "members"}{group.onlyAdminCanChat ? " · Only admins can post" : ""}
                    </div>
                    {rights?.canManage && (
                      <button style={{ ...SMALL, marginTop: 10 }} onClick={() => setEditing(true)}>Edit name and description</button>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Notifications: anyone in the group */}
            <div style={SECTION}>
              <div style={LABEL}>Notifications</div>
              <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, cursor: "pointer" }}>
                <input type="checkbox" checked={!!group.muted} disabled={busy} onChange={(e) => setMute(e.target.checked)} />
                Mute this group
              </label>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 6 }}>
                You still get alerts when someone @mentions you.
              </div>
            </div>

            {/* Admin settings */}
            {rights?.canManage && (
              <div style={SECTION}>
                <div style={LABEL}>Settings</div>
                <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, cursor: "pointer" }}>
                  <input type="checkbox" checked={!!group.onlyAdminCanChat} disabled={busy}
                    onChange={(e) => save({ onlyAdminCanChat: e.target.checked },
                      e.target.checked ? "Only admins can post now" : "Everyone can post now")} />
                  Only admins can post
                </label>
              </div>
            )}

            {/* Pending join requests */}
            {rights?.canManage && requests.length > 0 && (
              <div style={SECTION}>
                <div style={LABEL}>Requests to join ({requests.length})</div>
                {requests.map((r) => (
                  <div key={r._id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0" }}>
                    <div style={{ flex: 1, fontSize: 14 }}>{r.userName || "Someone"}</div>
                    <button style={{ ...SMALL, ...PRIMARY, padding: "4px 10px" }} disabled={busy} onClick={() => decide(r, "approve")}>Approve</button>
                    <button style={SMALL} disabled={busy} onClick={() => decide(r, "deny")}>Decline</button>
                  </div>
                ))}
              </div>
            )}

            {/* Members */}
            <div style={SECTION}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={LABEL}>Members ({memberIds.length})</div>
                {rights?.canManage && !adding && <button style={SMALL} onClick={openAdd}>+ Add members</button>}
              </div>

              {adding && (
                <div style={{ margin: "6px 0 12px", padding: 10, border: "1px solid var(--border-default)", borderRadius: 10 }}>
                  <input autoFocus aria-label="Search people" placeholder="Search people" value={search} onChange={(e) => setSearch(e.target.value)} style={INPUT} />
                  <div style={{ maxHeight: 220, overflowY: "auto", marginTop: 6 }}>
                    {addable.slice(0, 50).map((p) => (
                      <div key={String(p._id)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 2px" }}>
                        <div style={{ flex: 1, fontSize: 14 }}>{p.name}</div>
                        <button style={SMALL} disabled={busy} onClick={() => addMember(p)}>Add</button>
                      </div>
                    ))}
                    {addable.length === 0 && <div style={{ fontSize: 13, color: "var(--text-muted)", padding: 6 }}>No one to add</div>}
                  </div>
                  <button style={{ ...SMALL, marginTop: 6 }} onClick={() => setAdding(false)}>Done</button>
                </div>
              )}

              {sortedMembers.map((p) => {
                const id = String(p._id);
                const isAdminHere = adminIds.has(id);
                return (
                  <div key={id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0" }}>
                    <div style={{
                      width: 30, height: 30, borderRadius: "50%", background: "var(--gray-700)", color: "var(--text-inverse)", flexShrink: 0,
                      display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, overflow: "hidden",
                    }}>
                      {(p as Person).headshotUrl
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={(p as Person).headshotUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        : p.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0, fontSize: 14 }}>
                      {p.name}
                      {isAdminHere && <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 700, color: "var(--brand-on-surface)" }}>Admin</span>}
                    </div>
                    {/* Your own row: no Remove / Remove admin (use Leave, which
                        makes the last admin hand over first). */}
                    {rights?.canManage && id !== meId && (
                      <>
                        <button style={SMALL} disabled={busy} onClick={() => toggleAdmin(p as Person)}>{isAdminHere ? "Remove admin" : "Make admin"}</button>
                        <button style={{ ...SMALL, color: "#e5484d" }} disabled={busy} onClick={() => removeMember(p as Person)} aria-label={`Remove ${p.name}`}>Remove</button>
                      </>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Leave / delete */}
            <div style={{ ...SECTION, display: "flex", flexDirection: "column", gap: 10, borderBottom: "none" }}>
              {pickNewAdmin && (
                <div style={{ padding: 10, border: "1px solid var(--border-default)", borderRadius: 10 }}>
                  <div style={{ fontSize: 14, marginBottom: 8 }}>You are the last admin. Pick someone to take over before you leave:</div>
                  {sortedMembers.filter((p) => !adminIds.has(String(p._id))).map((p) => (
                    <div key={String(p._id)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0" }}>
                      <div style={{ flex: 1, fontSize: 14 }}>{p.name}</div>
                      <button style={SMALL} disabled={busy} onClick={() => leave(String(p._id))}>Make admin and leave</button>
                    </div>
                  ))}
                  <button style={{ ...SMALL, marginTop: 6 }} onClick={() => setPickNewAdmin(false)}>Cancel</button>
                </div>
              )}
              {rights?.canLeave && !pickNewAdmin && <button style={DANGER} disabled={busy} onClick={() => leave()}>Leave group</button>}
              {rights?.canDelete && <button style={DANGER} disabled={busy} onClick={deleteGroup}>Delete group for everyone</button>}
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
