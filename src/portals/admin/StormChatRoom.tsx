import { useState, useEffect, useRef, useLayoutEffect } from "react";
import { appConfirm } from "../../lib/appDialogs";
import { useAuth } from "../../contexts/AuthContext";
import { enterSendsMessage } from "../../lib/stormchat/enterKey";
import { StormChatGroupInfo, type ChatRights } from "../../components/StormChatGroupInfo";
import { mergeNewestPage, prependOlderPage } from "../../lib/stormchat/messagePages";
import { safeHref } from "../../lib/stormchat/compose";
import { canEditMessage, DELETED_TEXT } from "../../lib/stormchat/messageChanges";
import { muteUntilLabel, type MuteChoice } from "../../lib/stormchat/mute";
import { ALBUM_MAX, VOICE_MAX_SEC, formatDuration, mapsUrl, pollEnded } from "../../lib/stormchat/richMessages";
import { StormChatGallery } from "../../components/StormChatGallery";

type ChatMessage = {
  _id: string;
  groupId: string;
  senderId: string;
  senderName: string;
  senderHeadshotUrl?: string;
  senderRole: string;
  message: string;
  messageType: 'text' | 'image' | 'video' | 'file' | 'poll' | 'system';
  mediaUrl?: string;
  poll?: {
    question: string;
    options: { text: string; votes: string[]; voterNames?: string[] }[];
    allowMultiple: boolean;
    anonymous?: boolean;
    endsAt?: string;
    voterCount?: number;
  };
  replyTo?: string;
  replyToMessage?: string;
  replyToSender?: string;
  reactions?: { emoji: string; userId: string; userName: string }[];
  pinned?: boolean;
  pinnedByName?: string;
  pinnedAt?: string;
  editedAt?: string;
  deletedAt?: string;
  voice?: { durationSec: number };
  location?: { lat: number; lng: number };
  albumId?: string;
  createdAt: Date;
};

type SearchHit = { _id: string; senderName: string; snippet: string; messageType: string; createdAt: string };

type ChatGroup = {
  _id: string;
  name: string;
  description: string;
  imageUrl: string;
  members: string[];
  admins: string[];
  onlyAdminCanChat: boolean;
  isDirect?: boolean;
};

type Props = {
  group: ChatGroup;
  onBack: () => void;
  // Optional membership hint from the caller. The web auth user carries only the
  // app id (not the Mongo _id that group.members stores), so a sales/manager
  // member can't be matched client-side; the sales/manager StormChat list is
  // already server-filtered to the user's own groups, so it passes isMember.
  isMember?: boolean;
  // Header label override (a DM has no name — show the other person's name).
  title?: string;
  // When provided (in a group), each other member's message shows a "Message
  // privately" action that starts a 1-on-1 DM with that sender.
  onMessagePrivately?: (userId: string, name: string) => void;
  // Open the chat at this message (a search result from the chat list).
  jumpToMessageId?: string;
};

// Common emojis for the composer picker (unicode — no dependency needed).
// Shared square style so the composer's emoji / GIF / poll / attach buttons are
// all identical 40×40 boxes with centered content.
const COMPOSER_BTN: React.CSSProperties = {
  width: 40,
  height: 40,
  padding: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flex: '0 0 auto',
  backgroundColor: 'var(--surface-subtle)',
  border: 'none',
  borderRadius: 8,
  cursor: 'pointer',
  fontSize: 18,
  lineHeight: 1,
};

// The red of your own message bubbles (one name, so new bubbles add no raw colours).
const MY_BUBBLE = '#DC2626';

// When a new poll closes (GroupMe-style end date; up to 30 days).
const POLL_ENDS: { key: string; label: string; ms: number }[] = [
  { key: 'none', label: 'No end time', ms: 0 },
  { key: '1h', label: 'In 1 hour', ms: 3600e3 },
  { key: '4h', label: 'In 4 hours', ms: 4 * 3600e3 },
  { key: '1d', label: 'In 1 day', ms: 24 * 3600e3 },
  { key: '3d', label: 'In 3 days', ms: 3 * 24 * 3600e3 },
  { key: '1w', label: 'In 1 week', ms: 7 * 24 * 3600e3 },
];

// Recorder format: MP4/AAC where the browser can (plays everywhere, iPhones
// included), else WebM/Ogg.
function pickAudioFormat(): { mime: string; ext: string } {
  const options: [string, string][] = [['audio/mp4', 'm4a'], ['audio/webm;codecs=opus', 'webm'], ['audio/webm', 'webm'], ['audio/ogg;codecs=opus', 'ogg']];
  for (const [mime, ext] of options) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported?.(mime)) return { mime, ext };
  }
  return { mime: '', ext: 'webm' };
}

// Small icon buttons in the chat header (search, gallery, mute, info).
const HEADER_BTN: React.CSSProperties = {
  background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', padding: 4, color: 'var(--text-primary)', flexShrink: 0,
};
const MENU_ITEM: React.CSSProperties = {
  display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', background: 'none', border: 'none',
  cursor: 'pointer', fontSize: 14, color: 'var(--text-primary)',
};
// How long to mute (GroupMe-style; src/lib/stormchat/mute.ts).
const MUTE_OPTIONS: { key: MuteChoice; label: string }[] = [
  { key: '1h', label: 'Mute for 1 hour' },
  { key: '8h', label: 'Mute for 8 hours' },
  { key: '1d', label: 'Mute for 1 day' },
  { key: 'forever', label: 'Mute until I turn it back on' },
];

// Quick-reaction row shown on a message (matches the app's reaction tray).
const REACTION_EMOJIS = ['👍', '❤️', '😂', '🎉', '🔥', '😢', '👎'];

const CHAT_EMOJIS = ["😀","😃","😄","😁","😆","😅","😂","🤣","😊","😇","🙂","🙃","😉","😌","😍","🥰","😘","😋","😛","😜","🤪","🤨","🧐","🤓","😎","🥳","😏","😒","😔","😟","🙁","😣","😖","😫","😩","🥺","😢","😭","😤","😠","😡","🤬","🤯","😳","🥵","🥶","😱","😨","😰","😥","🤗","🤔","🤭","🤫","🤥","😶","😐","😑","🙄","😮","😲","🥱","😴","🤤","🤢","🤮","🤧","😷","🤒","🤑","🤠","😈","👍","👎","👌","✌️","🤞","🤟","🤘","🤙","👈","👉","👆","👇","👋","🙌","🤝","🙏","💪","🔥","⭐","🌟","✨","💯","✅","❌","❤️","🧡","💛","💚","💙","💜","🖤","💔","🎉","🎊","🚀","💰","📈","🏆","🥇","💡","👀","🎯"];

// Small round avatar shown beside an incoming message: the sender's uploaded
// photo (headshotUrl) when set, otherwise their initials.
function SenderAvatar({ url, name }: { url?: string; name: string }) {
  const initials =
    (name || '?').trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase() || '?';
  return (
    <div
      style={{
        width: 28, height: 28, borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
        background: 'var(--gray-700) /* no semantic: gray-700 as surface */', color: 'var(--text-inverse)', display: 'flex', alignItems: 'center',
        justifyContent: 'center', fontSize: 11, fontWeight: 700, marginBottom: 2,
      }}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        initials
      )}
    </div>
  );
}

