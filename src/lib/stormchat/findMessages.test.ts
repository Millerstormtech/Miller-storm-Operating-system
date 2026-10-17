import { describe, it, expect } from 'vitest';
import { searchTerm, searchFilter, snippet, galleryFilter, isGalleryKind, linksIn } from './findMessages';

describe('searchTerm', () => {
  it('needs 2 to 100 characters, tidied', () => {
    expect(searchTerm('  elm   st ')).toBe('elm st');
    expect(searchTerm('e')).toBeNull();
    expect(searchTerm('x'.repeat(101))).toBeNull();
    expect(searchTerm(undefined)).toBeNull();
    expect(searchTerm(['elm'])).toBeNull();
  });
});

describe('searchFilter', () => {
  it('only looks in the chats given, skips deleted and system messages', () => {
    const f = searchFilter(['g1', 'g2'], 'elm');
    expect(f.groupId).toEqual({ $in: ['g1', 'g2'] });
    expect(f.deletedAt).toBeNull();
    expect(f.messageType).toEqual({ $ne: 'system' });
  });

  it('matches any case and treats symbols as plain text', () => {
    const f = searchFilter(['g1'], '$4.50 (cash)');
    const pattern = (f.$or[0] as any).message as RegExp;
    expect(pattern.test('Paid $4.50 (CASH) today')).toBe(true);
    expect(pattern.test('Paid $4x50 cash')).toBe(false);
  });

  it('also finds poll questions and options', () => {
    const f = searchFilter(['g1'], 'lunch');
    expect(f.$or.map((o) => Object.keys(o)[0])).toEqual(['message', 'poll.question', 'poll.options.text']);
  });
});

describe('snippet', () => {
  it('keeps short text whole and centres long text on the match', () => {
    expect(snippet('meet at 7', 'meet')).toBe('meet at 7');
    const long = `${'a '.repeat(100)}the address is 12 Elm St ${'b '.repeat(100)}`;
    const s = snippet(long, 'elm st', 40);
    expect(s.toLowerCase()).toContain('elm st');
    expect(s.startsWith('…')).toBe(true);
    expect(s.endsWith('…')).toBe(true);
  });
});

describe('gallery', () => {
  it('knows its three tabs', () => {
    expect(isGalleryKind('photos')).toBe(true);
    expect(isGalleryKind('gifs')).toBe(false);
  });

  it('photos leave out GIFs and stickers; nothing deleted shows', () => {
    const f = galleryFilter('photos') as any;
    expect(f.messageType).toEqual({ $in: ['image', 'video'] });
    expect(f.mediaUrl.$not.test('https://media1.giphy.com/media/x/giphy.gif')).toBe(true);
    expect(f.mediaUrl.$not.test('/uploads/abc.jpg')).toBe(false);
    expect(galleryFilter('files')).toEqual({ messageType: 'file', deletedAt: null, voice: null });
    expect((galleryFilter('links') as any).location).toBeNull();
    expect((galleryFilter('links') as any).message.test('see https://example.com')).toBe(true);
  });

  it('pulls the links out of a message', () => {
    expect(linksIn('Docs: https://a.com/x, and https://b.com/y. Also https://a.com/x'))
      .toEqual(['https://a.com/x', 'https://b.com/y']);
    expect(linksIn('no links here')).toEqual([]);
  });
});
