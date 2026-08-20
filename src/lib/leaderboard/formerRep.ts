// src/lib/leaderboard/formerRep.ts
// Who counts as a FORMER (offboarded) rep, and how the Rep filter's option list
// is built from that answer. Pure: no DB, no React, no I/O.
//
// There are TWO independent signals for "this rep has left", and neither one is
// complete on its own, so they are deliberately OR'd:
//
//   1. `former` — the reliable signal. Set by leaderboard/compute.ts from
//      RepCard's own `status` field (ACTIVE vs DEACTIVATE). Trustworthy when
//      present, but it is null for any rep with no RepCard directory entry
//      (see org-chart.ts, which already hardcodes one such rep), and it stays
//      false for anyone RepCard never actually deactivated.
//
//   2. A cross mark typed into the rep's RepCard name by hand. The board does
//      NOT draw this marker: it arrives as literal characters in the synced
//      name (repcard/mapping.ts builds `firstName lastName` verbatim), put
//      there by whoever administers RepCard.
//
// Signal 2 is what a human actually SEES on the board. Ignoring it would mean a
// rep with a visible ❌ survives "Hide former reps" and still sorts to the top
// of the Rep dropdown, which reads as a broken filter no matter how defensible
// the status field is. So a visible marker counts, even when status says ACTIVE.

/**
 * Cross marks that appear in a synced RepCard name to mean "no longer with us".
 * ❌ (U+274C) is the one in the board's legend and the one in the live data;
 * the rest are the visually identical characters an admin can land on from a
 * phone keyboard or an emoji picker, kept here so one stray variant does not
 * silently un-mark a departed rep.
 */
export const FORMER_NAME_MARKERS = ["❌", "❎", "✖", "✗", "✘", "×"] as const;

/** The minimum a caller must supply. Extra fields are ignored. */
export interface FormerRepInput {
  name?: string | null;
  former?: boolean | null;
}

/** True when RepCard says the rep is deactivated OR their name carries a cross mark. */
export function isFormerRep(rep: FormerRepInput): boolean {
  if (rep?.former === true) return true;
  const name = rep?.name ?? "";
  return FORMER_NAME_MARKERS.some((m) => name.includes(m));
}

/**
 * The rep's name with any cross mark (and the whitespace around it) removed.
 *
 * The board shows the RepCard name verbatim, marker and all, and that is
 * correct there: the marker is the whole point of the column. But a Storm Chat
 * celebration naming "❌ Dakota Porter" reads as a glitch, so announcements
 * strip it. Returns the original string when there is nothing to strip.
 *
 * Accepts null/undefined because several of the fields that reach here are
 * optional on the wire (the YTD podium's `behindName` is `string | null`, and a
 * row's name can be absent). The body has always handled that; the signature now
 * says so, rather than forcing every caller into its own `?? ""` and inviting one
 * of them to forget.
 */
export function stripFormerMarker(name: string | null | undefined): string {
  let out = name ?? "";
  for (const m of FORMER_NAME_MARKERS) out = out.split(m).join(" ");
  return out.replace(/\s+/g, " ").trim();
}

export interface RepOption {
  id: string;
  /** DISPLAY name, already stripped of any cross mark. See buildRepOptions. */
  name: string;
  former: boolean;
}

/**
 * Order for the Rep filter dropdown: current reps first (A to Z), then former
 * reps (A to Z).
 *
 * Two separate things go wrong if you sort raw names, and the `former` key only
 * fixes the first:
 *   1. ACROSS groups: a cross mark sorts ahead of every letter, so departed reps
 *      pile up at the TOP of the list, above everyone still selling.
 *   2. WITHIN the former group: the marker is present on some names and absent
 *      on others (it is frozen into the knock-fact snapshot only for reps who
 *      were deactivated before their last knock), so the marked ones jump ahead
 *      of the unmarked ones and the group is not alphabetical either.
 *
 * `RepOption.name` is therefore the STRIPPED name, so this comparison sorts on
 * exactly the text the user reads.
 */
export function compareRepOptions(a: RepOption, b: RepOption): number {
  return Number(a.former) - Number(b.former) || a.name.localeCompare(b.name);
}

/**
 * Board rows -> the Rep filter's option list: de-duplicated by id, then ordered
 * by compareRepOptions.
 *
 * `hideFormer` mirrors the "Hide former reps" checkbox. When it is on, former
 * reps are dropped from the dropdown entirely, so the filter cannot offer a
 * rep the board is currently refusing to show. Already-applied selections are
 * NOT touched here: unchecking the box must bring the old choice back rather
 * than silently discarding it.
 */
export function buildRepOptions(
  rows: ReadonlyArray<{ id?: string | null; name?: string | null; former?: boolean | null }>,
  opts: { hideFormer: boolean }
): RepOption[] {
  const seen = new Map<string, RepOption>();
  for (const r of rows) {
    if (!r?.id || seen.has(r.id)) continue;
    // Order matters: detect the marker on the RAW name, then store the stripped
    // one. Stripping first would erase the very signal isFormerRep reads.
    const former = isFormerRep(r);
    if (opts.hideFormer && former) continue;
    seen.set(r.id, { id: r.id, name: stripFormerMarker(r.name || "") || "Unknown Rep", former });
  }
  return [...seen.values()].sort(compareRepOptions);
}
