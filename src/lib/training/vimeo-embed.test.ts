import { describe, it, expect } from "vitest";
import { vimeoPlayerSrc, vimeoMayAutoplay } from "./vimeo-embed";

// The shape the Course Builder saves: video id plus the privacy hash.
const EMBED = "https://player.vimeo.com/video/1158633554?h=7db231f045";

const param = (src: string | null, key: string) => new URL(src as string).searchParams.getAll(key);

describe("vimeoPlayerSrc", () => {
  it("switches the player API on and keeps the video id and privacy hash", () => {
    const src = vimeoPlayerSrc(EMBED, false);
    expect(new URL(src as string).pathname).toBe("/video/1158633554");
    expect(param(src, "h")).toEqual(["7db231f045"]);
    expect(param(src, "api")).toEqual(["1"]);
    expect(param(src, "playsinline")).toEqual(["1"]);
  });

  it("starts the video only when told to", () => {
    expect(param(vimeoPlayerSrc(EMBED, false), "autoplay")).toEqual(["0"]);
    expect(param(vimeoPlayerSrc(EMBED, true), "autoplay")).toEqual(["1"]);
  });

  it("overrides an embed that was saved with autoplay on", () => {
    expect(param(vimeoPlayerSrc(EMBED + "&autoplay=1", false), "autoplay")).toEqual(["0"]);
  });

  it("returns null once the API is on, so a re-initialised lesson does not reload the video", () => {
    const prepared = vimeoPlayerSrc(EMBED, true) as string;
    expect(vimeoPlayerSrc(prepared, false)).toBeNull();
  });

  it("returns null for an iframe with no src", () => {
    expect(vimeoPlayerSrc("", true)).toBeNull();
  });

  it("appends the parameters when the src is not an absolute URL", () => {
    expect(vimeoPlayerSrc("//player.vimeo.com/video/1", false)).toBe(
      "//player.vimeo.com/video/1?api=1&autopause=0&autoplay=0&muted=0&playsinline=1&controls=1&loop=0"
    );
  });
});

describe("vimeoMayAutoplay", () => {
  it("lets only the first video start by itself, and only with Autoplay on", () => {
    expect(vimeoMayAutoplay(0, true)).toBe(true);
    expect(vimeoMayAutoplay(1, true)).toBe(false);
    expect(vimeoMayAutoplay(0, false)).toBe(false);
    expect(vimeoMayAutoplay(2, false)).toBe(false);
  });
});
