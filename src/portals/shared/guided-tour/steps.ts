import { isVisible } from "./placement";
import type { Rect, TourStep } from "./types";

/** Looks up a data-tour target and reports its rectangle, or null if it is not
 *  on screen. Injected so this module stays DOM free and unit testable. */
export type Measure = (target: string) => Rect | null;

/** Indexes of the steps whose target is actually on screen right now. Every
 *  skip case in the spec reduces to this one check: role-gated elements,
 *  feature toggles, empty states, and CSS-hidden responsive variants. */
export function visibleStepIndexes(steps: TourStep[], measure: Measure): number[] {
  const out: number[] = [];
  steps.forEach((step, i) => {
    if (isVisible(measure(step.target))) out.push(i);
  });
  return out;
}

export function firstIndex(visible: number[]): number | null {
  return visible.length ? visible[0] : null;
}

/** The next visible step after `current`. Works even when `current` itself has
 *  vanished mid-tour, because it searches by value rather than by position. */
export function nextIndex(current: number, visible: number[]): number | null {
  for (const i of visible) {
    if (i > current) return i;
  }
  return null;
}

export function prevIndex(current: number, visible: number[]): number | null {
  let found: number | null = null;
  for (const i of visible) {
    if (i < current) found = i;
    else break;
  }
  return found;
}

export function isLastIndex(current: number, visible: number[]): boolean {
  return nextIndex(current, visible) === null;
}

/** "2 of 5", counted against visible steps so a skipped step never leaves a
 *  hole in the counter. */
export function stepPosition(current: number, visible: number[]): { current: number; total: number } {
  const pos = visible.indexOf(current);
  return { current: pos === -1 ? 1 : pos + 1, total: visible.length };
}
