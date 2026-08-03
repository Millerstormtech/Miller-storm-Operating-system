import { defineConfig } from "vitest/config";

// Scoped intentionally: the ONLY tested modules are the training scoring rules
// (pure, no DB, no React, decides who gets paid), page-title utilities, and the
// guided-tour pure helpers (storage, geometry, step resolution). React
// components are verified manually: there is no jsdom in this project.
export default defineConfig({
  test: {
    include: [
      "src/lib/training/**/*.test.ts",
      "src/lib/stormbot/**/*.test.ts",
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
