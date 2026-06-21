const videoId = 'uV0SYqNUrUM';

const pageRes = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
  headers: {
    "Accept-Language": "en-US,en;q=0.9",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36"
  }
});
const html = await pageRes.text();

const playerMatch = html.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\});\s*(?:var|const|let|window)/s);
if (!playerMatch) { console.log('❌ No player response found'); process.exit(1); }

const playerResponse = JSON.parse(playerMatch[1]);
const tracks = playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks;

if (!tracks || tracks.length === 0) { console.log('❌ No captions available'); process.exit(1); }

console.log('✅ Tracks found:', tracks.length);
tracks.forEach(t => console.log(' -', t.languageCode, t.name?.simpleText));

const track = tracks.find(t => t.languageCode === 'en') || tracks[0];
console.log('Using:', track.languageCode, track.name?.simpleText);

// Build clean URL without session-specific params, add fmt=json3
const cleanUrl = `https://www.youtube.com/api/timedtext?v=${videoId}&lang=${track.languageCode}&fmt=json3`;
console.log('Clean URL:', cleanUrl);

const transcriptRes = await fetch(cleanUrl, {
  headers: {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
    "Referer": `https://www.youtube.com/watch?v=${videoId}`
  }
});
console.log('Status:', transcriptRes.status, 'Content-Type:', transcriptRes.headers.get('content-type'));
const xml = await transcriptRes.text();
console.log('Response length:', xml.length);
console.log('First 400 chars:', xml.substring(0, 400));

const segments = [...xml.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/g)]
  .map(m => m[1].replace(/&amp;/g,'&').replace(/&#39;/g,"'").replace(/<[^>]+>/g,'').trim())
  .filter(Boolean);

console.log('Segments:', segments.length);
console.log('First 300 chars:', segments.join(' ').substring(0, 300));
