import { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { StormChatRoom } from "../portals/admin/StormChatRoom";

// User-facing StormChat for sales/manager web panels: lists the groups the
// current user belongs to (server-filtered with ?mine=1) and opens the shared
// StormChatRoom to chat. Group creation/management stays in the admin panel.
type ChatGroup = {
  _id: string;
  name: string;
  description: string;
  imageUrl: string;
  members: string[];
  admins: string[];
  onlyAdminCanChat: boolean;
  parentGroupId?: string;
  updatedAt?: string;
  createdAt?: string;
};

export function StormChatViewer() {
  const { user } = useAuth();
  const [groups, setGroups] = useState<ChatGroup[]>([]);
  const [unread, setUnread] = useState<Record<string, number>>({});
  const [selected, setSelected] = useState<ChatGroup | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => { if (user?.id) loadGroups(); }, [user?.id]);

  // Poll unread counts while the list is showing, refreshing when groups change.
  useEffect(() => {
    if (!groups.length) return;
    loadUnread(groups);
    const t = setInterval(() => loadUnread(groups), 5000);
    return () => clearInterval(t);
  }, [groups]);

  async function loadGroups() {
    try {
      const res = await fetch("/api/storm-chat/groups?mine=1");
      if (res.ok) {
        const data: ChatGroup[] = await res.json();
        setGroups(data);
      }
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

  if (selected) {
    // The list is server-filtered to the user's own groups, so they ARE a member.
    return <StormChatRoom group={selected} isMember onBack={() => { setSelected(null); loadUnread(groups); }} />;
  }

  const q = search.trim().toLowerCase();
  const visible = q
    ? groups.filter(g => g.name.toLowerCase().includes(q))
    : groups;

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", width: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <h1 className="page-title" style={{ margin: 0 }}>StormChat</h1>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search chats"
          style={{ flex: 1, minWidth: 180, padding: "10px 14px", border: "1px solid #e5e7eb", borderRadius: 10, fontSize: 14, outline: "none" }}
        />
      </div>

      {loading ? (
        <div style={{ textAlign: "center", color: "#9ca3af", padding: "60px 0" }}>Loading chats…</div>
      ) : visible.length === 0 ? (
        <div style={{ textAlign: "center", color: "#9ca3af", padding: "60px 20px" }}>
          <div style={{ fontSize: 46, marginBottom: 12 }}>💬</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: "#374151", marginBottom: 6 }}>No chats yet</div>
          <div style={{ fontSize: 13 }}>You&apos;ll see your StormChat groups here once you&apos;re added to one.</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {visible.map(g => {
            const count = unread[g._id] || 0;
            return (
              <button
                key={g._id}
                onClick={() => openGroup(g)}
                style={{
                  display: "flex", alignItems: "center", gap: 14, padding: "12px 14px",
                  background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12,
                  cursor: "pointer", textAlign: "left", width: "100%", transition: "background 0.15s"
                }}
                onMouseEnter={e => (e.currentTarget.style.background = "#f9fafb")}
                onMouseLeave={e => (e.currentTarget.style.background = "#fff")}
              >
                <div style={{ width: 46, height: 46, borderRadius: "50%", background: "#1f2937", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", flexShrink: 0, fontSize: 20 }}>
                  {g.imageUrl
                    ? <img src={g.imageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    : "💬"}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 600, color: "#1f2937", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.name}</div>
                  {g.description && (
                    <div style={{ fontSize: 12, color: "#9ca3af", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 2 }}>{g.description}</div>
                  )}
                </div>
                {count > 0 && (
                  <span style={{ background: "#ef4444", color: "#fff", fontSize: 12, fontWeight: 700, minWidth: 22, height: 22, borderRadius: 11, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 6px", flexShrink: 0 }}>
                    {count > 99 ? "99+" : count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
