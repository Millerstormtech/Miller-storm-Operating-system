import { describe, it, expect } from "vitest";
import { vimeoRefOf, vimeoOembedUrl } from "./vimeo-oembed";

describe("vimeoRefOf", () => {
  it("reads the id and hash from a videoUrl with the hash in the path", () => {
    expect(vimeoRefOf("https://vimeo.com/1176674471/01bd539e2e?fl=ml&fe=ec")).toEqual({ id: "1176674471", hash: "01bd539e2e" });
  });

  it("reads a hash passed as ?h=", () => {
    expect(vimeoRefOf("https://vimeo.com/1176674471?h=01bd539e2e")).toEqual({ id: "1176674471", hash: "01bd539e2e" });
  });

  it("reads a public video with no hash", () => {
    expect(vimeoRefOf("https://vimeo.com/1176674471")).toEqual({ id: "1176674471", hash: null });
  });

  it("falls back to the iframe in the lesson body", () => {
    const body = '<p>Intro</p><iframe src="https://player.vimeo.com/video/1158633554?h=7db231f045" loading="lazy" allow="autoplay"></iframe>';
    expect(vimeoRefOf("", body)).toEqual({ id: "1158633554", hash: "7db231f045" });
  });

  it("finds the hash when it is not the first query parameter", () => {
    const body = '<iframe src="https://player.vimeo.com/video/1158633554?badge=0&h=7db231f045"></iframe>';
    expect(vimeoRefOf(null, body)).toEqual({ id: "1158633554", hash: "7db231f045" });
  });

  it("is null for lessons that are not on Vimeo", () => {
    expect(vimeoRefOf("https://www.loom.com/share/abc123", "<p>text</p>")).toBeNull();
    expect(vimeoRefOf(undefined, undefined)).toBeNull();
  });
});

describe("vimeoOembedUrl", () => {
  it("puts the hash in the page URL it asks about", () => {
    expect(vimeoOembedUrl({ id: "1176674471", hash: "01bd539e2e" })).toBe(
      "https://vimeo.com/api/oembed.json?url=https%3A%2F%2Fvimeo.com%2F1176674471%2F01bd539e2e"
    );
  });

  it("works without a hash", () => {
    expect(vimeoOembedUrl({ id: "1176674471", hash: null })).toBe(
      "https://vimeo.com/api/oembed.json?url=https%3A%2F%2Fvimeo.com%2F1176674471"
    );
  });
});
