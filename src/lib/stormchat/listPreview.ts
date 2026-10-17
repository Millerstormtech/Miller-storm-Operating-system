// The one line under each chat in the chat list (GroupMe-style): the newest
// message, with who sent it. Decided by the server so the website and the
// phone show the same thing (Youssef, 2026-10-16: the list used to show the
// group's description, so you had to open every chat to see what was new).

import { captionOf } from './compose';

export type LastMessage = {
  senderId?: unknown;
  senderName?: unknown;
  message?: unknown;
  messageType?: unknown;
  poll?: { question?: unknown } | null;
  deletedAt?: unknown;
  voice?: unknown;
  location?: unknown;
};

const MAX = 100;

function oneLine(s: string): string {
  const flat = s.replace(/\s+/g, ' ').trim();
  return flat.length > MAX ? `${flat.slice(0, MAX - 1)}…` : flat;
}

// What the message is, in a few words.
function bodyOf(m: LastMessage, type: string): string {
  const text = typeof m.message === 'string' ? m.message : '';
  if (m.deletedAt) return 'Message deleted';
  if (m.voice) return '🎤 Voice message';
  if (m.location) return '📍 Location';
  if (type === 'image') {
    if (text === 'GIF' || text === 'Sticker') return text;
    const caption = captionOf(type, text);
    return caption ? `📷 ${caption}` : '📷 Photo';
  }
  if (type === 'video') {
    const caption = captionOf(type, text);
    return caption ? `🎬 ${caption}` : '🎬 Video';
  }
  if (type === 'file') return `📎 ${text || 'File'}`;
  if (type === 'poll') return `📊 ${String(m.poll?.question ?? '') || text || 'Poll'}`;
  return text;
}

/**
 * "Tom Lead: meet at 7" in a group, "meet at 7" in a DM, "You: ..." for your
 * own message, and system notices as they are. '' when the chat is empty.
 */
export function chatListPreview(
  m: LastMessage | null | undefined,
  opts: { viewerAppId: string; isDirect: boolean },
): string {
  if (!m) return '';
  const type = String(m.messageType || 'text');
  if (type === 'system') return oneLine(typeof m.message === 'string' ? m.message : '');
  const body = bodyOf(m, type);
  const mine = !!opts.viewerAppId && String(m.senderId ?? '') === opts.viewerAppId;
  const who = mine ? 'You' : opts.isDirect ? '' : String(m.senderName ?? '').trim();
  return oneLine(who ? `${who}: ${body}` : body);
}
