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
  original: { groupId?: unknown; message?: unknown; senderName?: unknown } | null | undefined,
  groupId: string,
): { replyToMessage: string; replyToSender: string } | null {
  if (!original || String(original.groupId) !== String(groupId)) return null;
  return {
    replyToMessage: String(original.message ?? ''),
    replyToSender: String(original.senderName ?? ''),
  };
}
