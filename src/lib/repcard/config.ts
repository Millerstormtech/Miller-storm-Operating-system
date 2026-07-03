// src/lib/repcard/config.ts
// Single source of truth for RepCard specifics (confirmed via live probe 2026-07-03).
export const REPCARD_BASE = process.env.REPCARD_BASE || "https://app.repcard.com/api";
export const REPCARD_TIMEZONE = "America/Chicago";
export const REPCARD_LEADERBOARD_ID = "6722788eaa1c6f13b80832af"; // "D2D Leaderboard"
export const REPCARD_LEADERBOARD_NAME = "D2D Leaderboard";
export const REPCARD_VDK_FIELD = "verified_door_knock";
