import { useState, useEffect, useRef } from "react";
import { useAuth } from "../contexts/AuthContext";
import { GuidedTour } from "../portals/shared/guided-tour/GuidedTour";
import { STORM_CHAT_TOUR } from "../portals/shared/guided-tour/definitions/stormChat";
import { TourButton } from "../portals/shared/guided-tour/TourButton";
import { useActiveTourId } from "../portals/shared/guided-tour/tourRegistry";
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
  // Attached by the groups API for sorting — used for the row timestamp.
  lastMessageAt?: string;
};

type PickUser = { _id?: string; id: string; name: string; email: string; role: string; headshotUrl?: string };

export function StormChatViewer() {
  const { user, impersonating } = useAuth();
  const [groups, setGroups] = useState<ChatGroup[]>([]);
  const [unread, setUnread] = useState<Record<string, number>>({});
  const [selected, setSelected] = useState<ChatGroup | null>(null);
  const [loading, setLoading] = useState(true);
  const activeTourId = useActiveTourId();
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

  // Keep the list live (WhatsApp style): re-fetch every few seconds so a group
  // that just got a new message re-sorts to the top on its own, no reload.
  useEffect(() => {
    if (!user?.id) return;
    const t = setInterval(() => loadGroups(), 7000);
    return () => clearInterval(t);
  }, [user?.id]);

  async function loadGroups() {
    try {
      // Pass the (possibly impersonated) user's id. The server honors ?userId=
      // ONLY when the caller's token is an admin — so a normal user can never
      // read someone else's list, but an admin "View As" shows THAT user's own
      // groups + DMs (not the admin's).
      const res = await fetch(`/api/storm-chat/groups?mine=1&userId=${encodeURIComponent(user?.id || "")}`);
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
  // First-letters avatar fallback (e.g. "Brighton Weaver" -> "BW").
  function initials(name: string) {
    const parts = (name || "").trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "?";
    return (parts[0][0] + (parts[1]?.[0] || "")).toUpperCase();
  }
  // Compact relative time for the row (11m / 2h / Yesterday / Mon / Aug 3).
  function relTime(iso?: string) {
    if (!iso) return "";
    const t = new Date(iso).getTime();
    if (isNaN(t)) return "";
    const m = Math.floor((Date.now() - t) / 60000);
    if (m < 1) return "now";
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h`;
    const days = Math.floor(h / 24);
    if (days === 1) return "Yesterday";
    if (days < 7) return new Date(iso).toLocaleDateString(undefined, { weekday: "short" });
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
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

  // Long-press (touch) / right-click (desktop) a DM row to delete it FROM YOUR
  // LIST — the other person keeps the thread, and a new message brings it back.
  async function deleteDm(g: ChatGroup) {
    if (!g.isDirect) return;
    if (!window.confirm(`Delete this chat with ${titleFor(g)}?\n\nIt's removed from your list only; a new message will bring it back.`)) return;
    try {
      const res = await fetch(`/api/storm-chat/groups/${g._id}/hide`, { method: "POST" });
      if (!res.ok) throw new Error("failed");
      setGroups(prev => prev.filter(x => x._id !== g._id));
      if (selected?._id === g._id) setSelected(null);
    } catch {
      alert("Couldn't delete the chat. Please try again.");
    }
  }

  function GroupRow({ g }: { g: ChatGroup }) {
    const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const longPressed = useRef(false);
    const startPress = () => {
      if (!g.isDirect) return;
      longPressed.current = false;
      pressTimer.current = setTimeout(() => { longPressed.current = true; deleteDm(g); }, 550);
    };
    const cancelPress = () => { if (pressTimer.current) { clearTimeout(pressTimer.current); pressTimer.current = null; } };
    const count = unread[g._id] || 0;
    const img = imageFor(g);
    const notMember = g.isMember === false && !g.isDirect;
    const status: 'pending' | 'denied' | 'none' = requestedIds.has(g._id) ? 'pending' : (g.joinStatus || 'none');
    const isPrivate = g.visibility === 'private' && !g.isDirect;
    const time = relTime(g.lastMessageAt);
    const preview = g.isDirect ? "Private message" : (g.description || "Group chat");
    return (
      <button
        key={g._id}
        onClick={() => { if (longPressed.current) { longPressed.current = false; return; } openGroup(g); }}
        onContextMenu={g.isDirect ? (e) => { e.preventDefault(); deleteDm(g); } : undefined}
        onTouchStart={startPress}
        onTouchEnd={cancelPress}
        onTouchMove={cancelPress}
        style={{ display: "flex", alignItems: "center", gap: 14, padding: "13px 16px", background: "var(--surface-default)", border: "1px solid var(--border-default)", borderRadius: 14, cursor: "pointer", textAlign: "left", width: "100%", transition: "background 0.15s, border-color 0.15s" }}
        onMouseEnter={e => { e.currentTarget.style.background = "var(--surface-muted)"; e.currentTarget.style.borderColor = "var(--border-strong)"; }}
        onMouseLeave={e => { cancelPress(); e.currentTarget.style.background = "var(--surface-default)"; e.currentTarget.style.borderColor = "var(--border-default)"; }}
      >
        <div style={{ width: 48, height: 48, borderRadius: "50%", background: img ? "transparent" : (g.isDirect ? "linear-gradient(135deg, #e01418, #b30002)" : "var(--surface-muted)"), color: g.isDirect ? "var(--text-inverse)" : "var(--text-primary)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", flexShrink: 0, fontSize: 16, fontWeight: 700, letterSpacing: "0.02em" }}>
          {img ? <img src={img} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : initials(titleFor(g))}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{titleFor(g)}</div>
          {notMember ? (
            <div style={{ fontSize: 13, marginTop: 3, fontWeight: 500, color: status === 'denied' ? "var(--text-muted)" : status === 'pending' ? "#10b981" : "#e5484d" }}>
              {status === 'denied' ? "🚫 Rejected · no access" : status === 'pending' ? "✓ Request pending" : "🔒 Private · tap to request to join"}
            </div>
          ) : (
            <div style={{ fontSize: 13.5, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 3 }}>{preview}</div>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, flexShrink: 0 }}>
          {time && !notMember && <span style={{ fontSize: 12.5, color: "var(--text-subtle)" }}>{time}</span>}
          {notMember ? (
            <span style={{ fontSize: 11, fontWeight: 700, padding: "4px 11px", borderRadius: 999,
              ...(status === 'denied'
                ? { background: "var(--surface-subtle)", color: "var(--text-muted)", border: "1px solid var(--border-default)" }
                : status === 'pending'
                  ? { background: "rgba(16,185,129,0.14)", color: "#10b981", border: "1px solid rgba(16,185,129,0.4)" }
                  : { background: "rgba(202,0,2,0.12)", color: "#e5484d", border: "1px solid rgba(202,0,2,0.35)" }) }}>
              {status === 'denied' ? "Rejected" : status === 'pending' ? "Pending" : "Join"}
            </span>
          ) : count > 0 ? (
            <span style={{ background: "#e01418", color: "var(--text-inverse)", fontSize: 12, fontWeight: 700, minWidth: 22, height: 22, borderRadius: 11, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 6px" }}>
              {count > 99 ? "99+" : count}
            </span>
          ) : isPrivate ? (
            <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.06em", padding: "3px 9px", borderRadius: 6, border: "1px solid var(--border-strong)", color: "var(--text-muted)" }}>PRIVATE</span>
          ) : null}
        </div>
      </button>
    );
  }

  const sectionLabel = { fontFamily: '"Arial Narrow", "Roboto Condensed", "Helvetica Neue", Arial, sans-serif', fontSize: 17, fontWeight: 800, color: "var(--text-primary)", letterSpacing: "0.01em", marginBottom: 10 };

  return (
    <div style={{ maxWidth: 980, margin: 0, width: "100%", position: "relative" }}>
      {/* Faded brand watermark, like the leaderboards. */}
      <div aria-hidden style={{ position: "absolute", inset: 0, backgroundImage: "url(/ChatGPT_Image_Feb_23__2026__07_00_52_PM-removebg-preview.png)", backgroundRepeat: "no-repeat", backgroundPosition: "center 30%", backgroundSize: "min(720px, 88%)", opacity: 0.05, pointerEvents: "none", zIndex: 0 }} />

      <div style={{ position: "relative", zIndex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ fontFamily: '"Arial Narrow", "Roboto Condensed", "Helvetica Neue", Arial, sans-serif', fontSize: "clamp(28px, 3vw, 34px)", fontWeight: 900, letterSpacing: "0.01em", lineHeight: 1.05, color: "var(--text-primary)" }}>StormChat</div>
          {/* Every storm-chat page passes pageTitle="" so its layout skips
              PageHeader entirely, and PageHeader is what normally renders the
              tour's "?" control. Without this the replay button never appears
              here and the tour's last step silently vanishes. */}
          {activeTourId ? <TourButton /> : null}
        </div>
        <div style={{ fontSize: 14.5, color: "var(--text-muted)", marginTop: 4, marginBottom: 20 }}>Your groups and direct messages</div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 22, flexWrap: "wrap" }}>
          <input data-tour="sc-search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search chats"
            style={{ flex: 1, minWidth: 160, padding: "13px 18px", background: "var(--surface-default)", color: "var(--text-primary)", border: "1px solid var(--border-default)", borderRadius: 999, fontSize: 15, outline: "none" }} />
          {!impersonating && (
            <button data-tour="sc-new" onClick={openPicker}
              style={{ padding: "13px 24px", background: "linear-gradient(90deg, #b30002, #e01418)", color: "var(--text-inverse)", border: "none", borderRadius: 999, fontSize: 15, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", boxShadow: "0 4px 14px rgba(202,0,2,0.32)" }}>
              New message
            </button>
          )}
        </div>

        {loading ? (
          <div style={{ textAlign: "center", color: "var(--text-subtle)", padding: "60px 0" }}>Loading chats…</div>
        ) : visible.length === 0 ? (
          <div style={{ textAlign: "center", color: "var(--text-subtle)", padding: "60px 20px" }}>
            <div style={{ fontSize: 46, marginBottom: 12 }}>💬</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text-tertiary)", marginBottom: 6 }}>No chats yet</div>
            <div style={{ fontSize: 13 }}>Start one with “New message”, or you&apos;ll see your groups here once you&apos;re added.</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
            {dms.length > 0 && (
              <div data-tour="sc-dms">
                <div style={sectionLabel}>Direct Messages</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{dms.map(g => <GroupRow key={g._id} g={g} />)}</div>
              </div>
            )}
            {normalGroups.length > 0 && (
              <div data-tour="sc-groups">
                <div style={sectionLabel}>Groups</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{normalGroups.map(g => <GroupRow key={g._id} g={g} />)}</div>
              </div>
            )}
          </div>
        )}
      </div>
      <GuidedTour tour={STORM_CHAT_TOUR} ready={!loading} />

      {/* New-message user picker */}
      {pickerOpen && (
        <div onClick={() => setPickerOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: "var(--surface-default)", borderRadius: 16, width: "100%", maxWidth: 460, maxHeight: "80vh", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
            <div style={{ padding: "16px 18px", borderBottom: "1px solid var(--border-default)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-secondary)" }}>New message</div>
              <button onClick={() => setPickerOpen(false)} style={{ background: "none", border: "none", fontSize: 22, color: "var(--text-subtle)", cursor: "pointer", lineHeight: 1 }}>×</button>
            </div>
            <div style={{ padding: "12px 18px" }}>
              <input autoFocus value={userSearch} onChange={e => setUserSearch(e.target.value)} placeholder="Search people"
                style={{ width: "100%", padding: "10px 14px", border: "1px solid var(--border-default)", borderRadius: 10, fontSize: 14, outline: "none" }} />
            </div>
            <div style={{ overflowY: "auto", padding: "0 8px 12px" }}>
              {pickable.length === 0 ? (
                <div style={{ textAlign: "center", color: "var(--text-subtle)", padding: "30px 0", fontSize: 13 }}>No people found</div>
              ) : pickable.map(u => (
                <button key={u.id} disabled={opening} onClick={() => startDm(u)}
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", background: "none", border: "none", cursor: opening ? "wait" : "pointer", width: "100%", textAlign: "left", borderRadius: 10 }}
                  onMouseEnter={e => (e.currentTarget.style.background = "var(--surface-muted)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "none")}>
                  <div style={{ width: 40, height: 40, borderRadius: "50%", background: "#4b5563", color: "var(--text-inverse)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", flexShrink: 0, fontSize: 16 }}>
                    {u.headshotUrl ? <img src={u.headshotUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : (u.name?.[0]?.toUpperCase() || "👤")}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.name}</div>
                    <div style={{ fontSize: 12, color: "var(--text-subtle)", textTransform: "capitalize" }}>{u.role}</div>
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
            style={{ background: "var(--surface-default)", borderRadius: 16, width: "100%", maxWidth: 400, padding: 24, boxShadow: "0 20px 60px rgba(0,0,0,0.3)", textAlign: "center" }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>🔒</div>
            <div style={{ fontSize: 17, fontWeight: 700, color: "var(--text-secondary)", marginBottom: 6 }}>Join “{joinTarget.name}”?</div>
            <div style={{ fontSize: 13.5, color: "var(--text-muted)", marginBottom: 20 }}>
              This is a private group. Your request will be sent to the group admin — you’ll be added once it’s approved.
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setJoinTarget(null)} disabled={joinSending}
                style={{ flex: 1, padding: "10px 16px", background: "var(--surface-subtle)", border: "none", borderRadius: 10, cursor: "pointer", fontWeight: 600, color: "var(--text-tertiary)" }}>
                Cancel
              </button>
              <button onClick={sendJoinRequest} disabled={joinSending}
                style={{ flex: 1, padding: "10px 16px", background: "#CB0002", color: "var(--text-inverse)", border: "none", borderRadius: 10, cursor: joinSending ? "not-allowed" : "pointer", fontWeight: 600 }}>
                {joinSending ? "Sending…" : "Request to Join"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
