import type { Placement, Rect } from "./types";

/** Card width from the visual spec. */
export const CARD_WIDTH = 320;
/** Gap between the spotlight and the card, and the minimum gap to any viewport edge. */
export const CARD_MARGIN = 12;
/** Below this viewport width the card docks as a bottom sheet instead of floating. */
export const PHONE_MAX_WIDTH = 640;
/** How far the spotlight is inflated beyond the target on each side. */
export const SPOTLIGHT_INFLATE = 6;

type Size = { width: number; height: number };

/** A step is skipped when its target is absent or collapsed. One rule covers
 *  role-gated elements, feature toggles, empty states, and the responsive case
 *  where a desktop table and mobile cards both exist but one is CSS-hidden. */
export function isVisible(rect: Rect | null): boolean {
  return !!rect && rect.width > 0 && rect.height > 0;
}

export function isPhoneWidth(viewportWidth: number): boolean {
  return viewportWidth < PHONE_MAX_WIDTH;
}

function fits(target: Rect, card: Size, viewport: Size, placement: Placement): boolean {
  const need = CARD_MARGIN * 2;
  switch (placement) {
    case "top":    return target.top >= card.height + need;
    case "bottom": return viewport.height - (target.top + target.height) >= card.height + need;
    case "left":   return target.left >= card.width + need;
    case "right":  return viewport.width - (target.left + target.width) >= card.width + need;
  }
}

/** Pick the side with room. An explicit preference wins when it fits; otherwise
 *  try bottom, top, right, left in that order. Bottom is the last-resort
 *  fallback because the clamp in positionCard keeps it on screen regardless. */
export function choosePlacement(
  target: Rect,
  card: Size,
  viewport: Size,
  preferred?: Placement
): Placement {
  if (preferred && fits(target, card, viewport, preferred)) return preferred;
  const order: Placement[] = ["bottom", "top", "right", "left"];
  for (const p of order) {
    if (fits(target, card, viewport, p)) return p;
  }
  return "bottom";
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}

/** Position the card for a chosen side, then clamp it inside the viewport.
 *  Measuring first and clamping second is the same approach that fixed the
 *  Tooltip clipping bug on the course leaderboard. */
export function positionCard(
  target: Rect,
  card: Size,
  viewport: Size,
  placement: Placement
): { top: number; left: number } {
  let top: number;
  let left: number;

  if (placement === "top" || placement === "bottom") {
    top = placement === "bottom"
      ? target.top + target.height + CARD_MARGIN
      : target.top - card.height - CARD_MARGIN;
    left = target.left + target.width / 2 - card.width / 2;
  } else {
    left = placement === "right"
      ? target.left + target.width + CARD_MARGIN
      : target.left - card.width - CARD_MARGIN;
    top = target.top + target.height / 2 - card.height / 2;
  }

  return {
    top: clamp(top, CARD_MARGIN, viewport.height - card.height - CARD_MARGIN),
    left: clamp(left, CARD_MARGIN, viewport.width - card.width - CARD_MARGIN),
  };
}

/** The bright cut-out: the target inflated a few pixels so the highlight does
 *  not crop the element it is pointing at. */
export function spotlightRect(target: Rect, inflate: number = SPOTLIGHT_INFLATE): Rect {
  const top = Math.max(0, target.top - inflate);
  const left = Math.max(0, target.left - inflate);
  return {
    top,
    left,
    width: target.width + inflate * 2,
    height: target.height + inflate * 2,
  };
}
