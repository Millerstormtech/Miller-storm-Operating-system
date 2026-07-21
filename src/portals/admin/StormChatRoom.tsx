import { useState, useEffect, useRef } from "react";
import { appConfirm } from "../../lib/appDialogs";
import { useAuth } from "../../contexts/AuthContext";

type ChatMessage = {
  _id: string;
  groupId: string;
  senderId: string;
  senderName: string;
  senderRole: string;
  message: string;
  messageType: 'text' | 'image' | 'video' | 'file' | 'poll' | 'system';
  mediaUrl?: string;
  poll?: { question: string; options: { text: string; votes: string[] }[]; allowMultiple: boolean };
  replyTo?: string;
  replyToMessage?: string;
  replyToSender?: string;
  reactions?: { emoji: string; userId: string; userName: string }[];
  createdAt: Date;
};

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
  backgroundColor: '#f3f4f6',
  border: 'none',
  borderRadius: 8,
  cursor: 'pointer',
  fontSize: 18,
  lineHeight: 1,
};

// Quick-reaction row shown on a message (matches the app's reaction tray).
const REACTION_EMOJIS = ['👍', '❤️', '😂', '🎉', '🔥', '😢', '👎'];

const CHAT_EMOJIS = ["😀","😃","😄","😁","😆","😅","😂","🤣","😊","😇","🙂","🙃","😉","😌","😍","🥰","😘","😋","😛","😜","🤪","🤨","🧐","🤓","😎","🥳","😏","😒","😔","😟","🙁","😣","😖","😫","😩","🥺","😢","😭","😤","😠","😡","🤬","🤯","😳","🥵","🥶","😱","😨","😰","😥","🤗","🤔","🤭","🤫","🤥","😶","😐","😑","🙄","😮","😲","🥱","😴","🤤","🤢","🤮","🤧","😷","🤒","🤑","🤠","😈","👍","👎","👌","✌️","🤞","🤟","🤘","🤙","👈","👉","👆","👇","👋","🙌","🤝","🙏","💪","🔥","⭐","🌟","✨","💯","✅","❌","❤️","🧡","💛","💚","💙","💜","🖤","💔","🎉","🎊","🚀","💰","📈","🏆","🥇","💡","👀","🎯"];

