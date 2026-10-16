import { describe, it, expect } from 'vitest';
import { canEditMessage, editProblem, tombstoneUpdate, DELETED_TEXT, EDIT_WINDOW_MS } from './messageChanges';

const SENT = Date.parse('2026-10-16T15:00:00Z');
const mine = { senderId: 'user-rita', messageType: 'text', message: 'meet at 7', createdAt: new Date(SENT) };

describe('editing a message', () => {
  it('lets you edit your own text for 15 minutes', () => {
    expect(editProblem(mine, 'user-rita', 'meet at 8', SENT + 60_000)).toBeNull();
    expect(editProblem(mine, 'user-rita', 'meet at 8', SENT + EDIT_WINDOW_MS)).toBeNull();
    expect(editProblem(mine, 'user-rita', 'meet at 8', SENT + EDIT_WINDOW_MS + 1))
      .toBe('Messages can only be edited for 15 minutes after sending');
  });

  it("never lets you edit someone else's message", () => {
    expect(editProblem(mine, 'user-tom', 'hacked', SENT)).toBe('You can only edit your own messages');
    expect(canEditMessage(mine, 'user-tom', SENT)).toBe(false);
  });

  it('allows photo and video captions, not files, polls, GIFs or deleted messages', () => {
    expect(editProblem({ ...mine, messageType: 'image', message: '' }, 'user-rita', 'Elm St roof', SENT)).toBeNull();
    expect(editProblem({ ...mine, messageType: 'video' }, 'user-rita', '', SENT)).toBeNull();
    expect(editProblem({ ...mine, messageType: 'file' }, 'user-rita', 'x', SENT)).toBe("This kind of message can't be edited");
    expect(editProblem({ ...mine, messageType: 'poll' }, 'user-rita', 'x', SENT)).toBe("This kind of message can't be edited");
    expect(editProblem({ ...mine, messageType: 'image', mediaUrl: 'https://media2.giphy.com/media/abc/giphy.gif' }, 'user-rita', 'x', SENT))
      .toBe("This kind of message can't be edited");
    expect(editProblem({ ...mine, deletedAt: new Date() }, 'user-rita', 'x', SENT)).toBe('That message was deleted');
  });

  it("can't edit a shared location or a voice message (their text isn't typed)", () => {
    expect(editProblem({ ...mine, location: { lat: 30, lng: -97 } }, 'user-rita', 'x', SENT)).toBe("This kind of message can't be edited");
    expect(canEditMessage({ ...mine, location: { lat: 30, lng: -97 } }, 'user-rita', SENT)).toBe(false);
    expect(editProblem({ ...mine, messageType: 'file', voice: { durationSec: 4 } }, 'user-rita', 'x', SENT)).toBe("This kind of message can't be edited");
  });

  it('keeps the usual limits: no empty text, 2,000 characters', () => {
    expect(editProblem(mine, 'user-rita', '   ', SENT)).toBe("A message can't be empty. Delete it instead.");
    expect(editProblem(mine, 'user-rita', 'x'.repeat(2001), SENT)).toBe('Messages can be up to 2,000 characters');
    expect(editProblem(mine, 'user-rita', undefined, SENT)).toBe('The new text is missing');
  });

  it('tolerates a phone clock slightly ahead of the server', () => {
    expect(canEditMessage(mine, 'user-rita', SENT - 5_000)).toBe(true);
  });
});

describe('deleting a message', () => {
  it('leaves a notice and wipes everything that was in it', () => {
    const now = new Date(SENT);
    const u = tombstoneUpdate('user-tom', now);
    expect(u.$set).toMatchObject({
      message: DELETED_TEXT, messageType: 'text', mediaUrl: '', reactions: [], mentions: [], pinned: false, deletedAt: now, deletedBy: 'user-tom',
    });
    expect(Object.keys(u.$unset).sort()).toEqual(['albumId', 'editedAt', 'location', 'poll', 'replyTo', 'replyToMessage', 'replyToSender', 'voice']);
  });
});
