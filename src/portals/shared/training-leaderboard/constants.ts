// Shared visual tokens for the training leaderboard. One place for tier
// colors and badge metadata so cards and legend can never drift apart.

export const GREEN = "#10b981"; // same green as the lesson ticks
export const RING_TRACK = "#e5e7eb";
export const DELTA_DOWN = "#dc2626"; // ▼ moved down; ▲ up reuses GREEN

export const PODIUM = { emoji: "🏆", label: "Podium", meaning: "currently top 3 (live)" };

export const MEDALS = ["🥇", "🥈", "🥉"];
export const MEDAL_EDGE = ["#f59e0b", "#9ca3af", "#b45309"];

const AVATAR_PALETTE = ["#4f46e5", "#db2777", "#0891b2", "#16a34a", "#7c3aed", "#ea580c", "#0d9488", "#b91c1c"];

/** Stable per-name avatar color so a rep's initials circle never changes hue. */
export function avatarColor(name: string): string {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length];
}

export function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0].toUpperCase())
      .join("") || "?"
  );
}
