import { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { StormChatRoom } from "../portals/admin/StormChatRoom";

// User-facing StormChat for sales/manager web panels: lists the groups the
// current user belongs to plus their private 1-on-1 DMs (server-filtered with
// ?mine=1) and opens the shared StormChatRoom to chat. A "New message" button
// starts a DM with any user. Group creation/management stays in the admin panel.
type DmOther = { _id: string; name: string; imageUrl: string; role: string } | null;
type ChatGroup = {
  _id: string;
  name: string;
  description: string;
  imageUrl: string;
  members: string[];
  admins: string[];
  onlyAdminCanChat: boolean;
  parentGroupId?: string;
  isDirect?: boolean;
  dmOther?: DmOther;
};

type PickUser = { _id?: string; id: string; name: string; email: string; role: string; headshotUrl?: string };

export function StormChatViewer() {
  const { user } = useAuth();
  const [groups, setGroups] = useState<ChatGroup[]>([]);
  const [unread, setUnread] = useState<Record<string, number>>({});
  const [selected, setSelected] = useState<ChatGroup | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  // New-message picker
  const [pickerOpen, setPickerOpen] = useState(false);
  const [users, setUsers] = useState<PickUser[]>([]);
  const [userSearch, setUserSearch] = useState("");
  const [opening, setOpening] = useState(false);

  useEffect(() => { if (user?.id) loadGroups(); }, [user?.id]);

  useEffect(() => {
    if (!groups.length) return;
    loadUnread(groups);
    const t = setInterval(() => loadUnread(groups), 5000);
    return () => clearInterval(t);
  }, [groups]);

  async function loadGroups() {
    try {
      const res = await fetch("/api/storm-chat/groups?mine=1");
      if (res.ok) setGroups(await res.json());
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }

  async function loadUnread(list: ChatGroup[]) {
    try {
      const ids = list.map(g => g._id).join(",");
      if (!ids) return;
      const res = await fetch(`/api/storm-chat/unread-counts?groupIds=${ids}`);
      if (res.ok) setUnread(await res.json());
    } catch { /* ignore */ }
  }

  async function openGroup(g: ChatGroup) {
    setSelected(g);
    setUnread(prev => ({ ...prev, [g._id]: 0 }));
    try {
      await fetch("/api/storm-chat/mark-read", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId: g._id })
      });
    } catch { /* ignore */ }
  }

  async function openPicker() {
    setPickerOpen(true);
    if (users.length === 0) {
      try {
        // Directory endpoint is readable by ALL roles (sales included), so
        // anyone can start a DM — /api/users is admin/manager only.
        const res = await fetch("/api/users/directory");
        if (res.ok) setUsers(await res.json());
      } catch { /* ignore */ }
    }
  }

  // Start (or reopen) a DM with a user (by _id or app id) and jump into it.
  async function openDmWithId(id: string) {
    if (opening) return;
    setOpening(true);
    try {
      const res = await fetch("/api/storm-chat/dm", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: id })
      });
      if (res.ok) {
        const dm: ChatGroup = await res.json();
        setPickerOpen(false);
        setUserSearch("");
        setGroups(prev => prev.some(g => g._id === dm._id) ? prev.map(g => g._id === dm._id ? dm : g) : [dm, ...prev]);
        openGroup(dm);
      } else {
        alert("Couldn't open the conversation. Please try again.");
      }
    } catch {
      alert("Couldn't open the conversation. Please try again.");
    } finally {
      setOpening(false);
    }
  }
  function startDm(u: PickUser) { openDmWithId(u._id || u.id); }

  function titleFor(g: ChatGroup) {
    return g.isDirect ? (g.dmOther?.name || "Direct message") : g.name;
  }
  function imageFor(g: ChatGroup) {
    return g.isDirect ? (g.dmOther?.imageUrl || "") : g.imageUrl;
  }

  if (selected) {
    return (
      <StormChatRoom
        group={selected}
        isMember
        title={titleFor(selected)}
        onMessagePrivately={selected.isDirect ? undefined : (id) => openDmWithId(id)}
        onBack={() => { setSelected(null); loadUnread(groups); loadGroups(); }}
      />
    );
  }

  const q = search.trim().toLowerCase();
  const visible = (q ? groups.filter(g => titleFor(g).toLowerCase().includes(q)) : groups);
  const dms = visible.filter(g => g.isDirect);
  const normalGroups = visible.filter(g => !g.isDirect);

  const uq = userSearch.trim().toLowerCase();
  const pickable = users
    .filter(u => u.id !== user?.id)
    .filter(u => !uq || u.name.toLowerCase().includes(uq) || u.email.toLowerCase().includes(uq));

  function GroupRow({ g }: { g: ChatGroup }) {
    const count = unread[g._id] || 0;
    const img = imageFor(g);
    return (
      <button
        key={g._id}
        onClick={() => openGroup(g)}
        style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 14px", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, cursor: "pointer", textAlign: "left", width: "100%", transition: "background 0.15s" }}
        onMouseEnter={e => (e.currentTarget.style.background = "#f9fafb")}
        onMouseLeave={e => (e.currentTarget.style.background = "#fff")}
      >
        <div style={{ width: 46, height: 46, borderRadius: "50%", background: g.isDirect ? "#4b5563" : "#1f2937", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", flexShrink: 0, fontSize: 20 }}>
          {img ? <img src={img} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : (g.isDirect ? "👤" : "💬")}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: "#1f2937", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{titleFor(g)}</div>
          {!g.isDirect && g.description && (
            <div style={{ fontSize: 12, color: "#9ca3af", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 2 }}>{g.description}</div>
          )}
          {g.isDirect && (
            <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 2 }}>Private message</div>
          )}
        </div>
        {count > 0 && (
          <span style={{ background: "#ef4444", color: "#fff", fontSize: 12, fontWeight: 700, minWidth: 22, height: 22, borderRadius: 11, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 6px", flexShrink: 0 }}>
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>
    );
  }

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", width: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <h1 className="page-title" style={{ margin: 0 }}>StormChat</h1>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search chats"
          style={{ flex: 1, minWidth: 160, padding: "10px 14px", border: "1px solid #e5e7eb", borderRadius: 10, fontSize: 14, outline: "none" }} />
        <button onClick={openPicker}
          style={{ padding: "10px 16px", background: "#1f2937", color: "#fff", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 6 }}>
          ✏️ New message
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", color: "#9ca3af", padding: "60px 0" }}>Loading chats…</div>
      ) : visible.length === 0 ? (
        <div style={{ textAlign: "center", color: "#9ca3af", padding: "60px 20px" }}>
          <div style={{ fontSize: 46, marginBottom: 12 }}>💬</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: "#374151", marginBottom: 6 }}>No chats yet</div>
          <div style={{ fontSize: 13 }}>Start one with “New message”, or you&apos;ll see your groups here once you&apos;re added.</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {dms.length > 0 && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>Direct Messages</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{dms.map(g => <GroupRow key={g._id} g={g} />)}</div>
            </div>
          )}
          {normalGroups.length > 0 && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>Groups</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{normalGroups.map(g => <GroupRow key={g._id} g={g} />)}</div>
            </div>
          )}
        </div>
      )}

      {/* New-message user picker */}
      {pickerOpen && (
        <div onClick={() => setPickerOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 460, maxHeight: "80vh", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
            <div style={{ padding: "16px 18px", borderBottom: "1px solid #f0f0f0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#1f2937" }}>New message</div>
              <button onClick={() => setPickerOpen(false)} style={{ background: "none", border: "none", fontSize: 22, color: "#9ca3af", cursor: "pointer", lineHeight: 1 }}>×</button>
            </div>
            <div style={{ padding: "12px 18px" }}>
              <input autoFocus value={userSearch} onChange={e => setUserSearch(e.target.value)} placeholder="Search people"
                style={{ width: "100%", padding: "10px 14px", border: "1px solid #e5e7eb", borderRadius: 10, fontSize: 14, outline: "none" }} />
            </div>
            <div style={{ overflowY: "auto", padding: "0 8px 12px" }}>
              {pickable.length === 0 ? (
                <div style={{ textAlign: "center", color: "#9ca3af", padding: "30px 0", fontSize: 13 }}>No people found</div>
              ) : pickable.map(u => (
                <button key={u.id} disabled={opening} onClick={() => startDm(u)}
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", background: "none", border: "none", cursor: opening ? "wait" : "pointer", width: "100%", textAlign: "left", borderRadius: 10 }}
                  onMouseEnter={e => (e.currentTarget.style.background = "#f9fafb")}
                  onMouseLeave={e => (e.currentTarget.style.background = "none")}>
                  <div style={{ width: 40, height: 40, borderRadius: "50%", background: "#4b5563", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", flexShrink: 0, fontSize: 16 }}>
                    {u.headshotUrl ? <img src={u.headshotUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : (u.name?.[0]?.toUpperCase() || "👤")}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "#1f2937", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.name}</div>
                    <div style={{ fontSize: 12, color: "#9ca3af", textTransform: "capitalize" }}>{u.role}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
