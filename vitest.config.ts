import { defineConfig } from "vitest/config";

// Scoped intentionally: the ONLY tested modules are the training scoring rules
// (pure, no DB, no React, decides who gets paid), the scoreboard roll-up rules
// (same reasoning), page-title utilities, and the guided-tour pure helpers
// (storage, geometry, step resolution). React components are verified manually:
// there is no jsdom in this project.
//
// Note: src/lib/{leaderboard,acculynx,repcard}/*.test.ts are deliberately absent.
// Those use Node's own runner (`import { test } from "node:test"`), which Vitest
// cannot execute — listing them here yields "No test suite found". Run them with:
//   node --test src/lib/leaderboard/*.test.ts src/lib/acculynx/*.test.ts src/lib/repcard/*.test.ts
export default defineConfig({
  test: {
    include: [
      "src/lib/training/**/*.test.ts",
      "src/lib/scoreboard/**/*.test.ts",
      "src/lib/pageTitle.test.ts",
      "src/portals/shared/guided-tour/**/*.test.ts",
      "src/lib/report/**/*.test.ts",
      // Targeted, NOT the whole leaderboard folder: adding src/lib/leaderboard/**
      // would also wake identity/merge/ranking, which have never run here.
      "src/lib/leaderboard/contractKing.test.ts",
    ],
    environment: "node",
  },
});
