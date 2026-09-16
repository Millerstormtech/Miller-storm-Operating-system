// Rank movement on the Sales Leaderboard: how many places a rep has gained or
// lost since the previous week's photograph of the same month's race.
//
// Pure, so the endpoint and the screen agree (CLAUDE.md convention). The week
// rule (Mondays, UTC) is the app's existing one, borrowed from the training
// board rather than invented again.
export { weekStartMonday } from "../training/board";

export type RankSnapshot = { repId: string; rank: number };

/** "2026-09-16" (or any longer date string) becomes "2026-09". */
export function monthKey(day: string): string {
  return String(day || "").slice(0, 7);
}

/** A week as a plain key the browser can remember having celebrated. */
export function weekKey(weekOf: Date): string {
  return weekOf.toISOString().slice(0, 10);
}

/**
 * Places gained since last week, per rep. Positive = moved up the board.
 * null = nothing honest to say: a rep with no rank last week (new, or their
 * first deal of the month) has not "climbed", they have arrived. The screen
 * draws nothing for null AND nothing for 0, the same rule the training board
 * settled on, so the column stays quiet unless something actually happened.
 */
export function rankDeltas(
  current: Array<{ id: string; rank: number }>,
  previous: RankSnapshot[]
): Map<string, number | null> {
  const was = new Map(previous.map((p) => [p.repId, p.rank]));
  const deltas = new Map<string, number | null>();
  for (const row of current) {
    const before = was.get(row.id);
    deltas.set(row.id, typeof before === "number" ? before - row.rank : null);
  }
  return deltas;
}

/** Celebrate a rep's own climb once a week, and only a real climb. */
export function shouldCelebrateRankMove(
  delta: number | null | undefined,
  seenWeek: string | null,
  week: string
): boolean {
  if (typeof delta !== "number" || delta <= 0) return false;
  if (!week) return false;
  return seenWeek !== week;
}

export function rankMoveCopy(delta: number, rank: number): { mark: string; title: string; line: string } {
  const places = delta === 1 ? "a place" : `${delta} places`;
  return {
    mark: "\u{1F4C8}",
    title: `You moved up ${places}`,
    line: `You are now number ${rank} in the company this month.`,
  };
}
