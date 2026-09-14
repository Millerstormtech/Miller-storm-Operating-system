// Where to ask Vimeo how long a lesson video is (2026-09-13). Builds the URL of
// Vimeo's public oEmbed endpoint, which needs no API key and replies with the
// video's `duration` in seconds.
//
// PURE ONLY: no network here. src/lib/lessonDurations.ts does the fetching.

export type VimeoRef = { id: string; hash: string | null };

/**
 * The Vimeo video id and privacy hash a lesson points at. The lesson's
 * videoUrl (what the phone plays) wins; the iframe in the body (what the web
 * plays) is the fallback. Null for Loom, YouTube, uploads and text lessons.
 */
export function vimeoRefOf(videoUrl?: string | null, body?: string | null): VimeoRef | null {
  const url = String(videoUrl || "");
  // https://vimeo.com/1176674471/01bd539e2e?fl=ml  or  https://vimeo.com/1176674471?h=01bd539e2e
  const fromUrl = url.match(/vimeo\.com\/(?:video\/)?(\d{6,})(?:\/([0-9a-f]{6,}))?/i);
  if (fromUrl) {
    const hashParam = url.match(/[?&]h=([0-9a-f]{6,})/i);
    return { id: fromUrl[1], hash: fromUrl[2] || (hashParam ? hashParam[1] : null) };
  }
  // <iframe src="https://player.vimeo.com/video/1158633554?h=7db231f045" ...>
  const fromBody = String(body || "").match(/player\.vimeo\.com\/video\/(\d{6,})(?:\?[^"'\s>]*?\bh=([0-9a-f]{6,}))?/i);
  return fromBody ? { id: fromBody[1], hash: fromBody[2] || null } : null;
}

/** Vimeo's public oEmbed URL for this video. Unlisted videos need their hash in it. */
export function vimeoOembedUrl(ref: VimeoRef): string {
  const page = `https://vimeo.com/${ref.id}${ref.hash ? `/${ref.hash}` : ""}`;
  return `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(page)}`;
}
