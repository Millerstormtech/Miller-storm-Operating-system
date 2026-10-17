import { describe, it, expect } from 'vitest';
import {
  formatDuration, voiceLabel, cleanVoice, cleanLocation, mapsUrl, locationText,
  cleanAlbum, albumPreview, cleanPollEnd, pollEnded, pollForViewer,
} from './richMessages';

describe('voice messages', () => {
  it('labels the length', () => {
    expect(formatDuration(5)).toBe('0:05');
    expect(formatDuration(83.4)).toBe('1:23');
    expect(voiceLabel(300)).toBe('🎤 Voice message (5:00)');
  });

  it('allows up to 5 minutes of real audio from our uploads', () => {
    expect(cleanVoice({ durationSec: 23.6 }, '/uploads/abc.m4a')).toEqual({ ok: { durationSec: 24 } });
    expect(cleanVoice({ durationSec: 300.4 }, '/uploads/abc.webm')).toEqual({ ok: { durationSec: 300 } });
    expect(cleanVoice({ durationSec: 302 }, '/uploads/abc.m4a')).toEqual({ error: 'Voice messages can be up to 5 minutes' });
    expect(cleanVoice({ durationSec: 0 }, '/uploads/abc.m4a')).toEqual({ error: 'That voice message is empty' });
    expect(cleanVoice({}, '/uploads/abc.m4a')).toEqual({ error: 'That voice message is empty' });
    expect(cleanVoice({ durationSec: 10 }, '/uploads/notes.pdf')).toEqual({ error: "That isn't an audio recording" });
  });
});

describe('shared location', () => {
  it('keeps a real point, rounded', () => {
    expect(cleanLocation({ lat: 30.2672123456, lng: -97.7430608 })).toEqual({ lat: 30.267212, lng: -97.743061 });
    expect(cleanLocation({ lat: '30.5', lng: '-97.1' })).toEqual({ lat: 30.5, lng: -97.1 });
  });

  it('refuses anything that is not a place on Earth', () => {
    expect(cleanLocation({ lat: 91, lng: 0 })).toBeNull();
    expect(cleanLocation({ lat: 10, lng: -181 })).toBeNull();
    expect(cleanLocation({ lat: 0, lng: 0 })).toBeNull();
    expect(cleanLocation({ lat: 'x', lng: 1 })).toBeNull();
    expect(cleanLocation(null)).toBeNull();
  });

  it('becomes a maps link old phones can tap', () => {
    const p = { lat: 30.5, lng: -97.1 };
    expect(mapsUrl(p)).toBe('https://www.google.com/maps?q=30.5,-97.1');
    expect(locationText(p)).toBe('📍 Location: https://www.google.com/maps?q=30.5,-97.1');
  });
});

describe('albums', () => {
  const photo = (n: number) => ({ mediaUrl: `/uploads/p${n}.jpg`, messageType: 'image' });

  it('takes 2 to 10 photos or videos from our uploads', () => {
    expect(cleanAlbum([photo(1), { mediaUrl: '/uploads/v.mp4', messageType: 'video' }]))
      .toEqual({ ok: [{ mediaUrl: '/uploads/p1.jpg', messageType: 'image' }, { mediaUrl: '/uploads/v.mp4', messageType: 'video' }] });
    expect(cleanAlbum([photo(1)])).toEqual({ error: 'An album needs at least 2 photos' });
    expect(cleanAlbum(Array.from({ length: 11 }, (_, i) => photo(i)))).toEqual({ error: 'You can send up to 10 photos at a time' });
  });

  it('refuses files, outside links and GIFs', () => {
    expect(cleanAlbum([photo(1), { mediaUrl: '/uploads/a.pdf', messageType: 'file' }])).toEqual({ error: 'Albums hold photos and videos only' });
    expect(cleanAlbum([photo(1), { mediaUrl: 'https://evil.example/x.jpg', messageType: 'image' }])).toEqual({ error: "That attachment isn't allowed" });
    expect(cleanAlbum([photo(1), { mediaUrl: 'https://media.giphy.com/media/x/giphy.gif', messageType: 'image' }])).toEqual({ error: "That attachment isn't allowed" });
  });

  it('describes what was sent', () => {
    expect(albumPreview([{ messageType: 'image' }, { messageType: 'image' }, { messageType: 'image' }])).toBe('📷 3 photos');
    expect(albumPreview([{ messageType: 'image' }, { messageType: 'image' }, { messageType: 'video' }])).toBe('📷 2 photos and a video');
    expect(albumPreview([{ messageType: 'video' }, { messageType: 'video' }])).toBe('🎬 2 videos');
  });
});

describe('poll end date', () => {
  const NOW = Date.parse('2026-10-16T15:00:00Z');

  it('is optional, at least a minute ahead and at most 30 days', () => {
    expect(cleanPollEnd(undefined, NOW)).toEqual({ ok: null });
    expect(cleanPollEnd('2026-10-17T15:00:00Z', NOW)).toEqual({ ok: new Date('2026-10-17T15:00:00Z') });
    expect(cleanPollEnd('2026-10-16T15:00:30Z', NOW)).toEqual({ error: 'A poll has to stay open for at least a minute' });
    expect(cleanPollEnd('2026-11-20T15:00:00Z', NOW)).toEqual({ error: 'A poll can stay open for up to 30 days' });
    expect(cleanPollEnd('soon', NOW)).toEqual({ error: "That end time isn't a date" });
  });

  it('knows when a poll has ended', () => {
    expect(pollEnded({ endsAt: '2026-10-16T14:59:59Z' }, NOW)).toBe(true);
    expect(pollEnded({ endsAt: '2026-10-16T15:00:01Z' }, NOW)).toBe(false);
    expect(pollEnded({}, NOW)).toBe(false);
  });
});

describe('who voted', () => {
  const names: Record<string, string> = { 'user-tom': 'Tom Lead', 'user-rob': 'Rob Rep' };
  const nameOf = (id: string) => names[id];
  const poll = {
    question: 'Lunch?',
    allowMultiple: true,
    options: [{ text: 'Yes', votes: ['user-tom', 'user-rita'] }, { text: 'No', votes: ['user-rob', 'user-tom'] }],
  };

  it('names the voters, "You" for yourself', () => {
    const v = pollForViewer(poll, 'user-rita', nameOf) as any;
    expect(v.options[0].voterNames).toEqual(['Tom Lead', 'You']);
    expect(v.options[1].voterNames).toEqual(['Rob Rep', 'Tom Lead']);
    expect(v.voterCount).toBe(3);
  });

  it('in an anonymous poll sends nobody else\'s id, keeping counts and your own tick', () => {
    const v = pollForViewer({ ...poll, anonymous: true }, 'user-rita', nameOf) as any;
    expect(v.options[0].votes).toEqual(['hidden-0-0', 'user-rita']);
    expect(v.options[1].votes).toEqual(['hidden-1-0', 'hidden-1-1']);
    expect(v.options[0].voterNames).toBeUndefined();
    expect(JSON.stringify(v)).not.toContain('user-tom');
    expect(v.voterCount).toBe(3);
  });

  it('calls a voter whose account is gone "Former user"', () => {
    const v = pollForViewer({ question: 'Q', options: [{ text: 'A', votes: ['user-gone'] }] }, 'user-rita', nameOf) as any;
    expect(v.options[0].voterNames).toEqual(['Former user']);
  });
});
