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
  visibility?: 'public' | 'private';
  // Set by the groups API (?mine=1): false = the group is visible to the user
  // but they are NOT a member yet (a private group they can request to join).
  isMember?: boolean;
  // The caller's own request state for a non-member private group.
  joinStatus?: 'pending' | 'denied' | 'none';
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
  // Request-to-join (private groups the user isn't a member of yet)
  const [joinTarget, setJoinTarget] = useState<ChatGroup | null>(null);
  const [joinSending, setJoinSending] = useState(false);
  const [requestedIds, setRequestedIds] = useState<Set<string>>(new Set());

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
    // A private group the user isn't in yet → handle by request state.
    if (g.isMember === false && !g.isDirect) {
      const status = requestedIds.has(g._id) ? 'pending' : (g.joinStatus || 'none');
      if (status === 'denied') {
        alert("Rejected by admin — you can't access this group.");
      } else if (status === 'pending') {
        alert('Your request is pending the group admin’s approval.');
      } else {
        setJoinTarget(g);
      }
      return;
    }
    setSelected(g);
    setUnread(prev => ({ ...prev, [g._id]: 0 }));
    try {
      await fetch("/api/storm-chat/mark-read", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId: g._id })
      });
    } catch { /* ignore */ }
  }

  async function sendJoinRequest() {
    if (!joinTarget || joinSending) return;
    setJoinSending(true);
    try {
      const res = await fetch("/api/storm-chat/join-requests", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId: joinTarget._id }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        if (data.alreadyMember) {
          // Admin already added them — just open it.
          setJoinTarget(null);
          loadGroups();
        } else {
          setRequestedIds(prev => new Set(prev).add(joinTarget._id));
          setJoinTarget(null);
        }
      } else {
        // 403 with error 'denied' = the admin already rejected them.
        alert(data.message || data.error || "Couldn't send the request. Please try again.");
        setJoinTarget(null);
      }
    } catch {
      alert("Couldn't send the request. Please try again.");
    } finally {
      setJoinSending(false);
    }
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
  const visible = (q ? groups.filter(g => (titleFor(g) || '').toLowerCase().includes(q)) : groups);
  const dms = visible.filter(g => g.isDirect);
  const normalGroups = visible.filter(g => !g.isDirect);

  const uq = userSearch.trim().toLowerCase();
  const pickable = users
    .filter(u => u.id !== user?.id)
    .filter(u => !uq || (u.name || '').toLowerCase().includes(uq) || (u.email || '').toLowerCase().includes(uq));

  function GroupRow({ g }: { g: ChatGroup }) {
    const count = unread[g._id] || 0;
    const img = imageFor(g);
    const notMember = g.isMember === false && !g.isDirect;
    const status: 'pending' | 'denied' | 'none' = requestedIds.has(g._id) ? 'pending' : (g.joinStatus || 'none');
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
          {notMember && (
            <div style={{ fontSize: 12, marginTop: 2, fontWeight: 500, color: status === 'denied' ? "#6b7280" : status === 'pending' ? "#059669" : "#dc2626" }}>
              {status === 'denied' ? "🚫 Rejected · no access" : status === 'pending' ? "✓ Request pending" : "🔒 Private · tap to request to join"}
            </div>
          )}
        </div>
        {notMember ? (
          <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 999,
            ...(status === 'denied'
              ? { background: "#f3f4f6", color: "#6b7280", border: "1px solid #e5e7eb" }
              : status === 'pending'
                ? { background: "#ecfdf5", color: "#059669", border: "1px solid #a7f3d0" }
                : { background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca" }) }}>
            {status === 'denied' ? "Rejected" : status === 'pending' ? "Pending" : "Join"}
          </span>
        ) : count > 0 && (
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

      {/* Request-to-join popup for a private group */}
      {joinTarget && (
        <div onClick={() => setJoinTarget(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 320, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 400, padding: 24, boxShadow: "0 20px 60px rgba(0,0,0,0.3)", textAlign: "center" }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>🔒</div>
            <div style={{ fontSize: 17, fontWeight: 700, color: "#1f2937", marginBottom: 6 }}>Join “{joinTarget.name}”?</div>
            <div style={{ fontSize: 13.5, color: "#6b7280", marginBottom: 20 }}>
              This is a private group. Your request will be sent to the group admin — you’ll be added once it’s approved.
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setJoinTarget(null)} disabled={joinSending}
                style={{ flex: 1, padding: "10px 16px", background: "#f3f4f6", border: "none", borderRadius: 10, cursor: "pointer", fontWeight: 600, color: "#374151" }}>
                Cancel
              </button>
              <button onClick={sendJoinRequest} disabled={joinSending}
                style={{ flex: 1, padding: "10px 16px", background: "#CB0002", color: "#fff", border: "none", borderRadius: 10, cursor: joinSending ? "not-allowed" : "pointer", fontWeight: 600 }}>
                {joinSending ? "Sending…" : "Request to Join"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
