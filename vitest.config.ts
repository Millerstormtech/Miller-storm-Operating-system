import { defineConfig } from "vitest/config";

// Scoped intentionally: the ONLY tested modules are the training scoring rules
// (pure, no DB, no React, decides who gets paid), the scoreboard roll-up rules
// (same reasoning), page-title utilities, and the guided-tour pure helpers
// (storage, geometry, step resolution). React components are verified manually:
// there is no jsdom in this project.
//
// THIS REPO HAS TWO TEST RUNNERS. This config is one half; `npm run test:node`
// is the other. src/lib/leaderboard/{identity,merge,ranking}, src/lib/acculynx/
// and src/lib/repcard/ are written against node:test, which Vitest cannot
// execute, so they run there instead. `npm run test:all` runs both.
//
// Because the two runners share the src/lib/leaderboard/ folder, neither side
// may use a bare folder glob: `npm run test:node` names its three files
// explicitly so it does not pick up contractKing.test.ts (Vitest, listed below),
// and this include names contractKing.test.ts explicitly so it does not pick up
// the three node:test files. When adding a test to that folder, match the runner
// you intend and add it to the matching list.
export default defineConfig({
  test: {
    include: [
      "src/lib/training/**/*.test.ts",
      "src/lib/stormbot/**/*.test.ts",
      "src/lib/stormchat/**/*.test.ts",
      "src/lib/scoreboard/**/*.test.ts",
      "src/lib/businessPlan/**/*.test.ts",
      "src/lib/pageTitle.test.ts",
      "src/lib/subdomain.test.ts",
      "src/portals/shared/guided-tour/**/*.test.ts",
      "src/lib/report/**/*.test.ts",
      "src/lib/tasks/**/*.test.ts",
      // Targeted, NOT the whole leaderboard folder: adding src/lib/leaderboard/**
      // would also wake identity/merge/ranking, which have never run here.
      "src/lib/leaderboard/contractKing.test.ts",
      "src/lib/leaderboard/conversion.test.ts",
      "src/lib/leaderboard/formerRep.test.ts",
      "src/lib/design/**/*.test.ts",
    ],
    environment: "node",
  },
});