export function StormChatRoom({ group, onBack, isMember, title, onMessagePrivately }: Props) {
  const { user } = useAuth();
  const isDirect = !!group.isDirect;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
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
  const [blinkingMessageId, setBlinkingMessageId] = useState<string | null>(null);
  const messageRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});
  const [hoveredMessageId, setHoveredMessageId] = useState<string | null>(null);
  const [menuMessageId, setMenuMessageId] = useState<string | null>(null);
  // WhatsApp-style reaction bar: which message's emoji picker is open, and
  // whether the full emoji grid ("+") is expanded within it.
  const [reactionPickerId, setReactionPickerId] = useState<string | null>(null);
  const [reactionPickerExpanded, setReactionPickerExpanded] = useState(false);
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
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
    if (!await appConfirm('Delete this message?')) return;
    try {
      const res = await fetch(`/api/storm-chat/messages/${group._id}`, {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId }),
      });
      if (res.ok) setMessages(prev => prev.filter(m => m._id !== messageId));
      else alert('Failed to delete message');
    } catch {
      alert('Failed to delete message');
    }
  }

  // Check if user can send messages
  const isGroupMember = isMember || group.members.includes(user?._id || user?.id || '');
  const isAdmin = user?.role === 'admin';
  const isGroupAdmin = group.admins.includes(user?._id || user?.id || '');
  
  const canSendMessage = isAdmin || isGroupAdmin || (group.onlyAdminCanChat ? false : isGroupMember);

  useEffect(() => {
    fetchMessages();
    const interval = setInterval(fetchMessages, 3000); // Poll every 3 seconds
    return () => clearInterval(interval);
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

  function scrollToMessage(messageId: string) {
    const messageElement = messageRefs.current[messageId];
    if (messageElement) {
      messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      
      // Start blinking
      setBlinkingMessageId(messageId);
      
      // Stop blinking after 1 second (2 blinks)
      setTimeout(() => {
        setBlinkingMessageId(null);
      }, 1000);
    }
  }

  function handleScroll() {
    if (messagesContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current;
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
      setShouldAutoScroll(isAtBottom);
    }
  }

  async function fetchMessages() {
    try {
      const userId = user?._id || user?.id;
      const userRole = user?.role;
      const response = await fetch(`/api/storm-chat/messages/${group._id}?userId=${userId}&userRole=${userRole}`);
      if (response.ok) {
        const data = await response.json();
        if (data.length > messages.length) {
          console.log(`[STORM-CHAT] 📥 Received ${data.length - messages.length} new messages`);
        }
        setMessages(data);
      } else {
        const error = await response.json();
        console.error(`[STORM-CHAT] ❌ Failed to fetch messages:`, error);
        alert(error.error || 'Failed to fetch messages');
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
          poll: { question: q, options: opts, allowMultiple: pollMultiple },
        }),
      });
      if (response.ok) {
        const message = await response.json();
        setMessages(prev => [...prev, message]);
        setShowPoll(false);
        setPollQuestion("");
        setPollOptions(["", ""]);
        setPollMultiple(false);
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
      body.poll = { question: m.poll.question, options: m.poll.options.map(o => o.text), allowMultiple: m.poll.allowMultiple };
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

  function formatTime(date: Date) {
    // Convert UTC to CT (UTC-5:00 for CDT - Central Daylight Time)
    const d = new Date(date);
    const utcTime = d.getTime();
    const ctTime = new Date(utcTime - (5 * 60 * 60 * 1000));
    const hours = ctTime.getHours().toString().padStart(2, '0');
    const minutes = ctTime.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  function formatDate(date: Date) {
    // Convert UTC to CT (UTC-5:00 for CDT - Central Daylight Time)
    const d = new Date(date);
    const utcTime = d.getTime();
    const ctDate = new Date(utcTime - (5 * 60 * 60 * 1000));
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (ctDate.toDateString() === today.toDateString()) return 'Today';
    if (ctDate.toDateString() === yesterday.toDateString()) return 'Yesterday';
    
    return ctDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function renderTextWithLinks(text: string, textColor: string) {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    // Highlight @Name mentions using the group's member names (longest first so
    // "@John Doe" wins over "@John"). Names come from the mention autocomplete list.
    const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const names = members.map(m => m.name).filter(Boolean).sort((a, b) => b.length - a.length);
    const mentionSet = new Set(names.map(n => '@' + n));
    const mentionRegex = names.length ? new RegExp(`(@(?:${names.map(esc).join('|')}))`, 'g') : null;
    const onColoredBubble = textColor === '#fff';
    const mentionColor = onColoredBubble ? '#ffffff' : '#1d4ed8';
    const mentionBg = onColoredBubble ? 'rgba(255,255,255,0.25)' : 'rgba(37,99,235,0.12)';

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
              color: textColor === '#fff' ? '#93c5fd' : '#2563eb',
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
            background: '#fff', border: '1px solid #e5e7eb',
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
              background: '#fff', borderRadius: 22,
              boxShadow: '0 6px 20px rgba(0,0,0,0.18)', border: '1px solid #eee',
              padding: '5px 8px', display: 'flex', alignItems: 'center', gap: 2, zIndex: 1200,
            }}
          >
            {REACTION_EMOJIS.map((em) => (
              <button
                key={em}
                onClick={() => { toggleReaction(msg._id, em); setReactionPickerId(null); }}
                title={em}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 22, padding: 3, borderRadius: '50%', lineHeight: 1 }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#f3f4f6'; e.currentTarget.style.transform = 'scale(1.15)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; e.currentTarget.style.transform = 'scale(1)'; }}
              >
                {em}
              </button>
            ))}
            <button
              onClick={() => setReactionPickerExpanded(v => !v)}
              title="More"
              style={{ background: '#f3f4f6', border: 'none', cursor: 'pointer', fontSize: 16, width: 30, height: 30, borderRadius: '50%', lineHeight: 1, color: '#6b7280', marginLeft: 2 }}
            >
              +
            </button>
            {reactionPickerExpanded && (
              <div style={{ position: 'absolute', top: '100%', marginTop: 6, ...(isMyMessage ? { right: 0 } : { left: 0 }), width: 300, maxHeight: 200, overflowY: 'auto', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.15)', padding: 8, display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 2, zIndex: 1300 }}>
                {CHAT_EMOJIS.map((em) => (
                  <button
                    key={em}
                    onClick={() => { toggleReaction(msg._id, em); setReactionPickerId(null); setReactionPickerExpanded(false); }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, padding: 4, borderRadius: 6, lineHeight: 1 }}
                    onMouseEnter={(ev) => (ev.currentTarget.style.background = '#f3f4f6')}
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

  function renderMessage(msg: ChatMessage, index: number) {
    const isMyMessage = msg.senderId === (user?._id || user?.id);
    const showDate = index === 0 ||
      new Date(messages[index - 1].createdAt).toDateString() !== new Date(msg.createdAt).toDateString();
    const isBlinking = blinkingMessageId === msg._id;
    const isHovered = hoveredMessageId === msg._id;
    const showMenu = menuMessageId === msg._id;

    // System notices (e.g. "X joined the group") render as a centered gray pill.
    if (msg.messageType === 'system') {
      return (
        <div key={msg._id} style={{ display: 'flex', justifyContent: 'center', margin: '10px 0' }}>
          <span style={{ background: '#eef2f7', color: '#6b7280', fontSize: 12, padding: '4px 12px', borderRadius: 12 }}>
            {msg.message}
          </span>
        </div>
      );
    }

    return (
      <div key={msg._id} ref={(el) => { messageRefs.current[msg._id] = el; }}>
        {showDate && (
          <div style={{ 
            textAlign: 'center', 
            margin: '16px 0',
            fontSize: 12,
            color: '#6b7280'
          }}>
            <span style={{ 
              backgroundColor: '#f3f4f6',
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
            marginBottom: 8,
            transition: 'background-color 0.25s',
            backgroundColor: isBlinking ? 'rgba(250, 204, 21, 0.3)' : 'transparent',
            borderRadius: 16,
            padding: isBlinking ? 4 : 0,
            position: 'relative'
          }}>
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
              <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4, marginLeft: 8 }}>
                {msg.senderName}
              </div>
            )}

            {/* Message body wrapper: the reaction 🙂 button anchors here (only the
                bubble), so it lines up with the ⋮ button — not shifted by the
                sender name above or reaction badges below. */}
            <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: isMyMessage ? 'flex-end' : 'flex-start' }}>
            {reactionAffordance(msg, isMyMessage)}
            {msg.messageType === 'poll' && msg.poll && (() => {
              // Percentage is out of the group's total members, not just the votes
              // cast — so a single vote in a 9-member group reads ~11%, not 100%.
              const totalMembers = Math.max(group.members?.length || 0, 1);
              const voterSet = new Set<string>();
              msg.poll.options.forEach(o => (o.votes || []).forEach(v => voterSet.add(v)));
              const votersCount = voterSet.size;
              const myId = user?._id || user?.id || '';
              return (
                <div style={{ position: 'relative', backgroundColor: isMyMessage ? '#DC2626' : '#f3f4f6', color: isMyMessage ? '#fff' : '#111827', padding: 14, borderRadius: 16, minWidth: 260, maxWidth: 340 }}>
                  {(isMyMessage || (isAdmin && !isDirect)) && (
                    <button
                      onClick={() => deleteMessage(msg._id)}
                      title="Delete poll"
                      style={{ position: 'absolute', top: 8, right: 8, width: 26, height: 26, borderRadius: '50%', border: 'none', background: isMyMessage ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.08)', color: 'inherit', cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                      🗑
                    </button>
                  )}
                  <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 10, paddingRight: (isMyMessage || (isAdmin && !isDirect)) ? 28 : 0 }}>📊 {msg.poll.question}</div>
                  {msg.poll.options.map((opt, i) => {
                    const votes = opt.votes?.length || 0;
                    const pct = Math.round((votes / totalMembers) * 100);
                    const voted = (opt.votes || []).includes(myId);
                    return (
                      <button key={i} type="button" onClick={() => votePoll(msg._id, i)}
                        style={{ display: 'block', width: '100%', textAlign: 'left', position: 'relative', border: `1px solid ${isMyMessage ? 'rgba(255,255,255,0.4)' : '#e5e7eb'}`, background: 'transparent', borderRadius: 8, padding: '8px 10px', marginBottom: 6, cursor: 'pointer', overflow: 'hidden', color: 'inherit' }}>
                        <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: `${pct}%`, background: isMyMessage ? 'rgba(255,255,255,0.2)' : 'rgba(37,99,235,0.12)' }} />
                        <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13, fontWeight: voted ? 700 : 500 }}>
                          <span>{voted ? '✓ ' : ''}{opt.text}</span>
                          <span style={{ whiteSpace: 'nowrap' }}>{votes} · {pct}%</span>
                        </div>
                      </button>
                    );
                  })}
                  <div style={{ fontSize: 11, opacity: 0.8, marginTop: 2 }}>{votersCount} of {totalMembers} voted · tap to vote{msg.poll.allowMultiple ? ' (multiple)' : ''}</div>
                </div>
              );
            })()}
            {msg.messageType === 'text' && (
              <div
                style={{
                  backgroundColor: isMyMessage ? '#DC2626' : '#f3f4f6',
                  color: isMyMessage ? '#fff' : '#111827',
                  padding: '10px 14px',
                  borderRadius: 16,
                  borderTopRightRadius: isMyMessage ? 4 : 16,
                  borderTopLeftRadius: isMyMessage ? 16 : 4,
                  wordBreak: 'break-word',
                  position: 'relative'
                }}>
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
                    color: '#9ca3af',
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
                      backgroundColor: '#1f2937',
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
                        style={{ width: '100%', padding: '10px 16px', background: 'none', border: 'none', color: '#fff', cursor: 'pointer', textAlign: 'left', fontSize: 14, display: 'flex', alignItems: 'center', gap: 12 }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#374151'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                      >
                        ✉️ Message privately
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setReplyingTo(msg);
                        setMenuMessageId(null);
                      }}
                      style={{
                        width: '100%',
                        padding: '10px 16px',
                        background: 'none',
                        border: 'none',
                        color: '#fff',
                        cursor: 'pointer',
                        textAlign: 'left',
                        fontSize: 14,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#374151'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                      ↩ Reply
                    </button>
                    <button
                      onClick={() => openForward(msg)}
                      style={{
                        width: '100%',
                        padding: '10px 16px',
                        background: 'none',
                        border: 'none',
                        color: '#fff',
                        cursor: 'pointer',
                        textAlign: 'left',
                        fontSize: 14,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#374151'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                      ➦ Forward
                    </button>
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
                        color: '#fff',
                        cursor: 'pointer',
                        textAlign: 'left',
                        fontSize: 14,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#374151'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                      📋 Copy
                    </button>
                    {(isMyMessage || (isAdmin && !isDirect)) && (
                      <button
                        onClick={() => { deleteMessage(msg._id); setMenuMessageId(null); }}
                        style={{ width: '100%', padding: '10px 16px', background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', textAlign: 'left', fontSize: 14, display: 'flex', alignItems: 'center', gap: 12 }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#374151'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                      >
                        🗑 Delete
                      </button>
                    )}
                  </div>
                )}
                
                {/* Reply preview */}
                {msg.replyTo && msg.replyToMessage && (
                  <div 
                    onClick={() => scrollToMessage(msg.replyTo!)}
                    style={{
                      marginBottom: 6,
                      padding: 8,
                      backgroundColor: isMyMessage ? 'rgba(255, 255, 255, 0.2)' : '#fff',
                      borderRadius: 8,
                      borderLeft: `3px solid ${isMyMessage ? '#fff' : '#DC2626'}`,
                      cursor: 'pointer'
                    }}
                  >
                    <div style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: isMyMessage ? '#fff' : '#DC2626',
                      marginBottom: 2
                    }}>
                      {msg.replyToSender || 'Unknown'}
                    </div>
                    <div style={{
                      fontSize: 12,
                      color: isMyMessage ? 'rgba(255, 255, 255, 0.8)' : '#6b7280',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}>
                      {msg.replyToMessage}
                    </div>
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
                  <div style={{ fontSize: 14, flex: 1 }}>
                    {renderTextWithLinks(msg.message, isMyMessage ? '#fff' : '#111827')}
                  </div>
                  <div style={{ 
                    fontSize: 10, 
                    color: isMyMessage ? 'rgba(255, 255, 255, 0.7)' : '#9ca3af',
                    whiteSpace: 'nowrap',
                    alignSelf: 'flex-end'
                  }}>
                    {formatTime(msg.createdAt)}
                  </div>
                </div>
              </div>
            )}
            
            {msg.messageType === 'image' && msg.mediaUrl && (
              <div style={{ position: 'relative', display: 'inline-block' }}>
                <img
                  src={msg.mediaUrl}
                  alt="Image"
                  onClick={() => setViewerImage(msg.mediaUrl!)}
                  style={{ maxWidth: 300, maxHeight: 300, borderRadius: 8, display: 'block', cursor: 'pointer' }}
                />
                <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: 6 }}>
                  {(isMyMessage || (isAdmin && !isDirect)) && (
                    <button onClick={() => deleteMessage(msg._id)} title="Delete"
                      style={{ width: 32, height: 32, borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,0.55)', color: '#fff', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>🗑</button>
                  )}
                  <button onClick={() => downloadMedia(msg.mediaUrl!)} title="Save"
                    style={{ width: 32, height: 32, borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,0.55)', color: '#fff', cursor: 'pointer', fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>⬇</button>
                </div>
              </div>
            )}

            {msg.messageType === 'video' && msg.mediaUrl && (
              <div style={{ position: 'relative', display: 'inline-block' }}>
                <video
                  src={msg.mediaUrl}
                  controls
                  style={{ maxWidth: 300, maxHeight: 300, borderRadius: 8, display: 'block' }}
                />
                <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: 6 }}>
                  {(isMyMessage || (isAdmin && !isDirect)) && (
                    <button onClick={() => deleteMessage(msg._id)} title="Delete"
                      style={{ width: 32, height: 32, borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,0.55)', color: '#fff', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>🗑</button>
                  )}
                  <button onClick={() => downloadMedia(msg.mediaUrl!)} title="Save"
                    style={{ width: 32, height: 32, borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,0.55)', color: '#fff', cursor: 'pointer', fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>⬇</button>
                </div>
              </div>
            )}
            
            {msg.messageType === 'file' && msg.mediaUrl && (
              <div style={{ 
                backgroundColor: isMyMessage ? '#DC2626' : '#f3f4f6',
                color: isMyMessage ? '#fff' : '#111827',
                padding: '10px 14px',
                borderRadius: 16,
                borderTopRightRadius: isMyMessage ? 4 : 16,
                borderTopLeftRadius: isMyMessage ? 16 : 4,
                wordBreak: 'break-word'
              }}>
                <a 
                  href={msg.mediaUrl} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  style={{ 
                    color: isMyMessage ? '#fff' : '#DC2626',
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
              const counts: Record<string, { count: number; mine: boolean }> = {};
              msg.reactions.forEach(r => {
                if (!counts[r.emoji]) counts[r.emoji] = { count: 0, mine: false };
                counts[r.emoji].count += 1;
                if (r.userId === myId) counts[r.emoji].mine = true;
              });
              return (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: -11, marginRight: isMyMessage ? 6 : 0, marginLeft: isMyMessage ? 0 : 6, justifyContent: isMyMessage ? 'flex-end' : 'flex-start', position: 'relative', zIndex: 3 }}>
                  {Object.entries(counts).map(([em, { count, mine }]) => (
                    <button
                      key={em}
                      onClick={() => toggleReaction(msg._id, em)}
                      title={mine ? 'Remove your reaction' : 'React'}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 2,
                        background: '#fff',
                        border: `1px solid ${mine ? '#93c5fd' : '#e5e7eb'}`,
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
      backgroundColor: '#fff',
      borderRadius: 12,
      overflow: 'hidden',
      border: '1px solid #e5e7eb'
    }}>
      {/* Header */}
      <div style={{ 
        padding: 16,
        borderBottom: '1px solid #e5e7eb',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        backgroundColor: '#f9fafb'
      }}>
        <button 
          onClick={onBack}
          style={{ 
            background: 'none',
            border: 'none',
            fontSize: 20,
            cursor: 'pointer',
            padding: 4
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
          color: '#fff'
        }}>
          {!group.imageUrl && '👥'}
        </div>
        
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: '#111827' }}>
            {title || group.name}
          </div>
          <div style={{ fontSize: 12, color: '#6b7280' }}>
            {isDirect ? 'Private message' : `${group.members.length} members`}
            {!isDirect && group.onlyAdminCanChat && ' • Admin-only chat'}
          </div>
        </div>
      </div>

      {/* Messages */}
      <div 
        ref={messagesContainerRef}
        onScroll={handleScroll}
        style={{ 
          flex: 1,
          overflowY: 'auto',
          padding: 16,
          backgroundColor: '#fafafa'
        }}
      >
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>
            Loading messages...
          </div>
        ) : messages.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>💬</div>
            <div>No messages yet. Start the conversation!</div>
          </div>
        ) : (
          messages.map((msg, index) => renderMessage(msg, index))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div style={{ 
        padding: 16,
        borderTop: '1px solid #e5e7eb',
        backgroundColor: '#fff'
      }}>
        {!canSendMessage ? (
          <div style={{ 
            textAlign: 'center',
            padding: 12,
            backgroundColor: '#fef2f2',
            borderRadius: 8,
            color: '#dc2626',
            fontSize: 14
          }}>
            🔒 Only admins can send messages in this group
          </div>
        ) : (
          <div>
            {/* Reply preview */}
            {replyingTo && (
              <div style={{
                marginBottom: 8,
                padding: 8,
                backgroundColor: '#f3f4f6',
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
                  <div style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }}>
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
                    color: '#6b7280',
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
              const matches = members.filter(mm => (mm.name || '').toLowerCase().includes(q)).slice(0, 6);
              if (matches.length === 0) return null;
              return (
                <div style={{ position: 'absolute', bottom: '100%', left: 0, right: 0, marginBottom: 8, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.14)', maxHeight: 200, overflowY: 'auto', zIndex: 60 }}>
                  {matches.map(mm => (
                    <button key={mm._id} type="button" onClick={() => insertMention(mm.name)}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '8px 12px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = '#f3f4f6')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}>
                      <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#4b5563', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0, fontSize: 12 }}>
                        {mm.headshotUrl ? <img src={mm.headshotUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (mm.name?.[0]?.toUpperCase() || '?')}
                      </div>
                      <span style={{ fontSize: 14, fontWeight: 500, color: '#1f2937' }}>{mm.name}</span>
                    </button>
                  ))}
                </div>
              );
            })()}
            {showPoll && (
              <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }} onClick={() => setShowPoll(false)}>
                <div style={{ background: '#fff', borderRadius: 12, padding: 20, width: 380, maxWidth: '90vw', maxHeight: '80vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
                  <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Create a poll</div>
                  <input value={pollQuestion} onChange={e => setPollQuestion(e.target.value)} placeholder="Ask a question..." style={{ width: '100%', padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: 8, marginBottom: 12, fontSize: 14, boxSizing: 'border-box' }} />
                  {pollOptions.map((opt, i) => (
                    <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                      <input value={opt} onChange={e => setPollOptions(prev => prev.map((o, idx) => idx === i ? e.target.value : o))} placeholder={`Option ${i + 1}`} style={{ flex: 1, padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' }} />
                      {pollOptions.length > 2 && (
                        <button type="button" onClick={() => setPollOptions(prev => prev.filter((_, idx) => idx !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: 20 }}>×</button>
                      )}
                    </div>
                  ))}
                  {pollOptions.length < 10 && (
                    <button type="button" onClick={() => setPollOptions(prev => [...prev, ''])} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#2563eb', fontSize: 13, fontWeight: 600, marginBottom: 12, padding: 0 }}>+ Add option</button>
                  )}
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, fontSize: 13, color: '#374151', cursor: 'pointer' }}>
                    <input type="checkbox" checked={pollMultiple} onChange={e => setPollMultiple(e.target.checked)} /> Allow multiple answers
                  </label>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                    <button type="button" onClick={() => setShowPoll(false)} style={{ padding: '8px 16px', background: '#f3f4f6', border: 'none', borderRadius: 8, cursor: 'pointer' }}>Cancel</button>
                    <button type="button" onClick={sendPoll} disabled={!pollQuestion.trim() || pollOptions.filter(o => o.trim()).length < 2 || sending} style={{ padding: '8px 16px', background: '#CB0002', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>Send Poll</button>
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
                : '📎 File';
              return (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }} onClick={() => setForwardMsg(null)}>
                  <div style={{ background: '#fff', borderRadius: 12, padding: 18, width: 420, maxWidth: '92vw', maxHeight: '82vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
                    <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Forward message</div>
                    <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 12, padding: '6px 10px', background: '#f3f4f6', borderRadius: 8, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{preview}</div>
                    <input
                      value={forwardSearch}
                      onChange={e => setForwardSearch(e.target.value)}
                      placeholder="Search people..."
                      style={{ width: '100%', padding: '9px 12px', border: '1px solid #e5e7eb', borderRadius: 8, marginBottom: 10, fontSize: 14, boxSizing: 'border-box' }}
                    />
                    <div style={{ flex: 1, overflowY: 'auto', border: '1px solid #f3f4f6', borderRadius: 8 }}>
                      {list.length === 0 && (
                        <div style={{ padding: 16, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
                          {forwardUsers.length === 0 ? 'Loading people…' : 'No matches'}
                        </div>
                      )}
                      {list.map(u => {
                        const checked = forwardSelected.has(u.id);
                        return (
                          <label key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', cursor: 'pointer', background: checked ? '#eff6ff' : 'transparent' }}>
                            <input type="checkbox" checked={checked} onChange={() => toggleForwardUser(u.id)} />
                            <div style={{ width: 30, height: 30, borderRadius: '50%', overflow: 'hidden', background: '#e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: '#6b7280', flex: '0 0 auto' }}>
                              {u.headshotUrl ? <img src={u.headshotUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (u.name?.[0]?.toUpperCase() || '?')}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 14, fontWeight: 500, color: '#1f2937', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.name}</div>
                              {u.role && <div style={{ fontSize: 11, color: '#9ca3af' }}>{u.role}</div>}
                            </div>
                          </label>
                        );
                      })}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 12 }}>
                      <span style={{ fontSize: 13, color: '#6b7280' }}>{forwardSelected.size} selected</span>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button type="button" onClick={() => setForwardMsg(null)} style={{ padding: '8px 16px', background: '#f3f4f6', border: 'none', borderRadius: 8, cursor: 'pointer' }}>Cancel</button>
                        <button type="button" onClick={sendForward} disabled={forwardSelected.size === 0 || forwardSending} style={{ padding: '8px 16px', background: forwardSelected.size === 0 || forwardSending ? '#fca5a5' : '#CB0002', color: '#fff', border: 'none', borderRadius: 8, cursor: forwardSelected.size === 0 || forwardSending ? 'not-allowed' : 'pointer', fontWeight: 600 }}>{forwardSending ? 'Sending…' : 'Send'}</button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}
            <div className="storm-composer" style={{ display: 'flex', gap: 8, alignItems: 'flex-end', position: 'relative' }}>
            {/* Emoji picker */}
            {showEmoji && (
              <div style={{ position: 'absolute', bottom: 56, left: 0, width: 296, maxHeight: 220, overflowY: 'auto', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', padding: 8, display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 2, zIndex: 30 }}>
                {CHAT_EMOJIS.map((e) => (
                  <button key={e} type="button" onClick={() => { setNewMessage(prev => prev + e); }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, padding: 4, borderRadius: 6, lineHeight: 1 }}
                    onMouseEnter={(ev) => (ev.currentTarget.style.background = '#f3f4f6')}
                    onMouseLeave={(ev) => (ev.currentTarget.style.background = 'none')}>{e}</button>
                ))}
              </div>
            )}
            {/* GIPHY GIF / sticker picker */}
            {giphyOpen && (
              <div style={{ position: 'absolute', bottom: 56, left: 0, width: 320, maxHeight: 360, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.14)', display: 'flex', flexDirection: 'column', overflow: 'hidden', zIndex: 30 }}>
                {/* GIF | Stickers tabs */}
                <div style={{ display: 'flex', gap: 4, padding: 6, borderBottom: '1px solid #f0f0f0' }}>
                  {(['gifs', 'stickers'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => { setGiphyMode(m); loadGiphy(m, giphyQuery); }}
                      style={{ flex: 1, padding: '6px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 12,
                        background: giphyMode === m ? '#111827' : '#f3f4f6', color: giphyMode === m ? '#fff' : '#6b7280' }}
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
                    style={{ flex: 1, padding: '7px 10px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, outline: 'none' }}
                  />
                  <button type="button" onClick={() => setGiphyOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#9ca3af', lineHeight: 1 }}>×</button>
                </div>
                <div style={{ flex: 1, overflowY: 'auto', padding: 6 }}>
                  {giphyLoading ? (
                    <div style={{ textAlign: 'center', color: '#9ca3af', fontSize: 13, padding: 20 }}>Loading…</div>
                  ) : giphyItems.length === 0 ? (
                    <div style={{ textAlign: 'center', color: '#9ca3af', fontSize: 13, padding: 20 }}>No results</div>
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
              style={{ ...COMPOSER_BTN, backgroundColor: showEmoji ? '#e5e7eb' : '#f3f4f6' }}
            >
              😊
            </button>
            {/* GIF/Stickers: one button opens the GIPHY picker (tabs inside). */}
            <button
              type="button"
              onClick={() => openGiphy('gifs')}
              title="GIFs & Stickers"
              style={{ ...COMPOSER_BTN, backgroundColor: giphyOpen ? '#e5e7eb' : '#f3f4f6', fontSize: 13, fontWeight: 700, color: '#6b7280' }}
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
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              title="Attach photo or video"
              style={{ ...COMPOSER_BTN, cursor: uploading ? 'not-allowed' : 'pointer' }}
            >
              {uploading ? '⏳' : '📎'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*"
              style={{ display: 'none' }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileUpload(file);
              }}
            />
            
            <textarea
              value={newMessage}
              onChange={(e) => {
                const val = e.target.value;
                setNewMessage(val);
                // Show the @mention list while typing "@…" at the end (groups only).
                const m = val.match(/@([^\s@]*)$/);
                setMentionQuery(!isDirect && m ? m[1] : null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              placeholder="Type a message..."
              disabled={sending}
              style={{
                flex: 1,
                padding: '10px 14px',
                border: '1px solid #e5e7eb',
                borderRadius: 8,
                fontSize: 14,
                resize: 'none',
                minHeight: 44,
                maxHeight: 120,
                fontFamily: 'inherit'
              }}
              rows={1}
            />
            
            <button
              type="button"
              onClick={sendMessage}
              disabled={!newMessage.trim() || sending}
              style={{
                padding: '10px 16px',
                backgroundColor: newMessage.trim() ? '#DC2626' : '#e5e7eb',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                cursor: newMessage.trim() && !sending ? 'pointer' : 'not-allowed',
                fontSize: 18,
                fontWeight: 600
              }}
            >
              {sending ? '⏳' : '➤'}
            </button>
          </div>
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
              style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: 'rgba(255,255,255,0.15)', color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}
            >⬇ Save</button>
            <button
              onClick={() => setViewerImage(null)}
              title="Close"
              style={{ width: 38, height: 38, borderRadius: 8, border: 'none', background: 'rgba(255,255,255,0.15)', color: '#fff', cursor: 'pointer', fontSize: 20, lineHeight: 1 }}
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
