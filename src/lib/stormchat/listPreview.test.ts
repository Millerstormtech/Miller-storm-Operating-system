import { describe, it, expect } from 'vitest';
import { chatListPreview } from './listPreview';

const group = { viewerAppId: 'user-rita', isDirect: false };
const dm = { viewerAppId: 'user-rita', isDirect: true };

describe('chatListPreview', () => {
  it('shows who sent the newest message in a group', () => {
    expect(chatListPreview({ senderId: 'user-tom', senderName: 'Tom Lead', message: 'meet at 7', messageType: 'text' }, group))
      .toBe('Tom Lead: meet at 7');
  });

  it('says "You" for your own message, and nothing extra in a DM', () => {
    expect(chatListPreview({ senderId: 'user-rita', senderName: 'Rita Rep', message: 'on my way', messageType: 'text' }, group))
      .toBe('You: on my way');
    expect(chatListPreview({ senderId: 'user-tom', senderName: 'Tom Lead', message: 'call me', messageType: 'text' }, dm))
      .toBe('call me');
    expect(chatListPreview({ senderId: 'user-rita', senderName: 'Rita Rep', message: 'ok', messageType: 'text' }, dm))
      .toBe('You: ok');
  });

  it('names photos, videos, files, polls and GIFs', () => {
    const tom = { senderId: 'user-tom', senderName: 'Tom Lead' };
    expect(chatListPreview({ ...tom, messageType: 'image', message: 'send_1792078973731.jpg' }, group)).toBe('Tom Lead: 📷 Photo');
    expect(chatListPreview({ ...tom, messageType: 'image', message: 'Roof on Elm St' }, group)).toBe('Tom Lead: 📷 Roof on Elm St');
    expect(chatListPreview({ ...tom, messageType: 'image', message: 'GIF' }, group)).toBe('Tom Lead: GIF');
    expect(chatListPreview({ ...tom, messageType: 'video', message: '' }, group)).toBe('Tom Lead: 🎬 Video');
    expect(chatListPreview({ ...tom, messageType: 'file', message: 'Price sheet.pdf' }, group)).toBe('Tom Lead: 📎 Price sheet.pdf');
    expect(chatListPreview({ ...tom, messageType: 'poll', message: 'Lunch?', poll: { question: 'Lunch at noon?' } }, group))
      .toBe('Tom Lead: 📊 Lunch at noon?');
  });

  it('says a deleted message was deleted, never its old text', () => {
    expect(chatListPreview({ senderId: 'user-tom', senderName: 'Tom Lead', messageType: 'text', message: 'This message was deleted', deletedAt: new Date() }, group))
      .toBe('Tom Lead: Message deleted');
  });

  it('shows system notices and bot posts as they are', () => {
    expect(chatListPreview({ senderId: 'system', senderName: 'System', messageType: 'system', message: 'Rob joined the group' }, group))
      .toBe('Rob joined the group');
    expect(chatListPreview({ senderId: 'storm-bot', senderName: 'Miller Storm', messageType: 'text', message: '🎉 Rita closed a deal' }, group))
      .toBe('Miller Storm: 🎉 Rita closed a deal');
  });

  it('keeps it to one short line', () => {
    const long = `line one\nline two ${'x'.repeat(200)}`;
    const out = chatListPreview({ senderId: 'user-tom', senderName: 'Tom', messageType: 'text', message: long }, group);
    expect(out).not.toContain('\n');
    expect(out.length).toBe(100);
    expect(out.endsWith('…')).toBe(true);
  });

  it('is empty for a chat with no messages', () => {
    expect(chatListPreview(null, group)).toBe('');
  });
});
