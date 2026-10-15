import { describe, it, expect } from 'vitest';
import { userMessageType, replyQuoteFrom } from './compose';

describe('userMessageType', () => {
  it.each(['text', 'image', 'video', 'file', 'poll'])('a person may send %s', (t) => {
    expect(userMessageType(t)).toBe(t);
  });
  it('defaults to text when none is given', () => {
    expect(userMessageType(undefined)).toBe('text');
    expect(userMessageType('')).toBe('text');
  });
  it('refuses system notices from a person (fake "X left the group")', () => {
    expect(userMessageType('system')).toBeNull();
  });
  it('refuses unknown or non-string types', () => {
    expect(userMessageType('sticker')).toBeNull();
    expect(userMessageType({ $ne: 1 })).toBeNull();
  });
});

describe('replyQuoteFrom', () => {
  const original = { groupId: 'g1', message: 'Welcome to Main Chat', senderName: 'Ada Admin' };

  it('copies the real text and sender, whatever the app claimed', () => {
    expect(replyQuoteFrom(original, 'g1')).toEqual({ replyToMessage: 'Welcome to Main Chat', replyToSender: 'Ada Admin' });
  });
  it('refuses to quote a message from another chat (would leak it)', () => {
    expect(replyQuoteFrom(original, 'g2')).toBeNull();
  });
  it('refuses a missing original', () => {
    expect(replyQuoteFrom(null, 'g1')).toBeNull();
  });
  it('keeps an empty quote for a photo with no caption', () => {
    expect(replyQuoteFrom({ groupId: 'g1', senderName: 'Rep' }, 'g1')).toEqual({ replyToMessage: '', replyToSender: 'Rep' });
  });
});
