import { describe, it, expect } from "vitest";
import {
  isVisible, isPhoneWidth, choosePlacement, positionCard, spotlightRect,
  CARD_MARGIN, PHONE_MAX_WIDTH,
} from "./placement";

const VIEWPORT = { width: 1280, height: 800 };
const CARD = { width: 320, height: 160 };

describe("isVisible", () => {
  it("rejects null", () => { expect(isVisible(null)).toBe(false); });
  it("rejects a zero-width rect (the responsive-hidden case)", () => {
    expect(isVisible({ top: 10, left: 10, width: 0, height: 40 })).toBe(false);
  });
  it("rejects a zero-height rect", () => {
    expect(isVisible({ top: 10, left: 10, width: 40, height: 0 })).toBe(false);
  });
  it("accepts a real rect", () => {
    expect(isVisible({ top: 10, left: 10, width: 40, height: 40 })).toBe(true);
  });
});

describe("isPhoneWidth", () => {
  it("is true below the breakpoint", () => { expect(isPhoneWidth(390)).toBe(true); });
  it("is false at the breakpoint", () => { expect(isPhoneWidth(PHONE_MAX_WIDTH)).toBe(false); });
  it("is false on desktop", () => { expect(isPhoneWidth(1280)).toBe(false); });
});

describe("choosePlacement", () => {
  it("honours an explicit preference when it fits", () => {
    const target = { top: 300, left: 500, width: 200, height: 60 };
    expect(choosePlacement(target, CARD, VIEWPORT, "left")).toBe("left");
  });
  it("ignores a preference that does not fit and picks a side that does", () => {
    const target = { top: 300, left: 0, width: 200, height: 60 };
    expect(choosePlacement(target, CARD, VIEWPORT, "left")).not.toBe("left");
  });
  it("puts the card below a target near the top", () => {
    const target = { top: 10, left: 500, width: 200, height: 60 };
    expect(choosePlacement(target, CARD, VIEWPORT)).toBe("bottom");
  });
  it("puts the card above a target near the bottom", () => {
    const target = { top: 700, left: 500, width: 200, height: 60 };
    expect(choosePlacement(target, CARD, VIEWPORT)).toBe("top");
  });
  it("falls back to bottom for a target that fills the viewport", () => {
    const target = { top: 0, left: 0, width: 1280, height: 800 };
    expect(choosePlacement(target, CARD, VIEWPORT)).toBe("bottom");
  });
});

describe("positionCard", () => {
  it("places a bottom card under the target, horizontally centred", () => {
    const target = { top: 100, left: 500, width: 200, height: 60 };
    const pos = positionCard(target, CARD, VIEWPORT, "bottom");
    expect(pos.top).toBe(100 + 60 + CARD_MARGIN);
    expect(pos.left).toBe(500 + 100 - 160);
  });
  it("places a top card above the target", () => {
    const target = { top: 400, left: 500, width: 200, height: 60 };
    const pos = positionCard(target, CARD, VIEWPORT, "top");
    expect(pos.top).toBe(400 - CARD.height - CARD_MARGIN);
  });
  it("clamps a card that would overflow the left edge", () => {
    const target = { top: 300, left: 0, width: 40, height: 40 };
    const pos = positionCard(target, CARD, VIEWPORT, "bottom");
    expect(pos.left).toBe(CARD_MARGIN);
  });
  it("clamps a card that would overflow the right edge", () => {
    const target = { top: 300, left: 1260, width: 20, height: 40 };
    const pos = positionCard(target, CARD, VIEWPORT, "bottom");
    expect(pos.left).toBe(VIEWPORT.width - CARD.width - CARD_MARGIN);
  });
  it("clamps a card that would overflow the top edge", () => {
    const target = { top: 5, left: 500, width: 200, height: 20 };
    const pos = positionCard(target, CARD, VIEWPORT, "top");
    expect(pos.top).toBe(CARD_MARGIN);
  });
  it("never returns a negative coordinate", () => {
    const target = { top: 0, left: 0, width: 10, height: 10 };
    const pos = positionCard(target, CARD, { width: 200, height: 200 }, "top");
    expect(pos.top).toBeGreaterThanOrEqual(0);
    expect(pos.left).toBeGreaterThanOrEqual(0);
  });
});

describe("spotlightRect", () => {
  it("inflates the target by the given padding on every side", () => {
    const r = spotlightRect({ top: 100, left: 200, width: 50, height: 40 }, 6);
    expect(r).toEqual({ top: 94, left: 194, width: 62, height: 52 });
  });
  it("does not push the spotlight off the top of the page", () => {
    const r = spotlightRect({ top: 2, left: 2, width: 50, height: 40 }, 6);
    expect(r.top).toBe(0);
    expect(r.left).toBe(0);
  });
});
