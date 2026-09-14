// The query string the web lesson player puts on a Vimeo embed before it
// attaches the Vimeo SDK. Pure (no DOM, no React) so the rule for which video
// may start by itself lives in one tested place.
//
// Autoplay used to be forced ON for every Vimeo video in a lesson, whatever the
// viewer's Autoplay switch said. A lesson with two videos started both at once,
// and a second, hidden copy of the lesson played sound nobody had pressed play on.

/**
 * The embed URL with the player API switched on, or null when the API is
 * already on (the iframe was prepared before and must not be reloaded again).
 *
 * @param autoplay true only for the one video allowed to start by itself.
 */
export function vimeoPlayerSrc(src: string, autoplay: boolean): string | null {
  if (!src || src.includes("api=1")) return null;
  const params: ReadonlyArray<readonly [string, string]> = [
    ["api", "1"],
    ["autopause", "0"],
    ["autoplay", autoplay ? "1" : "0"],
    ["muted", "0"],
    ["playsinline", "1"],
    ["controls", "1"],
    ["loop", "0"],
  ];
  try {
    const url = new URL(src);
    for (const [key, value] of params) url.searchParams.set(key, value);
    return url.toString();
  } catch {
    const sep = src.includes("?") ? "&" : "?";
    return src + sep + params.map(([key, value]) => `${key}=${value}`).join("&");
  }
}

/** Only a lesson's first video may start by itself, and only with Autoplay on. */
export function vimeoMayAutoplay(videoIndex: number, autoplayOn: boolean): boolean {
  return autoplayOn && videoIndex === 0;
}
