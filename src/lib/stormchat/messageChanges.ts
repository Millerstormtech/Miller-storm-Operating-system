// Editing and deleting a sent message (GroupMe-style; Youssef, 2026-10-16).
//
// Edit: your own text message or photo/video caption, for 15 minutes after
// sending. The message shows "edited"; nobody is alerted again.
// Delete: the message stays in the chat as "This message was deleted" (it
// used to vanish, which left people confused by the gap). Its text,
// attachment, poll, reactions, mentions and pin go for good, and replies that
// quoted it stop showing the old words.

import { MAX_MESSAGE_CHARS } from './compose';

export const EDIT_WINDOW_MS = 15 * 60 * 1000;
export const DELETED_TEXT = 'This message was deleted';
export const DELETED_QUOTE = 'Original message deleted';

type Msg = {
  senderId?: unknown;
  messageType?: unknown;
  mediaUrl?: unknown;
  message?: unknown;
  createdAt?: unknown;
  deletedAt?: unknown;
  voice?: unknown;
  location?: unknown;
};

export function isDeletedMessage(m: Msg | null | undefined): boolean {
  return !!m?.deletedAt;
}

const isGif = (m: Msg) => typeof m.mediaUrl === 'string' && /(^|\.)giphy\.com\//i.test(m.mediaUrl.replace(/^https?:\/\//i, ''));

/** Whether the screen should offer Edit on this message right now. */
export function canEditMessage(m: Msg | null | undefined, editorAppId: string, now = Date.now()): boolean {
  if (!m || !editorAppId || String(m.senderId ?? '') !== editorAppId || isDeletedMessage(m)) return false;
  const type = String(m.messageType ?? '');
  if (type !== 'text' && type !== 'image' && type !== 'video') return false;
  if (type === 'image' && isGif(m)) return false;
  if (m.voice || m.location) return false; // their text is generated, not typed
  const sent = new Date(m.createdAt as any).getTime();
  if (Number.isNaN(sent)) return false;
  return now - sent <= EDIT_WINDOW_MS; // a clock a little ahead (negative age) is fine
}

/** Why this edit is refused (a message for the person), or null when it's fine. */
export function editProblem(m: Msg | null | undefined, editorAppId: string, text: unknown, now = Date.now()): string | null {
  if (!m || String(m.senderId ?? '') !== editorAppId) return 'You can only edit your own messages';
  if (isDeletedMessage(m)) return 'That message was deleted';
  const type = String(m.messageType ?? '');
  if ((type !== 'text' && type !== 'image' && type !== 'video') || (type === 'image' && isGif(m)) || m.voice || m.location) {
    return "This kind of message can't be edited";
  }
  if (!canEditMessage(m, editorAppId, now)) return 'Messages can only be edited for 15 minutes after sending';
  if (typeof text !== 'string') return 'The new text is missing';
  if (text.length > MAX_MESSAGE_CHARS) return `Messages can be up to ${MAX_MESSAGE_CHARS.toLocaleString('en-US')} characters`;
  if (type === 'text' && !text.trim()) return "A message can't be empty. Delete it instead.";
  return null;
}

/** The database update that turns a message into a "deleted" notice. */
export function tombstoneUpdate(deletedBy: string, now: Date) {
  return {
    $set: {
      message: DELETED_TEXT,
      messageType: 'text',
      mediaUrl: '',
      reactions: [],
      mentions: [],
      pinned: false,
      pinnedAt: null,
      pinnedBy: '',
      pinnedByName: '',
      deletedAt: now,
      deletedBy,
    },
    $unset: { poll: '', editedAt: '', replyTo: '', replyToMessage: '', replyToSender: '', voice: '', location: '', albumId: '' },
  };
}
