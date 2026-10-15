// What a person may put into a new Storm Chat message, decided by the server
// rather than trusted from the app. Before 2026-10-15 the server stored the
// sender's name, the message type and the reply quote exactly as the request
// said, so anyone could post as "Jay (CEO)", fake a grey system notice, or
// quote words the original never said (readiness test, item 3). GroupMe works
// the same way this does: your name is your account's, replies quote the real
// message.

/** Types a person may send. 'system' notices are written only by the server. */
export const USER_MESSAGE_TYPES = ['text', 'image', 'video', 'file', 'poll'] as const;
export type UserMessageType = (typeof USER_MESSAGE_TYPES)[number];

/** The type to store, or null when the request asked for one a person can't send. */
export function userMessageType(requested: unknown): UserMessageType | null {
  if (requested === undefined || requested === null || requested === '') return 'text';
  return (USER_MESSAGE_TYPES as readonly string[]).includes(String(requested))
    ? (String(requested) as UserMessageType)
    : null;
}

/**
 * The reply quote to store, copied from the REAL original message. Null when
 * the original doesn't exist or lives in another chat (a reply can't quote,
 * or reveal, a message from somewhere else).
 */
export function replyQuoteFrom(
  original: {
    groupId?: unknown; message?: unknown; senderName?: unknown;
    messageType?: unknown; poll?: { question?: unknown } | null;
  } | null | undefined,
  groupId: string,
): { replyToMessage: string; replyToSender: string } | null {
  if (!original || String(original.groupId) !== String(groupId)) return null;
  const text = String(original.message ?? '').trim();
  // Photos, videos, files and polls have little or no text: quote what they are.
  const quote =
    original.messageType === 'image' ? (text ? `📷 ${text}` : '📷 Photo')
    : original.messageType === 'video' ? (text ? `🎬 ${text}` : '🎬 Video')
    : original.messageType === 'file' ? `📎 ${text || 'File'}`
    : original.messageType === 'poll' ? `📊 ${String(original.poll?.question ?? text ?? 'Poll') || 'Poll'}`
    : String(original.message ?? '');
  return { replyToMessage: quote, replyToSender: String(original.senderName ?? '') };
}

// Limits on what one message may hold (readiness test item 16, Youssef's
// choices 2026-10-15): no empty text (each one alerted everyone), at most
// 2,000 characters (GroupMe allows 1,000), and a poll needs a question and
// 2 to 10 options. Returns an error message for the person, or null.
export const MAX_MESSAGE_CHARS = 2000;
export const POLL_MIN_OPTIONS = 2;
export const POLL_MAX_OPTIONS = 10;

export function messageProblem(
  type: UserMessageType,
  text: unknown,
  poll?: { question?: unknown; options?: unknown } | null,
): string | null {
  const body = typeof text === 'string' ? text : '';
  if (body.length > MAX_MESSAGE_CHARS) return `Messages can be up to ${MAX_MESSAGE_CHARS.toLocaleString('en-US')} characters`;
  if (type === 'text' && !body.trim()) return "You can't send an empty message";
  if (type === 'poll') {
    const question = typeof poll?.question === 'string' ? poll.question.trim() : '';
    if (!question) return 'A poll needs a question';
    if (question.length > 300) return 'A poll question can be up to 300 characters';
    const options = Array.isArray(poll?.options)
      ? (poll!.options as unknown[]).map((o: any) => String((typeof o === 'string' ? o : o?.text) ?? '').trim()).filter(Boolean)
      : [];
    if (options.length < POLL_MIN_OPTIONS || options.length > POLL_MAX_OPTIONS) {
      return `A poll needs ${POLL_MIN_OPTIONS} to ${POLL_MAX_OPTIONS} options`;
    }
    if (options.some((o) => o.length > 100)) return 'Poll options can be up to 100 characters';
  }
  return null;
}

// How fast one person may post into one chat: 10 messages per 10 seconds.
// Per chat, so forwarding one message to many people still works.
export const SEND_BURST = { max: 10, windowMs: 10_000 };
