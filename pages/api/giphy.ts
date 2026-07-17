import type { NextApiRequest, NextApiResponse } from 'next';
import { requireUser, allowMethods } from '../../src/lib/auth';

// Proxies GIPHY so the API key never leaves the server (env: GIPHY_API_KEY).
// The client (web + app) hits this instead of GIPHY directly.
//   GET ?type=gifs|stickers&q=<search>&limit=&offset=
// Returns { items: [{ id, url, preview, width, height }] } — `url` is the GIF/
// sticker to send (a hosted GIPHY URL; no upload).
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!allowMethods(req, res, ['GET'])) return;
  if (!requireUser(req, res)) return;

  const key = process.env.GIPHY_API_KEY;
  if (!key) return res.status(500).json({ error: 'GIPHY is not configured' });

  const type = req.query.type === 'stickers' ? 'stickers' : 'gifs';
  const q = (req.query.q || '').toString().trim();
  const limit = Math.min(parseInt((req.query.limit as string) || '24', 10) || 24, 50);
  const offset = parseInt((req.query.offset as string) || '0', 10) || 0;

  const base = `https://api.giphy.com/v1/${type}`;
  const common = `api_key=${key}&limit=${limit}&offset=${offset}&rating=pg-13&bundle=messaging_non_clips`;
  const url = q
    ? `${base}/search?${common}&q=${encodeURIComponent(q)}`
    : `${base}/trending?${common}`;

  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`GIPHY ${r.status}`);
    const data = await r.json();
    const items = ((data.data as any[]) || [])
      .map((g) => ({
        id: g.id,
        url: g.images?.fixed_height?.url || g.images?.original?.url,
        preview: g.images?.fixed_height_small?.url || g.images?.fixed_height?.url,
        width: g.images?.fixed_height?.width,
        height: g.images?.fixed_height?.height,
      }))
      .filter((x) => !!x.url);
    res.status(200).json({ items });
  } catch (e) {
    console.error('[giphy] error:', e);
    res.status(500).json({ error: 'Failed to load from GIPHY' });
  }
}
