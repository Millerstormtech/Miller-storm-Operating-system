// Shared visual tokens for the training leaderboard. One place for tier
// colors and badge metadata so cards and legend can never drift apart.
import type { RankTitle, BadgeId } from "../../../lib/training/scoring";

export const GREEN = "#10b981"; // same green as the lesson ticks
export const RING_TRACK = "#e5e7eb";

export const TIER_COLORS: Record<RankTitle, { bg: string; fg: string }> = {
  Rookie: { bg: "#f3f4f6", fg: "#6b7280" },
  Rising: { bg: "#dbeafe", fg: "#1d4ed8" },
  Pro: { bg: "#dcfce7", fg: "#15803d" },
  Ace: { bg: "#ede9fe", fg: "#6d28d9" },
  Elite: { bg: "#fef3c7", fg: "#b45309" },
  Legend: { bg: "linear-gradient(90deg,#fde68a,#fca5a5)", fg: "#7c2d12" },
};

// Copy rule: "Label: meaning". Colons, never em dashes.
export const BADGE_META: Record<BadgeId, { emoji: string; label: string; meaning: string }> = {
  halfway: { emoji: "🚀", label: "Halfway", meaning: "50% of the library" },
  finisher: { emoji: "🏁", label: "Finisher", meaning: "a course fully done" },
  graduate: { emoji: "🎓", label: "Graduate", meaning: "every course done" },
  "test-ace": { emoji: "🎯", label: "Test Ace", meaning: "100% on a Final Test" },
};

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
