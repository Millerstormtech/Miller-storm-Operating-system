// Message search and the per-chat gallery (GroupMe-style; Youssef,
// 2026-10-16). Pure: the routes build their database filters from here, so
// what is searchable and what shows in the gallery is decided in one tested
// place. Deleted messages and grey system notices are never found.

export const SEARCH_MIN = 2;
export const SEARCH_MAX = 100;
export const SEARCH_LIMIT = 50;

/** The cleaned search words, or null when too short / too long to search. */
export function searchTerm(q: unknown): string | null {
  const t = typeof q === 'string' ? q.replace(/\s+/g, ' ').trim() : '';
  return t.length >= SEARCH_MIN && t.length <= SEARCH_MAX ? t : null;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Database filter for messages containing `term` in the given chats. */
export function searchFilter(groupIds: string[], term: string) {
  const pattern = new RegExp(escape(term), 'i');
  return {
    groupId: { $in: groupIds },
    deletedAt: null, // also matches older messages that have no such field
    messageType: { $ne: 'system' },
    $or: [{ message: pattern }, { 'poll.question': pattern }, { 'poll.options.text': pattern }],
  };
}

/** A short piece of `text` around the first match, for the results list. */
export function snippet(text: string, term: string, max = 120): string {
  const flat = String(text || '').replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  const at = flat.toLowerCase().indexOf(term.toLowerCase());
  const start = at < 0 ? 0 : Math.max(0, Math.min(at - Math.floor((max - term.length) / 2), flat.length - max));
  const piece = flat.slice(start, start + max).trim();
  return `${start > 0 ? '…' : ''}${piece}${start + max < flat.length ? '…' : ''}`;
}

export const GALLERY_KINDS = ['photos', 'files', 'links'] as const;
export type GalleryKind = (typeof GALLERY_KINDS)[number];
export const GALLERY_PAGE = 60;

export function isGalleryKind(x: unknown): x is GalleryKind {
  return typeof x === 'string' && (GALLERY_KINDS as readonly string[]).includes(x);
}

const LINK = /https?:\/\/[^\s<>"']+/gi;

/** Database filter for one gallery tab. Photos leave out GIFs and stickers. */
export function galleryFilter(kind: GalleryKind) {
  if (kind === 'photos') {
    return { messageType: { $in: ['image', 'video'] }, deletedAt: null, mediaUrl: { $not: /giphy\.com/i } };
  }
  // Voice messages aren't documents; a shared location's map link isn't one
  // of the chat's links.
  if (kind === 'files') return { messageType: 'file', deletedAt: null, voice: null };
  return { messageType: 'text', deletedAt: null, location: null, message: /https?:\/\/\S/i };
}

/** The web links in a message, in order, without repeats. */
export function linksIn(text: string): string[] {
  const found = String(text || '').match(LINK) || [];
  // Drop punctuation that usually ends a sentence, not the link.
  return Array.from(new Set(found.map((u) => u.replace(/[.,;:!?)\]]+$/, ''))));
}
