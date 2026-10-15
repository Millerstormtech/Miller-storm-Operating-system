import { describe, it, expect } from 'vitest';
import { userMessageType, replyQuoteFrom, messageProblem, attachmentProblem, safeHref, alertPreview } from './compose';

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
  it('quotes a photo, video, file or poll by what it is', () => {
    expect(replyQuoteFrom({ groupId: 'g1', senderName: 'Rep', messageType: 'image' }, 'g1')?.replyToMessage).toBe('📷 Photo');
    expect(replyQuoteFrom({ groupId: 'g1', senderName: 'Rep', messageType: 'video' }, 'g1')?.replyToMessage).toBe('🎬 Video');
    expect(replyQuoteFrom({ groupId: 'g1', senderName: 'Rep', messageType: 'file', message: 'Q3.pdf' }, 'g1')?.replyToMessage).toBe('📎 Q3.pdf');
    expect(replyQuoteFrom({ groupId: 'g1', senderName: 'Rep', messageType: 'poll', poll: { question: 'Lunch?' } }, 'g1')?.replyToMessage).toBe('📊 Lunch?');
  });
});

describe('messageProblem (item 16 limits)', () => {
  it('refuses empty or whitespace-only text', () => {
    expect(messageProblem('text', '')).toMatch(/empty/);
    expect(messageProblem('text', '   \n ')).toMatch(/empty/);
  });
  it('allows up to 2,000 characters, refuses more', () => {
    expect(messageProblem('text', 'x'.repeat(2000))).toBeNull();
    expect(messageProblem('text', 'x'.repeat(2001))).toMatch(/2,000/);
  });
  it('a photo needs no text', () => {
    expect(messageProblem('image', '')).toBeNull();
  });
  it('a poll needs a question and 2 to 10 options', () => {
    expect(messageProblem('poll', '', { question: 'Lunch?', options: ['A', 'B'] })).toBeNull();
    expect(messageProblem('poll', '', { question: '', options: ['A', 'B'] })).toMatch(/question/);
    expect(messageProblem('poll', '', { question: 'Q', options: ['A'] })).toMatch(/2 to 10/);
    expect(messageProblem('poll', '', { question: 'Q', options: ['A', ' ', ''] })).toMatch(/2 to 10/);
    expect(messageProblem('poll', '', { question: 'Q', options: Array.from({ length: 11 }, (_, i) => `o${i}`) })).toMatch(/2 to 10/);
    expect(messageProblem('poll', '', { question: 'Q', options: ['A', 'x'.repeat(101)] })).toMatch(/100/);
    expect(messageProblem('poll', '', null)).toMatch(/question/);
  });
});

describe('attachmentProblem (item 20)', () => {
  it.each([
    ['image', '/uploads/abc.png'],
    ['file', '/uploads/q3.pdf'],
    ['video', 'https://millerstorm.tech/uploads/clip.mp4'],
    ['image', 'https://media2.giphy.com/media/xyz/200.gif'],
    ['image', 'https://i.giphy.com/xyz.gif'],
  ])('%s at %s is allowed', (type, url) => {
    expect(attachmentProblem(type as any, url)).toBeNull();
  });
  it.each([
    ['file', 'javascript:alert(1)'],
    ['file', 'https://evil.example/phish'],
    ['file', 'http://millerstorm.tech/uploads/x.pdf'],
    ['file', 'https://millerstorm.tech.evil.com/uploads/x.pdf'],
    ['file', 'https://millerstorm.tech/api/users'],
    ['file', '/uploads/../.env'],
    ['file', '//evil.example/x'],
    ['video', 'https://media.giphy.com/x.gif'],
    ['image', ''],
    ['image', 'data:image/png;base64,AAAA'],
  ])('%s at %s is refused', (type, url) => {
    expect(attachmentProblem(type as any, url)).not.toBeNull();
  });
  it('text and polls carry no attachment', () => {
    expect(attachmentProblem('text', 'javascript:alert(1)')).toBeNull();
  });
});

describe('safeHref', () => {
  it('keeps own paths and https links, drops anything else', () => {
    expect(safeHref('/uploads/a.pdf')).toBe('/uploads/a.pdf');
    expect(safeHref('https://x.com/a')).toBe('https://x.com/a');
    expect(safeHref('javascript:alert(1)')).toBeUndefined();
    expect(safeHref('//evil.example')).toBeUndefined();
  });
});

describe('alertPreview', () => {
  it('polls show the question, not "Sent a file"', () => {
    expect(alertPreview('poll', '', 'Lunch at 12?')).toBe('📊 Lunch at 12?');
  });
  it('text, photo, GIF, video and file previews', () => {
    expect(alertPreview('text', 'hello')).toBe('hello');
    expect(alertPreview('image', '')).toBe('Sent a photo');
    expect(alertPreview('image', 'GIF')).toBe('Sent a photo');
    expect(alertPreview('image', 'site photo @Sam')).toBe('📷 site photo @Sam');
    expect(alertPreview('video', '')).toBe('Sent a video');
    expect(alertPreview('file', 'Q3.pdf')).toBe('📎 Q3.pdf');
  });
});