export function StormChatRoom({ group: groupProp, onBack, isMember, title, onMessagePrivately, jumpToMessageId }: Props) {
  const { user } = useAuth();
  // The web session knows the app id ("user-123"), which is what senderId holds.
  const myAppId = user?.id || '';
  // Local copy so Group info edits (rename, admin-only...) show at once.
  const [group, setGroup] = useState<ChatGroup>(groupProp);
  useEffect(() => { setGroup(groupProp); }, [groupProp]);
  // What the server says this viewer may do here (post, pin, moderate, manage).
  // The web used to guess from ids it doesn't have, which locked C-level and
  // team-lead group admins out of groups the server let them post in.
  // While a chat is open, the phone layout hides the app's menu button so it
  // can't cover the room's back arrow (src/styles.css, storm-chat-room-open).
  useEffect(() => {
    document.body.classList.add('storm-chat-room-open');
    return () => document.body.classList.remove('storm-chat-room-open');
  }, []);
  const [rights, setRights] = useState<ChatRights | null>(null);
  // Removed from the group, or it was deleted, while it was open (readiness
  // test item 15): stop refreshing and show one calm notice instead of an
  // error popping up every 3 seconds.
  const [gone, setGone] = useState<null | 'removed' | 'deleted'>(null);
  const goneRef = useRef<null | 'removed' | 'deleted'>(null);
  // Muted by this viewer: no alerts for ordinary messages, mentions still come.
  // A mute can end by itself (1 hour / 8 hours / 1 day, src/lib/stormchat/mute.ts).
  const [muted, setMuted] = useState(false);
  const [mutedUntil, setMutedUntil] = useState<string | null>(null);
  const [muteMenuOpen, setMuteMenuOpen] = useState(false);
  const mutedNow = muted && (!mutedUntil || Date.parse(mutedUntil) > Date.now());
  // Active members only, for "X of N voted" (deleted / suspended don't count).
  const [activeMembers, setActiveMembers] = useState<number | null>(null);
  async function changeMute(choice: MuteChoice | null) {
    setMuteMenuOpen(false);
    const res = await fetch(`/api/storm-chat/groups/${groupProp._id}/mute`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(choice ? { muted: true, for: choice } : { muted: false }),
    }).catch(() => null);
    if (!res || !res.ok) { alert("Couldn't change notifications. Please try again."); return; }
    const data = await res.json().catch(() => ({}));
    setMuted(!!choice);
    setMutedUntil(choice ? (data.mutedUntil ?? null) : null);
  }
  // Read receipts (GroupMe-style): whatever this open chat has shown on a
  // visible screen counts as read, including messages that arrive while you're
  // in it. Sent "up to" the newest message shown, so nothing unseen is marked
  // read. Every way of opening a chat goes through here.
  const markedUpTo = useRef<string>('');
  const markRead = () => {
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
    const newest = messagesRef.current[messagesRef.current.length - 1];
    const upTo = newest ? new Date(newest.createdAt).toISOString() : '';
    if (!upTo || upTo === markedUpTo.current || !(rightsRef.current?.canRead ?? true)) return;
    markedUpTo.current = upTo;
    fetch('/api/storm-chat/mark-read', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupId: groupProp._id, upTo }),
    }).catch(() => { markedUpTo.current = ''; });
  };
  const messagesRef = useRef<ChatMessage[]>([]);
  const rightsRef = useRef<ChatRights | null>(null);
  useEffect(() => { rightsRef.current = rights; }, [rights]);
  useEffect(() => {
    const onVisible = () => markRead();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupProp._id]);
  const [showInfo, setShowInfo] = useState(false);
  useEffect(() => {
    let alive = true;
    fetch(`/api/storm-chat/groups/${groupProp._id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((g) => { if (alive && g?.myRights) { setRights(g.myRights); setMuted(!!g.muted); setMutedUntil(g.mutedUntil || null); if (typeof g.activeMemberCount === 'number') setActiveMembers(g.activeMemberCount); } })
      .catch(() => {});
    return () => { alive = false; };
  }, [groupProp._id]);
  const isDirect = !!group.isDirect;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  // Every pinned message in the chat (the banner), loaded on its own.
  const [pinnedList, setPinnedList] = useState<ChatMessage[]>([]);
  // New messages on screen (first load, a poll, or your own send): mark read.
  useEffect(() => {
    messagesRef.current = messages;
    markRead();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, rights]);
  const [newMessage, setNewMessage] = useState("");
  const [showEmoji, setShowEmoji] = useState(false);
  // GIPHY GIF / sticker picker
  const [giphyOpen, setGiphyOpen] = useState(false);
  const [giphyMode, setGiphyMode] = useState<'gifs' | 'stickers'>('gifs');
  const [giphyQuery, setGiphyQuery] = useState('');
  const [giphyItems, setGiphyItems] = useState<{ id: string; url: string; preview: string }[]>([]);
  const [giphyLoading, setGiphyLoading] = useState(false);
  // Poll composer
  const [showPoll, setShowPoll] = useState(false);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState<string[]>(["", ""]);
  const [pollMultiple, setPollMultiple] = useState(false);
  const [pollEnd, setPollEnd] = useState('none');
  const [pollAnonymous, setPollAnonymous] = useState(false);
  // Who voted for what (a poll's "See votes").
  const [votersFor, setVotersFor] = useState<ChatMessage | null>(null);
  // 📎 menu: photos (up to 10 at once), a file, or your location.
  const [attachOpen, setAttachOpen] = useState(false);
  const photosInputRef = useRef<HTMLInputElement>(null);
  // Voice messages (up to 5 minutes): recording state and timer.
  const [canRecord, setCanRecord] = useState(false);
  const [recState, setRecState] = useState<'idle' | 'recording' | 'sending'>('idle');
  const [recSeconds, setRecSeconds] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recChunks = useRef<Blob[]>([]);
  const recStartedAt = useRef(0);
  const recTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const recCancelled = useRef(false);
  useEffect(() => {
    setCanRecord(typeof window !== 'undefined' && 'MediaRecorder' in window && !!navigator.mediaDevices?.getUserMedia);
    return () => { if (recTimer.current) clearInterval(recTimer.current); recorderRef.current?.stream.getTracks().forEach((t) => t.stop()); };
  }, []);
  // @mention autocomplete: the group's members and the current "@…" query.
  const [members, setMembers] = useState<{ _id: string; name: string; headshotUrl?: string }[]>([]);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const gifInputRef = useRef<HTMLInputElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  // Touch screens have no Shift key, so there Enter is always a new line and
  // only the Send button sends (see src/lib/stormchat/enterKey.ts).
  const [touchScreen, setTouchScreen] = useState(false);
  useEffect(() => {
    setTouchScreen(window.matchMedia('(pointer: coarse)').matches);
  }, []);
  // Grow the box with each new line (up to its maxHeight, then it scrolls),
  // and shrink it back after sending.
  useEffect(() => {
    const el = composerRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [newMessage]);
  const [blinkingMessageId, setBlinkingMessageId] = useState<string | null>(null);
  const messageRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});
  const [hoveredMessageId, setHoveredMessageId] = useState<string | null>(null);
  const [menuMessageId, setMenuMessageId] = useState<string | null>(null);
  // WhatsApp-style reaction bar: which message's emoji picker is open, and
  // whether the full emoji grid ("+") is expanded within it.
  const [reactionPickerId, setReactionPickerId] = useState<string | null>(null);
  const [reactionPickerExpanded, setReactionPickerExpanded] = useState(false);
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  // Editing one of your own messages (15 minutes, src/lib/stormchat/messageChanges.ts):
  // the text goes back into the box and Send saves the change.
  const [editingMsg, setEditingMsg] = useState<ChatMessage | null>(null);
  // Who reacted to a message (opened from its menu).
  const [reactionsFor, setReactionsFor] = useState<ChatMessage | null>(null);
  // Search inside this chat, and the Photos & files gallery.
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQ, setSearchQ] = useState('');
  const [searchHits, setSearchHits] = useState<SearchHit[] | null>(null);
  const [showGallery, setShowGallery] = useState(false);
  useEffect(() => {
    const q = searchQ.trim();
    if (!searchOpen || q.length < 2) { setSearchHits(null); return; }
    let alive = true;
    const t = setTimeout(async () => {
      const res = await fetch(`/api/storm-chat/search?q=${encodeURIComponent(q)}&groupId=${groupProp._id}`).catch(() => null);
      const hits = res && res.ok ? await res.json().catch(() => []) : [];
      if (alive) setSearchHits(Array.isArray(hits) ? hits : []);
    }, 300);
    return () => { alive = false; clearTimeout(t); };
  }, [searchQ, searchOpen, groupProp._id]);

  function startEdit(msg: ChatMessage) {
    setReplyingTo(null);
    setEditingMsg(msg);
    setNewMessage(msg.message);
    setMenuMessageId(null);
    setTimeout(() => composerRef.current?.focus(), 0);
  }
  function cancelEdit() {
    setEditingMsg(null);
    setNewMessage('');
  }
  async function saveEdit() {
    const target = editingMsg;
    if (!target || sending) return;
    if (newMessage === target.message) { cancelEdit(); return; }
    setSending(true);
    try {
      const res = await fetch(`/api/storm-chat/messages/${group._id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'edit', messageId: target._id, message: newMessage }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { alert(data.error || "Couldn't edit the message"); return; }
      setMessages(prev => prev.map(m => (m._id === target._id ? { ...m, message: data.message, editedAt: data.editedAt } : m)));
      cancelEdit();
    } catch {
      alert("Couldn't edit the message");
    } finally {
      setSending(false);
    }
  }
  // Fullscreen image viewer (with a Download button), like the app's viewer.
  const [viewerImage, setViewerImage] = useState<string | null>(null);
  // Forward a message to other users (each becomes a DM). Holds the message being
  // forwarded, the (lazily loaded) directory, the picked user ids, and search.
  const [forwardMsg, setForwardMsg] = useState<ChatMessage | null>(null);
  const [forwardUsers, setForwardUsers] = useState<{ id: string; name: string; role?: string; headshotUrl?: string }[]>([]);
  const [forwardSelected, setForwardSelected] = useState<Set<string>>(new Set());
  const [forwardSearch, setForwardSearch] = useState("");
  const [forwardSending, setForwardSending] = useState(false);

  // Save a photo/video to the user's device. Fetch the blob so it downloads
  // (with a filename) instead of just navigating to it.
  async function downloadMedia(url: string) {
    const name = (url.split('/').pop() || 'download').split('?')[0];
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objUrl;
      a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(objUrl);
    } catch {
      window.open(url, '_blank'); // fallback
    }
  }

  // Delete a message (text/photo/video). Server allows the sender always, and a
  // system admin in a group. Removes it from the list on success.
  async function deleteMessage(messageId: string) {
    // Photos sent together are deleted together.
    const target = messages.find((m) => m._id === messageId);
    const together = target?.albumId ? messages.filter((m) => m.albumId === target.albumId && !m.deletedAt) : [];
    if (together.length > 1) {
      if (!await appConfirm(`Delete these ${together.length} photos?`)) return;
      for (const m of together) await removeOne(m._id);
      return;
    }
    if (!await appConfirm('Delete this message?')) return;
    await removeOne(messageId);
  }
  async function removeOne(messageId: string) {
    try {
      const res = await fetch(`/api/storm-chat/messages/${group._id}`, {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId }),
      });
      if (res.ok) {
        // It stays in the chat as "This message was deleted" (GroupMe-style).
        const data = await res.json().catch(() => ({}));
        setMessages(prev => prev.map(m => (m._id === messageId
          ? (data.message || { ...m, message: DELETED_TEXT, messageType: 'text', mediaUrl: '', poll: undefined, reactions: [], pinned: false, deletedAt: new Date().toISOString() })
          : m)));
        if (editingMsg?._id === messageId) cancelEdit();
        loadPinned();
      }
      else alert('Failed to delete message');
    } catch {
      alert('Failed to delete message');
    }
  }

  // Check if user can send messages
  const isGroupMember = isMember || group.members.includes(user?._id || user?.id || '');
  const isAdmin = user?.role === 'admin';
  const isGroupAdmin = group.admins.includes(user?._id || user?.id || '');

  // Server rights win once loaded; the old guess only covers the first moment.
  const canSendMessage = rights ? rights.canSend : (isAdmin || isGroupAdmin || (group.onlyAdminCanChat ? false : isGroupMember));
  // Anyone who can SEND a message here can also pin one (DMs: either member).
  const canPin = rights ? rights.canPin : (isDirect ? isGroupMember : canSendMessage);
  // Delete other people's messages: this group's admins (never in a DM).
  const canModerate = rights ? rights.canModerate : (isAdmin && !isDirect);
  // The banner lists every pinned message in the chat, newest pin first,
  // however old (loaded separately: the screen only holds recent pages).
  const pinnedMessages = pinnedList;

  // Pin or unpin a message; updates the list in place on success.
  async function togglePin(msg: ChatMessage) {
    try {
      const res = await fetch(`/api/storm-chat/messages/${group._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: msg.pinned ? 'unpin' : 'pin', messageId: msg._id }),
      });
      if (res.ok) {
        const updated = await res.json();
        setMessages((prev) => prev.map((m) => (m._id === msg._id
          ? { ...m, pinned: updated.pinned, pinnedByName: updated.pinnedByName, pinnedAt: updated.pinnedAt }
          : m)));
        loadPinned();
      } else {
        alert('Failed to pin message');
      }
    } catch {
      alert('Failed to pin message');
    }
  }

  useEffect(() => {
    fetchMessages();
    loadPinned();
    let ticks = 0;
    const interval = setInterval(() => {
      if (goneRef.current) { clearInterval(interval); return; }
      fetchMessages();
      if (++ticks % 5 === 0) loadPinned(); // pins change rarely: every 15s
    }, 3000); // Poll every 3 seconds
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group._id]);

  // Load the group's members for @mention autocomplete (not needed in a DM).
  useEffect(() => {
    if (isDirect) { setMembers([]); return; }
    const ids = group.members.join(',');
    if (!ids) return;
    fetch(`/api/users/by-mongo-ids?ids=${ids}`)
      .then(r => r.ok ? r.json() : [])
      .then((list) => setMembers(Array.isArray(list) ? list : []))
      .catch(() => {});
  }, [group._id]);

  // Replace the "@…" the user is typing (at the end of the box) with @Name.
  function insertMention(name: string) {
    setNewMessage(prev => prev.replace(/@([^\s@]*)$/, `@${name} `));
    setMentionQuery(null);
  }

  useEffect(() => {
    if (shouldAutoScroll) {
      scrollToBottom();
    }
  }, [messages, shouldAutoScroll]);

  function scrollToBottom() {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }

  async function scrollToMessage(messageId: string) {
    // Stay where we jump to: new messages arriving must not pull the view
    // back down to the bottom.
    setShouldAutoScroll(false);
    // A quote, search result or gallery item can point at a message older
    // than what's loaded: load earlier pages until it's there (up to about
    // 10,000 messages back).
    if (!messageRefs.current[messageId]) {
      const found = await loadOlderUntil(messageId);
      if (!found) { alert('That message is too far back to jump to.'); return; }
      // Wait until the loaded pages are drawn and the message exists on screen.
      for (let i = 0; i < 40 && !messageRefs.current[messageId]; i++) {
        await new Promise((r) => setTimeout(r, 50));
      }
    }
    const messageElement = messageRefs.current[messageId];
    if (messageElement) {
      holdScrollUntil.current = Date.now() + 1500;
      setShouldAutoScroll(false);
      messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      
      // Start blinking
      setBlinkingMessageId(messageId);
      
      // Stop blinking after 1 second (2 blinks)
      setTimeout(() => {
        setBlinkingMessageId(null);
      }, 1000);
    }
  }

  // While a jump to a message is animating, its first scroll events still
  // read "at the bottom"; letting them switch auto-scroll back on snapped the
  // view straight back down (a search result opened at the bottom).
  const holdScrollUntil = useRef(0);
  function handleScroll() {
    if (messagesContainerRef.current) {
      if (Date.now() < holdScrollUntil.current) return;
      const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current;
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
      setShouldAutoScroll(isAtBottom);
      // Near the top: load the previous page (GroupMe-style history).
      if (scrollTop < 80) loadOlder();
    }
  }

  // Message pages (readiness test item 12): the chat opens with the newest
  // PAGE messages and refreshes only that page every few seconds; scrolling up
  // loads OLDER_PAGE more at a time. Before, only the newest 500 ever loaded.
  const PAGE = 100;
  const OLDER_PAGE = 50;
  // Bigger pages when jumping far back to one message (search, gallery, quotes).
  const JUMP_PAGE = 500;
  const [hasOlder, setHasOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const loadingOlderRef = useRef(false);
  const firstPageLoaded = useRef(false);
  // Opening a chat lands on the newest message; loading earlier pages is only
  // allowed after that, or the brief moment the list starts at the top would
  // trigger it (and stop the chat from opening at the bottom).
  const olderEnabled = useRef(false);
  // Keep the reader's place when older messages are added above.
  const keepScroll = useRef<{ height: number; top: number } | null>(null);
  useLayoutEffect(() => {
    const el = messagesContainerRef.current;
    if (el && keepScroll.current) {
      el.scrollTop = el.scrollHeight - keepScroll.current.height + keepScroll.current.top;
      keepScroll.current = null;
    }
  }, [messages]);

  async function fetchOlder(beforeId: string, limit: number): Promise<ChatMessage[] | null> {
    const res = await fetch(`/api/storm-chat/messages/${group._id}?beforeId=${beforeId}&limit=${limit}`);
    return res.ok ? res.json() : null;
  }

  async function loadOlder() {
    const oldest = messagesRef.current[0];
    if (!olderEnabled.current || !hasOlder || loadingOlderRef.current || !oldest) return;
    loadingOlderRef.current = true;
    setLoadingOlder(true);
    try {
      const older = await fetchOlder(oldest._id, OLDER_PAGE);
      if (!older) return;
      setHasOlder(older.length === OLDER_PAGE);
      if (older.length) {
        const el = messagesContainerRef.current;
        if (el) keepScroll.current = { height: el.scrollHeight, top: el.scrollTop };
        setMessages((prev) => prependOlderPage(prev, older));
      }
    } finally {
      loadingOlderRef.current = false;
      setLoadingOlder(false);
    }
  }

  // Load earlier pages until a given message is on screen (reply jumps).
  async function loadOlderUntil(messageId: string): Promise<boolean> {
    let oldestId = messagesRef.current[0]?._id;
    let more = hasOlder;
    for (let i = 0; i < 20 && more && oldestId; i++) {
      const older = await fetchOlder(oldestId, JUMP_PAGE);
      if (!older || older.length === 0) { more = false; break; }
      more = older.length === JUMP_PAGE;
      setMessages((prev) => prependOlderPage(prev, older));
      oldestId = older[0]._id;
      if (older.some((m) => m._id === messageId)) { setHasOlder(more); return true; }
    }
    setHasOlder(more);
    return false;
  }

  async function loadPinned() {
    try {
      const res = await fetch(`/api/storm-chat/messages/${group._id}?pinned=1`);
      if (res.ok) setPinnedList(await res.json());
    } catch { /* keep the last banner */ }
  }

  async function fetchMessages() {
    try {
      const response = await fetch(`/api/storm-chat/messages/${group._id}?limit=${PAGE}`);
      if (response.ok) {
        const data: ChatMessage[] = await response.json();
        setMessages((prev) => mergeNewestPage(prev, data, PAGE));
        if (!firstPageLoaded.current) {
          firstPageLoaded.current = true;
          setHasOlder(data.length === PAGE);
          // Jump (not smooth-scroll) to the newest message, then allow
          // scrolling up to load history.
          setTimeout(() => {
            messagesEndRef.current?.scrollIntoView({ block: 'end' });
            setTimeout(() => {
              olderEnabled.current = true;
              // Opened from a search result: go to that message.
              if (jumpToMessageId) scrollToMessage(jumpToMessageId);
            }, 400);
          }, 50);
        }
      } else if (response.status === 403 || response.status === 404) {
        const why = response.status === 404 ? 'deleted' : 'removed';
        goneRef.current = why;
        setGone(why);
      } else {
        const error = await response.json().catch(() => ({}));
        console.error(`[STORM-CHAT] ❌ Failed to fetch messages:`, error);
      }
    } catch (error) {
      console.error('[STORM-CHAT] ❌ Error in fetchMessages:', error);
    } finally {
      setLoading(false);
    }
  }

  async function sendPoll() {
    const q = pollQuestion.trim();
    const opts = pollOptions.map(o => o.trim()).filter(Boolean);
    if (!q || opts.length < 2 || sending) return;
    setSending(true);
    try {
      const response = await fetch(`/api/storm-chat/messages/${group._id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          senderId: user?._id || user?.id,
          senderName: user?.name,
          senderRole: user?.role,
          message: q,
          messageType: 'poll',
          poll: {
            question: q, options: opts, allowMultiple: pollMultiple, anonymous: pollAnonymous,
            endsAt: (() => { const ms = POLL_ENDS.find((e) => e.key === pollEnd)?.ms || 0; return ms ? new Date(Date.now() + ms).toISOString() : undefined; })(),
          },
        }),
      });
      if (response.ok) {
        const message = await response.json();
        setMessages(prev => [...prev, message]);
        setShowPoll(false);
        setPollQuestion("");
        setPollOptions(["", ""]);
        setPollMultiple(false);
        setPollEnd('none');
        setPollAnonymous(false);
        setShouldAutoScroll(true);
      } else {
        let err = '';
        try { err = (await response.json())?.error || ''; } catch {}
        console.error('[STORM-CHAT] poll send failed', response.status, err);
        alert(`Poll could not be sent: ${err || response.status}`);
      }
    } catch (e) {
      console.error('[STORM-CHAT] poll send error', e);
      alert('Poll could not be sent. Check your connection and try again.');
    } finally {
      setSending(false);
    }
  }

  async function votePoll(messageId: string, optionIndex: number) {
    try {
      const res = await fetch('/api/storm-chat/poll-vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId, optionIndex }),
      });
      if (res.ok) {
        const updated = await res.json();
        setMessages(prev => prev.map(m => (m._id === messageId ? { ...m, poll: updated.poll } : m)));
      } else {
        const err = await res.json().catch(() => ({}));
        if (err?.error) alert(err.error); // e.g. "This poll has ended"
      }
    } catch (e) {
      console.error('[STORM-CHAT] poll vote error', e);
    }
  }

  // Add or toggle off an emoji reaction on a message (same PATCH the app uses).
  async function toggleReaction(messageId: string, emoji: string) {
    try {
      const res = await fetch(`/api/storm-chat/messages/${group._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId, emoji, userName: user?.name }),
      });
      if (res.ok) {
        const updated = await res.json();
        setMessages(prev => prev.map(m => (m._id === messageId ? { ...m, reactions: updated.reactions || [] } : m)));
      }
    } catch (e) {
      console.error('[STORM-CHAT] reaction error', e);
    }
  }

  // Open the forward dialog for a message; lazy-load the user directory once.
  function openForward(msg: ChatMessage) {
    setForwardMsg(msg);
    setForwardSelected(new Set());
    setForwardSearch("");
    setMenuMessageId(null);
    if (forwardUsers.length === 0) {
      const myId = user?._id || user?.id || '';
      // Use the public directory (any authenticated user, incl. sales) — the
      // admin-only /api/users returns 403 for reps, which left it "Loading…".
      fetch('/api/users/directory')
        .then(r => r.json())
        .then((list) => {
          const arr = (Array.isArray(list) ? list : []).filter((u: any) => u.id !== myId && u._id !== myId);
          setForwardUsers(arr.map((u: any) => ({ id: u.id || u._id, name: u.name, role: u.role, headshotUrl: u.headshotUrl })));
        })
        .catch(() => {});
    }
  }

  function toggleForwardUser(id: string) {
    setForwardSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  // Forward the message to each picked user: open/create their DM, then post a
  // copy (text/media/poll) into it.
  async function sendForward() {
    if (!forwardMsg || forwardSelected.size === 0 || forwardSending) return;
    setForwardSending(true);
    const m = forwardMsg;
    const body: any = {
      senderName: user?.name,
      senderRole: user?.role,
      message: m.message || '',
      messageType: m.messageType,
      mediaUrl: m.mediaUrl || '',
    };
    if (m.messageType === 'poll' && m.poll) {
      body.poll = { question: m.poll.question, options: m.poll.options.map(o => o.text), allowMultiple: m.poll.allowMultiple, anonymous: !!m.poll.anonymous };
    }
    if (m.voice) body.voice = { durationSec: m.voice.durationSec };
    if (m.location) body.location = m.location;
    const albumItems = m.albumId ? messages.filter((x) => x.albumId === m.albumId && !x.deletedAt) : [];
    if (albumItems.length > 1) {
      body.messageType = 'image';
      body.album = albumItems.map((x) => ({ mediaUrl: x.mediaUrl, messageType: x.messageType }));
      delete body.mediaUrl;
      body.message = '';
    }
    let ok = 0, fail = 0;
    for (const uid of Array.from(forwardSelected)) {
      try {
        const dmRes = await fetch('/api/storm-chat/dm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: uid }),
        });
        if (!dmRes.ok) { fail++; continue; }
        const dm = await dmRes.json();
        const msgRes = await fetch(`/api/storm-chat/messages/${dm._id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (msgRes.ok) ok++; else fail++;
      } catch { fail++; }
    }
    setForwardSending(false);
    setForwardMsg(null);
    alert(fail === 0 ? `Forwarded to ${ok} ${ok === 1 ? 'person' : 'people'}.` : `Forwarded to ${ok}; ${fail} failed.`);
  }

  async function sendMessage() {
    if (editingMsg) { saveEdit(); return; }
    if (!newMessage.trim() || sending) return;

    console.log(`[STORM-CHAT] 📤 Sending message to group: ${group.name} (${group._id})`);
    console.log(`[STORM-CHAT] Message content: "${newMessage}"`);

    setSending(true);
    try {
      const messageBody: any = {
        senderId: user?._id || user?.id,
        senderName: user?.name,
        senderRole: user?.role,
        message: newMessage,
        messageType: 'text'
      };

      // Add reply data if replying
      if (replyingTo) {
        console.log(`[STORM-CHAT] Replying to message ID: ${replyingTo._id}`);
        messageBody.replyTo = replyingTo._id;
        messageBody.replyToMessage = replyingTo.message;
        messageBody.replyToSender = replyingTo.senderName;
      }

      const response = await fetch(`/api/storm-chat/messages/${group._id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(messageBody)
      });

      if (response.ok) {
        const message = await response.json();
        console.log(`[STORM-CHAT] ✅ Message sent successfully! Message ID: ${message._id}`);
        
        // Log push notification status
        if (message.pushStatus) {
          const { mentionCount, memberCount, error } = message.pushStatus;
          if (error) {
            console.error(`[STORM-CHAT] ⚠️ Push notification error: ${error}`);
          } else {
            console.log(`[STORM-CHAT] 📱 Push notifications: ${mentionCount} mentions, ${memberCount} members notified`);
          }
        }

        setMessages([...messages, message]);
        setNewMessage("");
        setReplyingTo(null);
        setShouldAutoScroll(true);
      } else {
        const error = await response.json();
        console.error(`[STORM-CHAT] ❌ Failed to send message:`, error);
        alert(error.error || 'Failed to send message');
      }
    } catch (error) {
      console.error('[STORM-CHAT] ❌ Error in sendMessage:', error);
      alert('Failed to send message');
    } finally {
      setSending(false);
    }
  }

  async function handleFileUpload(file: File) {
    console.log(`[STORM-CHAT] 📁 Starting file upload: ${file.name} (${file.type})`);
    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const uploadResponse = await fetch('/api/upload-image', {
        method: 'POST',
        body: formData
      });

      if (!uploadResponse.ok) {
        console.error(`[STORM-CHAT] ❌ File upload failed`);
        alert('Failed to upload file');
        return;
      }

      const { url } = await uploadResponse.json();
      console.log(`[STORM-CHAT] ✅ File uploaded successfully! URL: ${url}`);
      
      // Determine message type
      let messageType: 'image' | 'video' | 'file' = 'file';
      if (file.type.startsWith('image/')) messageType = 'image';
      else if (file.type.startsWith('video/')) messageType = 'video';

      console.log(`[STORM-CHAT] 📤 Sending media message...`);
      // Send message with media
      const response = await fetch(`/api/storm-chat/messages/${group._id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          senderId: user?._id || user?.id,
          senderName: user?.name,
          senderRole: user?.role,
          message: file.name,
          messageType,
          mediaUrl: url
        })
      });

      if (response.ok) {
        const message = await response.json();
        console.log(`[STORM-CHAT] ✅ Media message sent successfully! Message ID: ${message._id}`);
        
        // Log push notification status
        if (message.pushStatus) {
          const { mentionCount, memberCount, error } = message.pushStatus;
          if (error) {
            console.error(`[STORM-CHAT] ⚠️ Push notification error: ${error}`);
          } else {
            console.log(`[STORM-CHAT] 📱 Push notifications: ${mentionCount} mentions, ${memberCount} members notified`);
          }
        }

        setMessages([...messages, message]);
      } else {
        const error = await response.json();
        console.error(`[STORM-CHAT] ❌ Failed to send media message:`, error);
        alert('Failed to send file');
      }
    } catch (error) {
      console.error('[STORM-CHAT] ❌ Error in handleFileUpload:', error);
      alert('Failed to upload file');
    } finally {
      setUploading(false);
    }
  }

  // ── Several photos at once (GroupMe-style album, up to 10) ────────────────────
  async function handlePhotos(picked: File[]) {
    const files = picked.filter((f) => f.type.startsWith('image/') || f.type.startsWith('video/'));
    if (files.length === 0) return;
    if (files.length === 1) { await handleFileUpload(files[0]); return; }
    if (files.length > ALBUM_MAX) { alert(`You can send up to ${ALBUM_MAX} photos at a time.`); return; }
    setUploading(true);
    try {
      const album: { mediaUrl: string; messageType: 'image' | 'video' }[] = [];
      for (const f of files) {
        const fd = new FormData();
        fd.append('file', f);
        const up = await fetch('/api/upload-image', { method: 'POST', body: fd });
        if (!up.ok) {
          const e = await up.json().catch(() => ({}));
          alert(e.error || `Couldn't upload ${f.name}`);
          return;
        }
        const { url } = await up.json();
        album.push({ mediaUrl: url, messageType: f.type.startsWith('video/') ? 'video' : 'image' });
      }
      const res = await fetch(`/api/storm-chat/messages/${group._id}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageType: 'image', album }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { alert(data.error || "Couldn't send the photos"); return; }
      setMessages((prev) => [...prev, ...(data.albumMessages || [data])]);
      setShouldAutoScroll(true);
    } catch {
      alert("Couldn't send the photos");
    } finally {
      setUploading(false);
    }
  }

  // ── Share your location (one-time pin, never live tracking) ──────────────────
  async function shareLocation() {
    setAttachOpen(false);
    if (typeof navigator === 'undefined' || !navigator.geolocation) { alert("This browser can't share a location."); return; }
    if (!(await appConfirm('Share your current location in this chat?'))) return;
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const res = await fetch(`/api/storm-chat/messages/${group._id}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messageType: 'text', location: { lat: pos.coords.latitude, lng: pos.coords.longitude } }),
        }).catch(() => null);
        const data = res ? await res.json().catch(() => ({})) : {};
        if (!res || !res.ok) { alert(data.error || "Couldn't share your location"); return; }
        setMessages((prev) => [...prev, data]);
        setShouldAutoScroll(true);
      },
      () => alert('Allow location access in your browser to share where you are.'),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }

  // ── Voice messages (up to 5 minutes) ─────────────────────────────────────────
  async function startRecording() {
    if (recState !== 'idle') return;
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      alert('Allow microphone access in your browser to record a voice message.');
      return;
    }
    const { mime, ext } = pickAudioFormat();
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    recChunks.current = [];
    recCancelled.current = false;
    rec.ondataavailable = (e) => { if (e.data.size) recChunks.current.push(e.data); };
    rec.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      if (recTimer.current) { clearInterval(recTimer.current); recTimer.current = null; }
      const secs = Math.min((Date.now() - recStartedAt.current) / 1000, VOICE_MAX_SEC);
      if (recCancelled.current || secs < 1) { setRecState('idle'); return; }
      setRecState('sending');
      try {
        await sendVoice(new Blob(recChunks.current, { type: rec.mimeType || mime || 'audio/webm' }), secs, ext);
      } finally {
        setRecState('idle');
      }
    };
    recorderRef.current = rec;
    recStartedAt.current = Date.now();
    setRecSeconds(0);
    rec.start();
    setRecState('recording');
    recTimer.current = setInterval(() => {
      const secs = (Date.now() - recStartedAt.current) / 1000;
      setRecSeconds(secs);
      if (secs >= VOICE_MAX_SEC) stopRecording(false); // 5 minutes: send what's there
    }, 250);
  }
  function stopRecording(cancel: boolean) {
    recCancelled.current = cancel;
    const rec = recorderRef.current;
    if (rec && rec.state !== 'inactive') rec.stop();
  }
  async function sendVoice(blob: Blob, secs: number, ext: string) {
    const fd = new FormData();
    fd.append('file', blob, `voice-${Date.now()}.${ext}`);
    const up = await fetch('/api/upload-image', { method: 'POST', body: fd }).catch(() => null);
    if (!up || !up.ok) { alert("Couldn't send the voice message"); return; }
    const { url } = await up.json();
    const res = await fetch(`/api/storm-chat/messages/${group._id}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messageType: 'file', mediaUrl: url, voice: { durationSec: secs } }),
    }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    if (!res || !res.ok) { alert(data.error || "Couldn't send the voice message"); return; }
    setMessages((prev) => [...prev, data]);
    setShouldAutoScroll(true);
  }

  // ── GIPHY GIF / sticker picker ──────────────────────────────────────────────
  function openGiphy(mode: 'gifs' | 'stickers') {
    setGiphyMode(mode);
    setGiphyOpen(true);
    setShowEmoji(false);
    loadGiphy(mode, giphyQuery);
  }

  async function loadGiphy(mode: 'gifs' | 'stickers', q: string) {
    setGiphyLoading(true);
    try {
      const res = await fetch(`/api/giphy?type=${mode}&q=${encodeURIComponent(q)}&limit=24`);
      const data = res.ok ? await res.json() : { items: [] };
      setGiphyItems(data.items || []);
    } catch {
      setGiphyItems([]);
    } finally {
      setGiphyLoading(false);
    }
  }

  // Send a GIPHY GIF/sticker: it's already hosted, so just post an image message
  // pointing at its URL (no upload).
  async function sendGiphy(url: string) {
    setGiphyOpen(false);
    try {
      const res = await fetch(`/api/storm-chat/messages/${group._id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          senderId: user?._id || user?.id,
          senderName: user?.name,
          senderRole: user?.role,
          message: giphyMode === 'stickers' ? 'Sticker' : 'GIF',
          messageType: 'image',
          mediaUrl: url,
        }),
      });
      if (res.ok) {
        const message = await res.json();
        setMessages(prev => [...prev, message]);
        setShouldAutoScroll(true);
      }
    } catch (e) {
      console.error('[STORM-CHAT] GIPHY send error', e);
    }
  }

  // Always render in Central time, regardless of the viewer's own time zone —
  // letting the Intl API do the UTC->Central conversion (via timeZone) means it
  // follows CDT/CST automatically, unlike a hardcoded UTC-5 offset. Reading the
  // adjusted instant back with local getters (the previous approach) applied
  // the viewer's own time zone on TOP of that fixed offset, double-converting
  // for anyone not already on UTC.
  function formatTime(date: Date) {
    const d = new Date(date);
    return d.toLocaleTimeString('en-US', {
      timeZone: 'America/Chicago',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  }

  function formatDate(date: Date) {
    const d = new Date(date);
    const centralDateKey = (x: Date) => x.toLocaleDateString('en-CA', { timeZone: 'America/Chicago' }); // YYYY-MM-DD
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (centralDateKey(d) === centralDateKey(today)) return 'Today';
    if (centralDateKey(d) === centralDateKey(yesterday)) return 'Yesterday';

    return d.toLocaleDateString('en-GB', { timeZone: 'America/Chicago', day: '2-digit', month: 'short', year: 'numeric' });
  }

  function renderTextWithLinks(text: string, textColor: string) {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    // Highlight @Name mentions using the group's member names (longest first so
    // "@John Doe" wins over "@John"). Names come from the mention autocomplete list.
    const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const names = [...members.map(m => m.name), 'all'].filter(Boolean).sort((a, b) => b.length - a.length);
    const mentionSet = new Set(names.map(n => '@' + n));
    const mentionRegex = names.length ? new RegExp(`(@(?:${names.map(esc).join('|')}))`, 'g') : null;
    const onColoredBubble = textColor === '#fff';  /* tokens-guard-ignore: persisted-value, string equality on textColor */
    const mentionColor = onColoredBubble ? 'var(--text-inverse)' : '#1d4ed8';
    const mentionBg = onColoredBubble ? 'rgb(var(--white-rgb) / 0.25)' : 'rgba(37,99,235,0.12)';

    const out: React.ReactNode[] = [];
    text.split(urlRegex).forEach((part, index) => {
      if (/^https?:\/\//.test(part)) {
        out.push(
          <a
            key={`u${index}`}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: textColor === '#fff' ? '#93c5fd' : '#2563eb',  /* tokens-guard-ignore: persisted-value, string equality on textColor */
              textDecoration: 'underline',
              cursor: 'pointer'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {part}
          </a>
        );
        return;
      }
      if (!mentionRegex) { out.push(part); return; }
      part.split(mentionRegex).forEach((seg, j) => {
        if (seg && mentionSet.has(seg)) {
          out.push(
            <span key={`m${index}-${j}`} style={{ color: mentionColor, fontWeight: 700, backgroundColor: mentionBg, borderRadius: 4, padding: '0 3px' }}>{seg}</span>
          );
        } else if (seg) {
          out.push(seg);
        }
      });
    });
    return out;
  }

  // WhatsApp-style reaction affordance: a small 😊 button beside the message
  // (on hover) that opens a floating emoji bar; picking one applies the reaction.
  function reactionAffordance(msg: ChatMessage, isMyMessage: boolean) {
    const open = reactionPickerId === msg._id;
    return (
      <>
        {/* Hover trigger */}
        <button
          onClick={() => { setReactionPickerId(open ? null : msg._id); setReactionPickerExpanded(false); }}
          title="React"
          style={{
            position: 'absolute',
            top: '50%',
            transform: 'translateY(-50%)',
            ...(isMyMessage ? { left: -54 } : { right: -54 }),
            width: 26, height: 26, borderRadius: '50%',
            background: 'var(--surface-default)', border: '1px solid var(--border-default)',
            boxShadow: '0 1px 4px rgba(0,0,0,0.12)',
            cursor: 'pointer', fontSize: 14, lineHeight: 1,
            display: 'flex',
            alignItems: 'center', justifyContent: 'center', zIndex: 5,
          }}
        >
          🙂
        </button>
        {/* Click-away backdrop */}
        {open && (
          <div onClick={() => { setReactionPickerId(null); setReactionPickerExpanded(false); }}
            style={{ position: 'fixed', inset: 0, zIndex: 1100 }} />
        )}
        {/* Floating emoji bar */}
        {open && (
          <div
            style={{
              position: 'absolute', bottom: '100%', marginBottom: 6,
              ...(isMyMessage ? { right: 0 } : { left: 0 }),
              background: 'var(--surface-default)', borderRadius: 22,
              boxShadow: '0 6px 20px rgba(0,0,0,0.18)', border: '1px solid var(--border-default)',
              padding: '5px 8px', display: 'flex', alignItems: 'center', gap: 2, zIndex: 1200,
            }}
          >
            {REACTION_EMOJIS.map((em) => (
              <button
                key={em}
                onClick={() => { toggleReaction(msg._id, em); setReactionPickerId(null); }}
                title={em}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 22, padding: 3, borderRadius: '50%', lineHeight: 1 }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-subtle)'; e.currentTarget.style.transform = 'scale(1.15)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; e.currentTarget.style.transform = 'scale(1)'; }}
              >
                {em}
              </button>
            ))}
            <button
              onClick={() => setReactionPickerExpanded(v => !v)}
              title="More"
              style={{ background: 'var(--surface-subtle)', border: 'none', cursor: 'pointer', fontSize: 16, width: 30, height: 30, borderRadius: '50%', lineHeight: 1, color: 'var(--text-muted)', marginLeft: 2 }}
            >
              +
            </button>
            {reactionPickerExpanded && (
              <div style={{ position: 'absolute', top: '100%', marginTop: 6, ...(isMyMessage ? { right: 0 } : { left: 0 }), width: 300, maxHeight: 200, overflowY: 'auto', background: 'var(--surface-default)', border: '1px solid var(--border-default)', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.15)', padding: 8, display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 2, zIndex: 1300 }}>
                {CHAT_EMOJIS.map((em) => (
                  <button
                    key={em}
                    onClick={() => { toggleReaction(msg._id, em); setReactionPickerId(null); setReactionPickerExpanded(false); }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, padding: 4, borderRadius: 6, lineHeight: 1 }}
                    onMouseEnter={(ev) => (ev.currentTarget.style.background = 'var(--surface-subtle)')}
                    onMouseLeave={(ev) => (ev.currentTarget.style.background = 'none')}
                  >
                    {em}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </>
    );
  }

  // The ⋮ menu for ANY message type (text, photo, video, file, poll), so
  // every message can be replied to, forwarded, pinned and deleted the same
  // way (readiness test item 14: files had no menu at all). Placed just
  // outside the bubble; the bubble's wrapper must be position: relative.
  function renderMenu(msg: ChatMessage, isMyMessage: boolean, showMenu: boolean) {
    return (
      <>
                  {/* Always-visible menu button, positioned just OUTSIDE the
                      bubble (on the inner side) so it never overlaps the text. */}
                  <button
                    onClick={() => setMenuMessageId(showMenu ? null : msg._id)}
                    title="More"
                    style={{
                      position: 'absolute',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      ...(isMyMessage ? { left: -26 } : { right: -26 }),
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-subtle)',
                      cursor: 'pointer',
                      padding: 4,
                      fontSize: 18,
                      lineHeight: 1,
                      fontWeight: 'bold'
                    }}
                  >
                    ⋮
                  </button>
                
                  {/* Popup menu */}
                  {showMenu && (
                    <div
                      style={{
                        position: 'absolute',
                        top: 28,
                        ...(isMyMessage ? { right: '100%', marginRight: 8 } : { left: '100%', marginLeft: 8 }),
                        backgroundColor: 'var(--surface-inverse-raised)',
                        borderRadius: 8,
                        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
                        zIndex: 1000,
                        minWidth: 150,
                        overflow: 'hidden'
                      }}
                    >
                      {/* Message this sender privately (groups only, others' messages) */}
                      {!isDirect && !isMyMessage && onMessagePrivately && (
                        <button
                          onClick={() => { onMessagePrivately(msg.senderId, msg.senderName); setMenuMessageId(null); }}
                          style={{ width: '100%', padding: '10px 16px', background: 'none', border: 'none', color: 'var(--text-inverse)', cursor: 'pointer', textAlign: 'left', fontSize: 14, display: 'flex', alignItems: 'center', gap: 12 }}
                          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--gray-700) /* no semantic: gray-700 as surface */'}
                          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                        >
                          ✉️ Message privately
                        </button>
                      )}
                      {canSendMessage && (
                      <button
                        onClick={() => {
                          if (editingMsg) cancelEdit();
                          setReplyingTo(msg);
                          setMenuMessageId(null);
                        }}
                        style={{
                          width: '100%',
                          padding: '10px 16px',
                          background: 'none',
                          border: 'none',
                          color: 'var(--text-inverse)',
                          cursor: 'pointer',
                          textAlign: 'left',
                          fontSize: 14,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--gray-700) /* no semantic: gray-700 as surface */'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                      >
                        ↩ Reply
                      </button>
                      )}
                      <button
                        onClick={() => openForward(msg)}
                        style={{
                          width: '100%',
                          padding: '10px 16px',
                          background: 'none',
                          border: 'none',
                          color: 'var(--text-inverse)',
                          cursor: 'pointer',
                          textAlign: 'left',
                          fontSize: 14,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--gray-700) /* no semantic: gray-700 as surface */'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                      >
                        ➦ Forward
                      </button>
                      {msg.messageType === 'text' && (
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(msg.message);
                          setMenuMessageId(null);
                          alert('Message copied!');
                        }}
                        style={{
                          width: '100%',
                          padding: '10px 16px',
                          background: 'none',
                          border: 'none',
                          color: 'var(--text-inverse)',
                          cursor: 'pointer',
                          textAlign: 'left',
                          fontSize: 14,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--gray-700) /* no semantic: gray-700 as surface */'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                      >
                        📋 Copy
                      </button>
                      )}
                      {(msg.messageType === 'image' || msg.messageType === 'video' || msg.messageType === 'file') && msg.mediaUrl && (
                        <button
                          onClick={() => {
                            const items = msg.albumId ? (albumsById.get(msg.albumId) || [msg]) : [msg];
                            items.forEach((a) => { if (a.mediaUrl) downloadMedia(a.mediaUrl); });
                            setMenuMessageId(null);
                          }}
                          style={{ width: '100%', padding: '10px 16px', background: 'none', border: 'none', color: 'var(--text-inverse)', cursor: 'pointer', textAlign: 'left', fontSize: 14, display: 'flex', alignItems: 'center', gap: 12 }}
                          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--gray-700) /* no semantic: gray-700 as surface */'}
                          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                        >
                          ⬇ Save
                        </button>
                      )}
                      {msg.messageType === 'text' && canSendMessage && canEditMessage(msg, myAppId) && (
                        <button
                          onClick={() => startEdit(msg)}
                          style={{ width: '100%', padding: '10px 16px', background: 'none', border: 'none', color: 'var(--text-inverse)', cursor: 'pointer', textAlign: 'left', fontSize: 14, display: 'flex', alignItems: 'center', gap: 12 }}
                          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--gray-700) /* no semantic: gray-700 as surface */'}
                          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                        >
                          ✏️ Edit
                        </button>
                      )}
                      {(msg.reactions?.length ?? 0) > 0 && (
                        <button
                          onClick={() => { setReactionsFor(msg); setMenuMessageId(null); }}
                          style={{ width: '100%', padding: '10px 16px', background: 'none', border: 'none', color: 'var(--text-inverse)', cursor: 'pointer', textAlign: 'left', fontSize: 14, display: 'flex', alignItems: 'center', gap: 12 }}
                          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--gray-700) /* no semantic: gray-700 as surface */'}
                          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                        >
                          😊 Reactions ({msg.reactions!.length})
                        </button>
                      )}
                      {canPin && (
                        <button
                          onClick={() => { togglePin(msg); setMenuMessageId(null); }}
                          style={{ width: '100%', padding: '10px 16px', background: 'none', border: 'none', color: 'var(--text-inverse)', cursor: 'pointer', textAlign: 'left', fontSize: 14, display: 'flex', alignItems: 'center', gap: 12 }}
                          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--gray-700) /* no semantic: gray-700 as surface */'}
                          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                        >
                          {msg.pinned ? '📌 Unpin' : '📌 Pin'}
                        </button>
                      )}
                      {(isMyMessage || canModerate) && (
                        <button
                          onClick={() => { deleteMessage(msg._id); setMenuMessageId(null); }}
                          style={{ width: '100%', padding: '10px 16px', background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', textAlign: 'left', fontSize: 14, display: 'flex', alignItems: 'center', gap: 12 }}
                          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--gray-700) /* no semantic: gray-700 as surface */'}
                          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                        >
                          🗑 Delete
                        </button>
                      )}
                    </div>
                  )}
      </>
    );
  }

  // Photos sent together (one album id) show as one grid.
  const albumsById = new Map<string, ChatMessage[]>();
  for (const m of messages) {
    if (!m.albumId || m.deletedAt) continue;
    const list = albumsById.get(m.albumId) || [];
    list.push(m);
    albumsById.set(m.albumId, list);
  }

  function renderMessage(msg: ChatMessage, index: number) {
    const isMyMessage = msg.senderId === (user?._id || user?.id);
    const showDate = index === 0 ||
      new Date(messages[index - 1].createdAt).toDateString() !== new Date(msg.createdAt).toDateString();
    const isBlinking = blinkingMessageId === msg._id;
    const isHovered = hoveredMessageId === msg._id;
    const showMenu = menuMessageId === msg._id;
    // Deleted: a quiet notice in its place, with nothing to tap (GroupMe-style).
    const deleted = !!msg.deletedAt;
    // An album is drawn once, with its first photo; the rest return nothing
    // here but still answer jumps (search, gallery) through the same box.
    const album = msg.albumId && !deleted ? (albumsById.get(msg.albumId) || []) : [];
    if (album.length > 1 && album[0]._id !== msg._id) return null;
    const isAlbum = album.length > 1;

    // System notices (e.g. "X joined the group") render as a centered gray pill.
    if (msg.messageType === 'system') {
      return (
        <div key={msg._id} style={{ display: 'flex', justifyContent: 'center', margin: '10px 0' }}>
          <span style={{ background: '#eef2f7', color: 'var(--text-muted)', fontSize: 12, padding: '4px 12px', borderRadius: 12 }}>
            {msg.message}
          </span>
        </div>
      );
    }

    return (
      <div key={msg._id} ref={(el) => { messageRefs.current[msg._id] = el; for (const a of album) messageRefs.current[a._id] = el; }}>
        {showDate && (
          <div style={{ 
            textAlign: 'center', 
            margin: '16px 0',
            fontSize: 12,
            color: 'var(--text-muted)'
          }}>
            <span style={{ 
              backgroundColor: 'var(--surface-subtle)',
              padding: '4px 12px',
              borderRadius: 12
            }}>
              {formatDate(msg.createdAt)}
            </span>
          </div>
        )}
        
        <div
          style={{
            display: 'flex',
            justifyContent: isMyMessage ? 'flex-end' : 'flex-start',
            alignItems: 'flex-end',
            gap: 8,
            marginBottom: 8,
            transition: 'background-color 0.25s',
            backgroundColor: isBlinking ? 'rgba(250, 204, 21, 0.3)' : 'transparent',
            borderRadius: 16,
            padding: isBlinking ? 4 : 0,
            position: 'relative'
          }}>
          {/* Incoming messages show the sender's avatar (uploaded photo, else initials). */}
          {!isMyMessage && <SenderAvatar url={msg.senderHeadshotUrl} name={msg.senderName} />}
          <div
            onMouseEnter={() => setHoveredMessageId(msg._id)}
            onMouseLeave={() => { setHoveredMessageId(null); if (menuMessageId === msg._id) setMenuMessageId(null); }}
            style={{
            maxWidth: '70%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: isMyMessage ? 'flex-end' : 'flex-start',
            position: 'relative'
          }}>
            {!isMyMessage && (
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, marginLeft: 8 }}>
                {msg.senderName}
              </div>
            )}

            {/* Message body wrapper: the reaction 🙂 button anchors here (only the
                bubble), so it lines up with the ⋮ button — not shifted by the
                sender name above or reaction badges below. */}
            <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: isMyMessage ? 'flex-end' : 'flex-start' }}>
            {!deleted && reactionAffordance(msg, isMyMessage)}
            {deleted && (
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, padding: '8px 14px', borderRadius: 16, border: '1px dashed var(--border-strong)', color: 'var(--text-muted)', fontSize: 13, fontStyle: 'italic' }}>
                <span>🚫 {DELETED_TEXT}</span>
                <span style={{ fontSize: 10, color: 'var(--text-subtle)', fontStyle: 'normal', whiteSpace: 'nowrap' }}>{formatTime(msg.createdAt)}</span>
              </div>
            )}
            {msg.messageType === 'poll' && msg.poll && (() => {
              // Percentage is out of the group's total members, not just the votes
              // cast — so a single vote in a 9-member group reads ~11%, not 100%.
              const totalMembers = Math.max(activeMembers ?? group.members?.length ?? 0, 1);
              const voterSet = new Set<string>();
              msg.poll.options.forEach(o => (o.votes || []).forEach(v => voterSet.add(v)));
              // The server counts people (one person may pick several options).
              const votersCount = msg.poll.voterCount ?? voterSet.size;
              const ended = pollEnded(msg.poll);
              const myId = user?._id || user?.id || '';
              return (
                <div style={{ position: 'relative', backgroundColor: isMyMessage ? MY_BUBBLE : 'var(--surface-default)', color: isMyMessage ? 'var(--text-inverse)' : 'var(--text-primary)', padding: 14, borderRadius: 16, minWidth: 260, maxWidth: 340 }}>
                  {renderMenu(msg, isMyMessage, showMenu)}
                  <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 10, paddingRight: (isMyMessage || canModerate) ? 28 : 0 }}>📊 {msg.poll.question}</div>
                  {msg.poll.options.map((opt, i) => {
                    const votes = opt.votes?.length || 0;
                    const pct = Math.round((votes / totalMembers) * 100);
                    const voted = (opt.votes || []).includes(myId);
                    return (
                      <button key={i} type="button" onClick={() => { if (!ended) votePoll(msg._id, i); }} aria-disabled={ended}
                        style={{ display: 'block', width: '100%', textAlign: 'left', position: 'relative', border: `1px solid ${isMyMessage ? 'rgb(var(--white-rgb) / 0.4)' : 'var(--border-default)'}`, background: 'transparent', borderRadius: 8, padding: '8px 10px', marginBottom: 6, cursor: ended ? 'default' : 'pointer', overflow: 'hidden', color: 'inherit' }}>
                        <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: `${pct}%`, background: isMyMessage ? 'rgb(var(--white-rgb) / 0.2)' : 'rgba(37,99,235,0.12)' }} />
                        <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13, fontWeight: voted ? 700 : 500 }}>
                          <span>{voted ? '✓ ' : ''}{opt.text}</span>
                          <span style={{ whiteSpace: 'nowrap' }} title={opt.voterNames?.length ? opt.voterNames.join(', ') : undefined}>{votes} · {pct}%</span>
                        </div>
                      </button>
                    );
                  })}
                  <div style={{ fontSize: 11, opacity: 0.8, marginTop: 2, display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
                    <span>{votersCount} of {totalMembers} voted{msg.poll.allowMultiple ? ' (multiple)' : ''}{msg.poll.anonymous ? ' · anonymous' : ''}</span>
                    <span>· {ended ? 'Poll ended' : msg.poll.endsAt ? `Ends ${muteUntilLabel(msg.poll.endsAt)}` : 'tap to vote'}</span>
                    {!msg.poll.anonymous && votersCount > 0 && (
                      <button type="button" onClick={() => setVotersFor(msg)}
                        style={{ background: 'none', border: 'none', padding: 0, color: 'inherit', textDecoration: 'underline', cursor: 'pointer', fontSize: 11 }}>
                        See votes
                      </button>
                    )}
                  </div>
                </div>
              );
            })()}
            {msg.messageType === 'text' && !deleted && (
              <div
                style={{
                  backgroundColor: isMyMessage ? MY_BUBBLE : 'var(--surface-default)',
                  color: isMyMessage ? 'var(--text-inverse)' : 'var(--text-primary)',
                  padding: '10px 14px',
                  borderRadius: 16,
                  borderTopRightRadius: isMyMessage ? 4 : 16,
                  borderTopLeftRadius: isMyMessage ? 16 : 4,
                  wordBreak: 'break-word',
                  position: 'relative'
                }}>
                {renderMenu(msg, isMyMessage, showMenu)}

                {/* Reply preview */}
                {msg.replyTo && msg.replyToMessage && (
                  <div 
                    onClick={() => scrollToMessage(msg.replyTo!)}
                    style={{
                      marginBottom: 6,
                      padding: 8,
                      backgroundColor: isMyMessage ? 'rgb(var(--white-rgb) / 0.2)' : 'var(--surface-default)',
                      borderRadius: 8,
                      borderLeft: `3px solid ${isMyMessage ? 'var(--white) /* no semantic: white as border */' : '#DC2626'}`,
                      cursor: 'pointer'
                    }}
                  >
                    <div style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: isMyMessage ? 'var(--text-inverse)' : '#DC2626',
                      marginBottom: 2
                    }}>
                      {msg.replyToSender || 'Unknown'}
                    </div>
                    <div style={{
                      fontSize: 12,
                      color: isMyMessage ? 'rgb(var(--white-rgb) / 0.8)' : 'var(--text-muted)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}>
                      {msg.replyToMessage}
                    </div>
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
                  <div style={{ fontSize: 14, flex: 1, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                    {msg.location ? (
                      <a href={mapsUrl(msg.location)} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
                        style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'inherit', textDecoration: 'none' }}>
                        <span aria-hidden style={{ fontSize: 26, lineHeight: 1 }}>📍</span>
                        <span>
                          <span style={{ display: 'block', fontWeight: 700 }}>Location</span>
                          <span style={{ display: 'block', fontSize: 12, textDecoration: 'underline' }}>Open in Maps</span>
                        </span>
                      </a>
                    ) : renderTextWithLinks(msg.message, isMyMessage ? '#fff' : '#111827' /* tokens-guard-ignore: persisted-value, string equality on textColor */)}
                  </div>
                  <div style={{ 
                    fontSize: 10, 
                    color: isMyMessage ? 'rgb(var(--white-rgb) / 0.7)' : 'var(--text-subtle)',
                    whiteSpace: 'nowrap',
                    alignSelf: 'flex-end'
                  }}>
                    {msg.editedAt ? 'edited · ' : ''}{formatTime(msg.createdAt)}
                  </div>
                </div>
              </div>
            )}
            
            {isAlbum && (
              <div style={{ position: 'relative' }}>
                {renderMenu(msg, isMyMessage, showMenu)}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 3, width: 'min(300px, 62vw)' }}>
                  {album.map((a) => (a.messageType === 'video' ? (
                    <video key={a._id} src={safeHref(a.mediaUrl)} controls preload="metadata"
                      style={{ width: '100%', aspectRatio: '1 / 1', objectFit: 'cover', borderRadius: 6, display: 'block', background: 'black' }} />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={a._id} src={a.mediaUrl} alt="Photo" onClick={() => setViewerImage(a.mediaUrl!)}
                      style={{ width: '100%', aspectRatio: '1 / 1', objectFit: 'cover', borderRadius: 6, display: 'block', cursor: 'pointer' }} />
                  )))}
                </div>
              </div>
            )}

            {msg.messageType === 'image' && msg.mediaUrl && !isAlbum && (
              <div style={{ position: 'relative', display: 'inline-block' }}>
                {renderMenu(msg, isMyMessage, showMenu)}
                <img
                  src={msg.mediaUrl}
                  alt="Image"
                  onClick={() => setViewerImage(msg.mediaUrl!)}
                  // At most 300px, and never wider than a phone screen allows
                  // (a fixed 300px video pushed the chat sideways on phones).
                  style={{ maxWidth: 'min(300px, 62vw)', maxHeight: 300, borderRadius: 8, display: 'block', cursor: 'pointer' }}
                />
                <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: 6 }}>
                  <button onClick={() => downloadMedia(msg.mediaUrl!)} title="Save"
                    style={{ width: 32, height: 32, borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,0.55)', color: 'var(--text-inverse)', cursor: 'pointer', fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>⬇</button>
                </div>
              </div>
            )}

            {msg.messageType === 'video' && msg.mediaUrl && !isAlbum && (
              <div style={{ position: 'relative', display: 'inline-block' }}>
                {renderMenu(msg, isMyMessage, showMenu)}
                <video
                  src={msg.mediaUrl}
                  controls
                  style={{ width: 'min(300px, 62vw)', maxHeight: 300, borderRadius: 8, display: 'block' }}
                />
                <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: 6 }}>
                  <button onClick={() => downloadMedia(msg.mediaUrl!)} title="Save"
                    style={{ width: 32, height: 32, borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,0.55)', color: 'var(--text-inverse)', cursor: 'pointer', fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>⬇</button>
                </div>
              </div>
            )}
            
            {msg.voice && msg.mediaUrl && !deleted && (
              <div style={{
                position: 'relative',
                backgroundColor: isMyMessage ? MY_BUBBLE : 'var(--surface-default)',
                color: isMyMessage ? 'var(--text-inverse)' : 'var(--text-primary)',
                padding: '8px 12px',
                borderRadius: 16,
                borderTopRightRadius: isMyMessage ? 4 : 16,
                borderTopLeftRadius: isMyMessage ? 16 : 4,
              }}>
                {renderMenu(msg, isMyMessage, showMenu)}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span aria-hidden style={{ fontSize: 18 }}>🎤</span>
                  <audio controls preload="none" src={safeHref(msg.mediaUrl)} aria-label={`Voice message, ${formatDuration(msg.voice.durationSec)}`}
                    style={{ width: 'min(240px, 50vw)', height: 36 }} />
                </div>
                <div style={{ fontSize: 10, opacity: 0.75, textAlign: 'right', marginTop: 2 }}>
                  {formatDuration(msg.voice.durationSec)} · {formatTime(msg.createdAt)}
                </div>
              </div>
            )}

            {msg.messageType === 'file' && msg.mediaUrl && !msg.voice && (
              <div style={{ 
                position: 'relative',
                backgroundColor: isMyMessage ? MY_BUBBLE : 'var(--surface-default)',
                color: isMyMessage ? 'var(--text-inverse)' : 'var(--text-primary)',
                padding: '10px 14px',
                borderRadius: 16,
                borderTopRightRadius: isMyMessage ? 4 : 16,
                borderTopLeftRadius: isMyMessage ? 16 : 4,
                wordBreak: 'break-word'
              }}>
                {renderMenu(msg, isMyMessage, showMenu)}
                <a 
                  href={safeHref(msg.mediaUrl)} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  style={{ 
                    color: isMyMessage ? 'var(--text-inverse)' : '#DC2626',
                    textDecoration: 'underline',
                    fontSize: 14
                  }}
                >
                  📎 {msg.message}
                </a>
              </div>
            )}
            </div>{/* end message body wrapper */}

            {/* Reaction badges that sit ON the bubble's bottom edge (WhatsApp
                style): pulled up with a negative margin so they overlap the
                bubble slightly, each a white pill with a shadow. */}
            {msg.reactions && msg.reactions.length > 0 && (() => {
              const myId = user?._id || user?.id || '';
              const counts: Record<string, { count: number; mine: boolean; names: string[] }> = {};
              msg.reactions.forEach(r => {
                if (!counts[r.emoji]) counts[r.emoji] = { count: 0, mine: false, names: [] };
                counts[r.emoji].count += 1;
                counts[r.emoji].names.push(r.userId === myId ? 'You' : r.userName);
                if (r.userId === myId) counts[r.emoji].mine = true;
              });
              return (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: -11, marginRight: isMyMessage ? 6 : 0, marginLeft: isMyMessage ? 0 : 6, justifyContent: isMyMessage ? 'flex-end' : 'flex-start', position: 'relative', zIndex: 3 }}>
                  {Object.entries(counts).map(([em, { count, mine, names }]) => (
                    <button
                      key={em}
                      onClick={() => toggleReaction(msg._id, em)}
                      // Who reacted (GroupMe shows this too); the menu's
                      // "Reactions" lists everyone on touch screens.
                      title={`${em} ${names.join(', ')}${mine ? ' (tap to remove yours)' : ''}`}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 2,
                        background: 'var(--surface-default)',
                        border: `1px solid ${mine ? '#93c5fd' : 'var(--border-default)'}`,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
                        borderRadius: 999, padding: '1px 6px', cursor: 'pointer', fontSize: 12, lineHeight: 1.5,
                      }}
                    >
                      <span>{em}</span>
                      {count > 1 && <span style={{ color: '#4b5563', fontWeight: 600, fontSize: 11 }}>{count}</span>}
                    </button>
                  ))}
                </div>
              );
            })()}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="storm-chat-room" style={{
      display: 'flex',
      flexDirection: 'column',
      height: 'calc(100vh - 200px)',
      backgroundColor: 'var(--surface-default)',
      borderRadius: 12,
      overflow: 'hidden',
      border: '1px solid var(--border-default)'
    }}>
      {/* Header */}
      <div style={{ 
        padding: 16,
        borderBottom: '1px solid var(--border-default)',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        backgroundColor: 'var(--surface-subtle)'
      }}>
        <button 
          onClick={onBack}
          style={{
            background: 'none',
            border: 'none',
            fontSize: 20,
            cursor: 'pointer',
            padding: 4,
            color: 'var(--text-primary)'
          }}
        >
          ←
        </button>
        
        <div style={{ 
          width: 40, 
          height: 40, 
          borderRadius: 8,
          backgroundColor: '#000',
          backgroundImage: group.imageUrl ? `url(${group.imageUrl})` : 'none',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 18,
          color: 'var(--text-inverse)'
        }}>
          {!group.imageUrl && '👥'}
        </div>
        
        {/* Tap the name for Group info (GroupMe-style); DMs have none. */}
        <div
          style={{ flex: 1, minWidth: 0, cursor: isDirect ? 'default' : 'pointer' }}
          onClick={isDirect ? undefined : () => setShowInfo(true)}
          role={isDirect ? undefined : 'button'}
          aria-label={isDirect ? undefined : 'Group info'}
          title={isDirect ? undefined : 'Group info'}
        >
          <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {/* title is the DM partner's name; a group shows its live name. */}
            {isDirect ? (title || group.name) : group.name}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {isDirect ? 'Private message' : `${group.members.length} ${group.members.length === 1 ? 'member' : 'members'}`}
            {!isDirect && group.onlyAdminCanChat && ' • Admin-only chat'}
            {!isDirect && ' • Tap for group info'}
          </div>
        </div>
        <button onClick={() => { setSearchOpen((v) => !v); setSearchQ(''); }} aria-label="Search this chat" title="Search this chat" style={HEADER_BTN}>
          🔍
        </button>
        <button onClick={() => setShowGallery(true)} aria-label="Photos and files" title="Photos & files" style={HEADER_BTN}>
          🖼️
        </button>
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <button
            onClick={() => setMuteMenuOpen((v) => !v)}
            aria-label={mutedNow ? 'Notifications muted' : 'Mute notifications'}
            aria-haspopup="menu"
            aria-expanded={muteMenuOpen}
            title={mutedNow ? `Muted${mutedUntil ? ` until ${muteUntilLabel(mutedUntil)}` : ''}: only @mentions alert you` : 'Mute notifications'}
            style={{ ...HEADER_BTN, opacity: mutedNow ? 1 : 0.6 }}
          >
            {mutedNow ? '🔕' : '🔔'}
          </button>
          {muteMenuOpen && (
            <>
              <div onClick={() => setMuteMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 1100 }} />
              <div role="menu" style={{ position: 'absolute', right: 0, top: '100%', marginTop: 6, zIndex: 1200, background: 'var(--surface-default)', border: '1px solid var(--border-default)', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.15)', minWidth: 240, overflow: 'hidden' }}>
                {mutedNow && (
                  <div style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text-muted)', borderBottom: '1px solid var(--border-default)' }}>
                    {mutedUntil ? `Muted until ${muteUntilLabel(mutedUntil)}.` : 'Muted until you turn it back on.'} You still get @mentions.
                  </div>
                )}
                {mutedNow && <button role="menuitem" onClick={() => changeMute(null)} style={{ ...MENU_ITEM, fontWeight: 700 }}>🔔 Unmute</button>}
                {MUTE_OPTIONS.map((o) => (
                  <button key={o.key} role="menuitem" onClick={() => changeMute(o.key)} style={MENU_ITEM}>{o.label}</button>
                ))}
              </div>
            </>
          )}
        </div>
        {!isDirect && (
          <button
            onClick={() => setShowInfo(true)}
            aria-label="Group info"
            title="Group info"
            style={{ ...HEADER_BTN, fontSize: 20 }}
          >
            ⓘ
          </button>
        )}
      </div>

      {/* Search this chat (GroupMe-style): tap a result to jump to it. */}
      {searchOpen && (
        <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border-default)', background: 'var(--surface-default)' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              autoFocus
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') { setSearchOpen(false); setSearchQ(''); } }}
              placeholder="Search this chat"
              aria-label="Search this chat"
              maxLength={100}
              style={{ flex: 1, minWidth: 0, padding: '8px 12px', border: '1px solid var(--border-default)', borderRadius: 8, fontSize: 14, background: 'var(--surface-subtle)', color: 'var(--text-primary)', outline: 'none' }}
            />
            <button onClick={() => { setSearchOpen(false); setSearchQ(''); }} aria-label="Close search" style={HEADER_BTN}>✕</button>
          </div>
          {searchHits && (
            <div style={{ marginTop: 6, maxHeight: 260, overflowY: 'auto' }}>
              {searchHits.length === 0 ? (
                <div style={{ fontSize: 13, color: 'var(--text-muted)', padding: '6px 2px' }}>No messages found</div>
              ) : searchHits.map((h) => (
                <button
                  key={h._id}
                  onClick={() => { setSearchOpen(false); setSearchQ(''); scrollToMessage(h._id); }}
                  style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', borderBottom: '1px solid var(--border-subtle)', padding: '8px 2px', cursor: 'pointer', color: 'var(--text-primary)' }}
                >
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{h.senderName} · {formatDate(new Date(h.createdAt))} {formatTime(new Date(h.createdAt))}</div>
                  <div style={{ fontSize: 14, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.snippet}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {showGallery && (
        <StormChatGallery groupId={group._id} onClose={() => setShowGallery(false)} onJump={(id) => scrollToMessage(id)} />
      )}

      {/* Who voted for what (not shown for anonymous polls). */}
      {votersFor?.poll && (
        <div onClick={() => setVotersFor(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div role="dialog" aria-label="Votes" onClick={(e) => e.stopPropagation()}
            style={{ background: 'var(--surface-default)', color: 'var(--text-primary)', borderRadius: 12, padding: 18, width: 340, maxWidth: '90vw', maxHeight: '70vh', overflowY: 'auto' }}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>📊 {votersFor.poll.question}</div>
            {votersFor.poll.options.map((o, i) => (
              <div key={i} style={{ padding: '8px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{o.text} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>({o.votes.length})</span></div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>{(o.voterNames || []).join(', ') || 'No votes yet'}</div>
              </div>
            ))}
            <div style={{ textAlign: 'right', marginTop: 10 }}>
              <button onClick={() => setVotersFor(null)} style={{ padding: '8px 16px', background: 'var(--surface-subtle)', color: 'var(--text-primary)', border: 'none', borderRadius: 8, cursor: 'pointer' }}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Who reacted to a message, with names (works on touch screens). */}
      {reactionsFor && (
        <div onClick={() => setReactionsFor(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div role="dialog" aria-label="Reactions" onClick={(e) => e.stopPropagation()}
            style={{ background: 'var(--surface-default)', color: 'var(--text-primary)', borderRadius: 12, padding: 18, width: 320, maxWidth: '90vw', maxHeight: '70vh', overflowY: 'auto' }}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Reactions</div>
            {(reactionsFor.reactions || []).map((r, i) => (
              <div key={`${r.userId}-${r.emoji}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' }}>
                <span style={{ fontSize: 20, width: 28, textAlign: 'center' }}>{r.emoji}</span>
                <span style={{ fontSize: 14 }}>{r.userId === myAppId ? 'You' : r.userName}</span>
              </div>
            ))}
            <div style={{ textAlign: 'right', marginTop: 10 }}>
              <button onClick={() => setReactionsFor(null)} style={{ padding: '8px 16px', background: 'var(--surface-subtle)', color: 'var(--text-primary)', border: 'none', borderRadius: 8, cursor: 'pointer' }}>Close</button>
            </div>
          </div>
        </div>
      )}

      {showInfo && !isDirect && (
        <StormChatGroupInfo
          groupId={group._id}
          myMongoId={user?._id}
          onClose={() => setShowInfo(false)}
          onChanged={(g: any) => {
            setGroup((prev) => ({ ...prev, ...g, members: g.members || prev.members, admins: g.admins || prev.admins } as ChatGroup));
            if (g?.myRights) setRights(g.myRights);
            if (typeof g?.muted === 'boolean') { setMuted(g.muted); setMutedUntil(g.mutedUntil || null); }
          }}
          onGone={() => { setShowInfo(false); onBack(); }}
        />
      )}

      {/* Pinned messages banner — every pinned message, scrolls if many. */}
      {pinnedMessages.length > 0 && (
        <div style={{ maxHeight: 168, overflowY: 'auto', background: 'rgba(241,195,60,0.1)', borderBottom: '1px solid rgba(241,195,60,0.3)' }}>
          {pinnedMessages.map((pm) => (
            <div key={pm._id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px', borderTop: '1px solid rgba(241,195,60,0.2)' }}>
              <span style={{ fontSize: 14 }}>📌</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, color: 'var(--text-tertiary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  <strong>{pm.senderName}: </strong>
                  {pm.messageType === 'image' ? '📷 Photo'
                    : pm.messageType === 'video' ? '🎬 Video'
                    : pm.messageType === 'poll' ? `📊 ${pm.poll?.question || 'Poll'}`
                    : (pm.message || '')}
                </div>
              </div>
              {canPin && (
                <button
                  onClick={() => togglePin(pm)}
                  title="Unpin"
                  style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#e5484d', fontSize: 13, fontWeight: 700, flexShrink: 0 }}
                >
                  Unpin
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Messages */}
      <div
        ref={messagesContainerRef}
        onScroll={handleScroll}
        style={{ 
          flex: 1,
          overflowY: 'auto',
          padding: 16,
          backgroundColor: 'var(--surface-subtle)'
        }}
      >
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-subtle)' }}>
            Loading messages...
          </div>
        ) : messages.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-subtle)' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>💬</div>
            <div>No messages yet. Start the conversation!</div>
          </div>
        ) : (
          <>
            {loadingOlder && (
              <div style={{ textAlign: 'center', padding: 8, fontSize: 12, color: 'var(--text-subtle)' }}>Loading earlier messages…</div>
            )}
            {!hasOlder && messages.length >= PAGE && (
              <div style={{ textAlign: 'center', padding: 8, fontSize: 12, color: 'var(--text-subtle)' }}>Start of the chat</div>
            )}
            {messages.map((msg, index) => renderMessage(msg, index))}
          </>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div style={{ 
        padding: 16,
        borderTop: '1px solid var(--border-default)',
        backgroundColor: 'var(--surface-default)'
      }}>
        {gone ? (
          <div role="status" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: 12, borderRadius: 8, backgroundColor: 'var(--surface-subtle)', color: 'var(--text-secondary)', fontSize: 14 }}>
            <span>{gone === 'deleted' ? 'This group was deleted.' : "You're no longer in this group."}</span>
            <button onClick={onBack} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border-default)', background: 'var(--surface-default)', color: 'var(--text-primary)', cursor: 'pointer', fontWeight: 600 }}>
              Back to chats
            </button>
          </div>
        ) : !canSendMessage ? (
          <div style={{ 
            textAlign: 'center',
            padding: 12,
            backgroundColor: 'rgba(202,0,2,0.1)',
            borderRadius: 8,
            color: '#dc2626',
            fontSize: 14
          }}>
            🔒 Only admins can send messages in this group
          </div>
        ) : (
          <div>
            {/* Editing one of your messages: Send saves, ✕ or Escape cancels. */}
            {editingMsg && (
              <div style={{ marginBottom: 8, padding: 8, backgroundColor: 'var(--surface-subtle)', borderRadius: 8, borderLeft: '3px solid var(--brand-on-surface)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--brand-on-surface)' }}>Editing message</div>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{editingMsg.message}</div>
                </div>
                <button onClick={cancelEdit} aria-label="Cancel editing" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--text-muted)', padding: 4 }}>✕</button>
              </div>
            )}
            {/* Reply preview */}
            {replyingTo && (
              <div style={{
                marginBottom: 8,
                padding: 8,
                backgroundColor: 'var(--surface-subtle)',
                borderRadius: 8,
                borderLeft: '3px solid #DC2626',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#DC2626' }}>
                    {replyingTo.senderName}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
                    {replyingTo.message}
                  </div>
                </div>
                <button
                  onClick={() => setReplyingTo(null)}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: 18,
                    color: 'var(--text-muted)',
                    padding: 4
                  }}
                >
                  ✕
                </button>
              </div>
            )}
            <div style={{ position: 'relative' }}>
            {mentionQuery !== null && (() => {
              const q = (mentionQuery || '').toLowerCase();
              // Group admins can mention everyone with @all (alerts even people
              // who muted the chat). Regular members don't get the option.
              const everyone = rights?.isGroupAdmin && !isDirect && 'all'.startsWith(q)
                ? [{ _id: '__all__', name: 'all', headshotUrl: '' }] : [];
              const matches = [...everyone, ...members.filter(mm => (mm.name || '').toLowerCase().includes(q))].slice(0, 6);
              if (matches.length === 0) return null;
              return (
                <div style={{ position: 'absolute', bottom: '100%', left: 0, right: 0, marginBottom: 8, background: 'var(--surface-default)', border: '1px solid var(--border-default)', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.14)', maxHeight: 200, overflowY: 'auto', zIndex: 60 }}>
                  {matches.map(mm => (
                    <button key={mm._id} type="button" onClick={() => insertMention(mm.name)}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '8px 12px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-subtle)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}>
                      <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#4b5563', color: 'var(--text-inverse)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0, fontSize: 12 }}>
                        {mm.headshotUrl ? <img src={mm.headshotUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (mm.name?.[0]?.toUpperCase() || '?')}
                      </div>
                      <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-secondary)' }}>
                        {mm._id === '__all__' ? 'all (everyone in this group)' : mm.name}
                      </span>
                    </button>
                  ))}
                </div>
              );
            })()}
            {showPoll && (
              <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }} onClick={() => setShowPoll(false)}>
                <div style={{ background: 'var(--surface-default)', borderRadius: 12, padding: 20, width: 380, maxWidth: '90vw', maxHeight: '80vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
                  <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Create a poll</div>
                  <input value={pollQuestion} onChange={e => setPollQuestion(e.target.value)} placeholder="Ask a question..." style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border-default)', borderRadius: 8, marginBottom: 12, fontSize: 14, boxSizing: 'border-box' }} />
                  {pollOptions.map((opt, i) => (
                    <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                      <input value={opt} onChange={e => setPollOptions(prev => prev.map((o, idx) => idx === i ? e.target.value : o))} placeholder={`Option ${i + 1}`} style={{ flex: 1, padding: '8px 10px', border: '1px solid var(--border-default)', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' }} />
                      {pollOptions.length > 2 && (
                        <button type="button" onClick={() => setPollOptions(prev => prev.filter((_, idx) => idx !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: 20 }}>×</button>
                      )}
                    </div>
                  ))}
                  {pollOptions.length < 10 && (
                    <button type="button" onClick={() => setPollOptions(prev => [...prev, ''])} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#2563eb', fontSize: 13, fontWeight: 600, marginBottom: 12, padding: 0 }}>+ Add option</button>
                  )}
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, fontSize: 13, color: 'var(--text-tertiary)', cursor: 'pointer' }}>
                    <input type="checkbox" checked={pollMultiple} onChange={e => setPollMultiple(e.target.checked)} /> Allow multiple answers
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, fontSize: 13, color: 'var(--text-tertiary)', cursor: 'pointer' }}>
                    <input type="checkbox" checked={pollAnonymous} onChange={e => setPollAnonymous(e.target.checked)} /> Anonymous (hide who voted)
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, fontSize: 13, color: 'var(--text-tertiary)' }}>
                    Poll ends
                    <select value={pollEnd} onChange={e => setPollEnd(e.target.value)} aria-label="Poll ends"
                      style={{ padding: '6px 8px', border: '1px solid var(--border-default)', borderRadius: 8, fontSize: 13, background: 'var(--surface-subtle)', color: 'var(--text-primary)' }}>
                      {POLL_ENDS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
                    </select>
                  </label>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                    <button type="button" onClick={() => setShowPoll(false)} style={{ padding: '8px 16px', background: 'var(--surface-subtle)', border: 'none', borderRadius: 8, cursor: 'pointer' }}>Cancel</button>
                    <button type="button" onClick={sendPoll} disabled={!pollQuestion.trim() || pollOptions.filter(o => o.trim()).length < 2 || sending} style={{ padding: '8px 16px', background: '#CB0002', color: 'var(--text-inverse)', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>Send Poll</button>
                  </div>
                </div>
              </div>
            )}
            {/* Forward-to-users dialog */}
            {forwardMsg && (() => {
              const q = forwardSearch.trim().toLowerCase();
              const list = q ? forwardUsers.filter(u => (u.name || '').toLowerCase().includes(q) || (u.role || '').toLowerCase().includes(q)) : forwardUsers;
              const preview = forwardMsg.messageType === 'text' ? forwardMsg.message
                : forwardMsg.messageType === 'image' ? '📷 Photo'
                : forwardMsg.messageType === 'video' ? '🎥 Video'
                : forwardMsg.messageType === 'poll' ? `📊 ${forwardMsg.poll?.question || 'Poll'}`
                : forwardMsg.voice ? '🎤 Voice message'
                : '📎 File';
              return (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }} onClick={() => setForwardMsg(null)}>
                  <div style={{ background: 'var(--surface-default)', borderRadius: 12, padding: 18, width: 420, maxWidth: '92vw', maxHeight: '82vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
                    <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Forward message</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12, padding: '6px 10px', background: 'var(--surface-subtle)', borderRadius: 8, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{preview}</div>
                    <input
                      value={forwardSearch}
                      onChange={e => setForwardSearch(e.target.value)}
                      placeholder="Search people..."
                      style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--border-default)', borderRadius: 8, marginBottom: 10, fontSize: 14, boxSizing: 'border-box' }}
                    />
                    <div style={{ flex: 1, overflowY: 'auto', border: '1px solid var(--border-subtle)', borderRadius: 8 }}>
                      {list.length === 0 && (
                        <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-subtle)', fontSize: 13 }}>
                          {forwardUsers.length === 0 ? 'Loading people…' : 'No matches'}
                        </div>
                      )}
                      {list.map(u => {
                        const checked = forwardSelected.has(u.id);
                        return (
                          <label key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', cursor: 'pointer', background: checked ? '#eff6ff' : 'transparent' }}>
                            <input type="checkbox" checked={checked} onChange={() => toggleForwardUser(u.id)} />
                            <div style={{ width: 30, height: 30, borderRadius: '50%', overflow: 'hidden', background: 'var(--surface-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: 'var(--text-muted)', flex: '0 0 auto' }}>
                              {u.headshotUrl ? <img src={u.headshotUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (u.name?.[0]?.toUpperCase() || '?')}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.name}</div>
                              {u.role && <div style={{ fontSize: 11, color: 'var(--text-subtle)' }}>{u.role}</div>}
                            </div>
                          </label>
                        );
                      })}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 12 }}>
                      <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{forwardSelected.size} selected</span>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button type="button" onClick={() => setForwardMsg(null)} style={{ padding: '8px 16px', background: 'var(--surface-subtle)', border: 'none', borderRadius: 8, cursor: 'pointer' }}>Cancel</button>
                        <button type="button" onClick={sendForward} disabled={forwardSelected.size === 0 || forwardSending} style={{ padding: '8px 16px', background: forwardSelected.size === 0 || forwardSending ? '#fca5a5' : '#CB0002', color: 'var(--text-inverse)', border: 'none', borderRadius: 8, cursor: forwardSelected.size === 0 || forwardSending ? 'not-allowed' : 'pointer', fontWeight: 600 }}>{forwardSending ? 'Sending…' : 'Send'}</button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}
            {recState !== 'idle' ? (
              <div role="status" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '2px 0' }}>
                <button type="button" onClick={() => stopRecording(true)} disabled={recState === 'sending'} aria-label="Cancel voice message" style={COMPOSER_BTN}>✕</button>
                <div style={{ flex: 1, fontSize: 14, color: 'var(--text-primary)' }}>
                  {recState === 'sending' ? 'Sending voice message…' : (
                    <>🔴 Recording {formatDuration(recSeconds)} <span style={{ color: 'var(--text-subtle)' }}>/ {formatDuration(VOICE_MAX_SEC)}</span></>
                  )}
                </div>
                <button type="button" onClick={() => stopRecording(false)} disabled={recState === 'sending'} aria-label="Send voice message"
                  style={{ padding: '10px 16px', backgroundColor: MY_BUBBLE, color: 'var(--text-inverse)', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 18, fontWeight: 600 }}>
                  ➤
                </button>
              </div>
            ) : (
            <div className="storm-composer" style={{ display: 'flex', gap: 8, alignItems: 'flex-end', position: 'relative' }}>
            {/* Emoji picker */}
            {showEmoji && (
              <div style={{ position: 'absolute', bottom: 56, left: 0, width: 296, maxHeight: 220, overflowY: 'auto', background: 'var(--surface-default)', border: '1px solid var(--border-default)', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', padding: 8, display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 2, zIndex: 30 }}>
                {CHAT_EMOJIS.map((e) => (
                  <button key={e} type="button" onClick={() => { setNewMessage(prev => prev + e); }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, padding: 4, borderRadius: 6, lineHeight: 1 }}
                    onMouseEnter={(ev) => (ev.currentTarget.style.background = 'var(--surface-subtle)')}
                    onMouseLeave={(ev) => (ev.currentTarget.style.background = 'none')}>{e}</button>
                ))}
              </div>
            )}
            {/* GIPHY GIF / sticker picker */}
            {giphyOpen && (
              <div style={{ position: 'absolute', bottom: 56, left: 0, width: 320, maxHeight: 360, background: 'var(--surface-default)', border: '1px solid var(--border-default)', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.14)', display: 'flex', flexDirection: 'column', overflow: 'hidden', zIndex: 30 }}>
                {/* GIF | Stickers tabs */}
                <div style={{ display: 'flex', gap: 4, padding: 6, borderBottom: '1px solid #f0f0f0' }}>
                  {(['gifs', 'stickers'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => { setGiphyMode(m); loadGiphy(m, giphyQuery); }}
                      style={{ flex: 1, padding: '6px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 12,
                        background: giphyMode === m ? 'var(--surface-inverse)' : 'var(--surface-subtle)', color: giphyMode === m ? 'var(--text-inverse)' : 'var(--text-muted)' }}
                    >
                      {m === 'gifs' ? 'GIF' : 'Stickers'}
                    </button>
                  ))}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: 8, borderBottom: '1px solid #f0f0f0' }}>
                  <input
                    autoFocus
                    value={giphyQuery}
                    onChange={(e) => { setGiphyQuery(e.target.value); loadGiphy(giphyMode, e.target.value); }}
                    placeholder={`Search ${giphyMode === 'stickers' ? 'stickers' : 'GIFs'}…`}
                    style={{ flex: 1, padding: '7px 10px', border: '1px solid var(--border-default)', borderRadius: 8, fontSize: 13, outline: 'none' }}
                  />
                  <button type="button" onClick={() => setGiphyOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--text-subtle)', lineHeight: 1 }}>×</button>
                </div>
                <div style={{ flex: 1, overflowY: 'auto', padding: 6 }}>
                  {giphyLoading ? (
                    <div style={{ textAlign: 'center', color: 'var(--text-subtle)', fontSize: 13, padding: 20 }}>Loading…</div>
                  ) : giphyItems.length === 0 ? (
                    <div style={{ textAlign: 'center', color: 'var(--text-subtle)', fontSize: 13, padding: 20 }}>No results</div>
                  ) : (
                    <div style={{ columnCount: 2, columnGap: 6 }}>
                      {giphyItems.map((it) => (
                        <img
                          key={it.id}
                          src={it.preview}
                          alt=""
                          onClick={() => sendGiphy(it.url)}
                          style={{ width: '100%', marginBottom: 6, borderRadius: 6, cursor: 'pointer', display: 'block' }}
                        />
                      ))}
                    </div>
                  )}
                </div>
                <div style={{ textAlign: 'right', fontSize: 9, color: '#c4c9d2', padding: '2px 8px' }}>Powered by GIPHY</div>
              </div>
            )}
            <button
              type="button"
              onClick={() => setShowEmoji(v => !v)}
              title="Emoji"
              style={{ ...COMPOSER_BTN, backgroundColor: showEmoji ? 'var(--surface-muted)' : 'var(--surface-subtle)' }}
            >
              😊
            </button>
            {/* GIF/Stickers: one button opens the GIPHY picker (tabs inside). */}
            <button
              type="button"
              onClick={() => openGiphy('gifs')}
              title="GIFs & Stickers"
              style={{ ...COMPOSER_BTN, backgroundColor: giphyOpen ? 'var(--surface-muted)' : 'var(--surface-subtle)', fontSize: 13, fontWeight: 700, color: 'var(--text-muted)' }}
            >
              GIF
            </button>
            {!isDirect && (
              <button
                type="button"
                onClick={() => setShowPoll(true)}
                style={COMPOSER_BTN}
                title="Create a poll"
              >
                📊
              </button>
            )}
            <div style={{ position: 'relative', flex: '0 0 auto' }}>
              <button
                type="button"
                onClick={() => setAttachOpen((v) => !v)}
                disabled={uploading}
                aria-haspopup="menu"
                aria-expanded={attachOpen}
                aria-label="Attach photos, a file or your location"
                title="Attach photos, a file or your location"
                style={{ ...COMPOSER_BTN, cursor: uploading ? 'not-allowed' : 'pointer' }}
              >
                {uploading ? '⏳' : '📎'}
              </button>
              {attachOpen && (
                <>
                  <div onClick={() => setAttachOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
                  <div role="menu" style={{ position: 'absolute', bottom: '100%', left: 0, marginBottom: 8, zIndex: 50, background: 'var(--surface-default)', border: '1px solid var(--border-default)', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.14)', minWidth: 240, overflow: 'hidden' }}>
                    <button role="menuitem" type="button" onClick={() => { setAttachOpen(false); photosInputRef.current?.click(); }} style={MENU_ITEM}>📷 Photos or videos (up to {ALBUM_MAX})</button>
                    <button role="menuitem" type="button" onClick={() => { setAttachOpen(false); fileInputRef.current?.click(); }} style={MENU_ITEM}>📄 File</button>
                    <button role="menuitem" type="button" onClick={shareLocation} style={MENU_ITEM}>📍 My location</button>
                  </div>
                </>
              )}
            </div>
            <input
              ref={photosInputRef}
              type="file"
              accept="image/*,video/*"
              multiple
              style={{ display: 'none' }}
              onChange={(e) => {
                const files = Array.from(e.target.files || []);
                // Let the same photos be picked again next time.
                e.target.value = '';
                handlePhotos(files);
              }}
            />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.rar,application/pdf"
              style={{ display: 'none' }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileUpload(file);
                // Let the same file be picked again next time.
                e.target.value = '';
              }}
            />
            
            <textarea
              ref={composerRef}
              value={newMessage}
              onChange={(e) => {
                const val = e.target.value;
                setNewMessage(val);
                // Show the @mention list while typing "@…" at the end (groups only).
                const m = val.match(/@([^\s@]*)$/);
                setMentionQuery(!isDirect && m ? m[1] : null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape' && editingMsg) { e.preventDefault(); cancelEdit(); return; }
                if (enterSendsMessage({ key: e.key, shiftKey: e.shiftKey, touchScreen })) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              maxLength={2000}
              placeholder={editingMsg ? 'Edit your message' : 'Type a message...'}
              disabled={sending}
              style={{
                flex: 1,
                padding: '10px 14px',
                border: '1px solid var(--border-default)',
                borderRadius: 8,
                fontSize: 14,
                resize: 'none',
                minHeight: 44,
                maxHeight: 120,
                fontFamily: 'inherit',
                backgroundColor: 'var(--surface-subtle)',
                color: 'var(--text-primary)',
                outline: 'none'
              }}
              rows={1}
            />
            {newMessage.length > 1800 && (
              <span aria-live="polite" style={{ alignSelf: 'center', fontSize: 11, whiteSpace: 'nowrap', color: newMessage.length >= 2000 ? '#dc2626' : 'var(--text-subtle)' }}>
                {newMessage.length.toLocaleString('en-US')} / 2,000
              </span>
            )}
            
            {!newMessage.trim() && !editingMsg && canRecord ? (
              <button
                type="button"
                onClick={startRecording}
                aria-label="Record a voice message"
                title="Record a voice message (up to 5 minutes)"
                style={{ padding: '10px 16px', backgroundColor: 'var(--surface-muted)', color: 'var(--text-primary)', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 18, fontWeight: 600 }}
              >
                🎤
              </button>
            ) : (
            <button
              type="button"
              onClick={sendMessage}
              disabled={!newMessage.trim() || sending}
              style={{
                padding: '10px 16px',
                backgroundColor: newMessage.trim() ? MY_BUBBLE : 'var(--surface-muted)',
                color: 'var(--text-inverse)',
                border: 'none',
                borderRadius: 8,
                cursor: newMessage.trim() && !sending ? 'pointer' : 'not-allowed',
                fontSize: 18,
                fontWeight: 600
              }}
            >
              {sending ? '⏳' : '➤'}
            </button>
            )}
          </div>
          )}
          {!touchScreen && (
            <div style={{ fontSize: 11, color: 'var(--text-subtle)', marginTop: 4, textAlign: 'right' }}>
              Enter to send, Shift + Enter for a new line
            </div>
          )}
            </div>
          </div>
        )}
      </div>

      {/* Fullscreen image viewer with a Save button (like the app's viewer) */}
      {viewerImage && (
        <div
          onClick={() => setViewerImage(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <div style={{ position: 'absolute', top: 16, right: 16, display: 'flex', gap: 10 }}>
            <button
              onClick={(e) => { e.stopPropagation(); downloadMedia(viewerImage); }}
              title="Save"
              style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: 'rgb(var(--white-rgb) / 0.15)', color: 'var(--text-inverse)', cursor: 'pointer', fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}
            >⬇ Save</button>
            <button
              onClick={() => setViewerImage(null)}
              title="Close"
              style={{ width: 38, height: 38, borderRadius: 8, border: 'none', background: 'rgb(var(--white-rgb) / 0.15)', color: 'var(--text-inverse)', cursor: 'pointer', fontSize: 20, lineHeight: 1 }}
            >×</button>
          </div>
          <img
            src={viewerImage}
            alt=""
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '92vw', maxHeight: '88vh', objectFit: 'contain', borderRadius: 8 }}
          />
        </div>
      )}
    </div>
  );
}
