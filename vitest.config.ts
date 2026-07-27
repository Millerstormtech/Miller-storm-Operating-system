import { defineConfig } from "vitest/config";

// Scoped intentionally: the ONLY tested modules are the training scoring rules
// (pure, no DB, no React, decides who gets paid) and page-title utilities.
export default defineConfig({
  test: {
    include: ["src/lib/training/**/*.test.ts", "src/lib/pageTitle.test.ts"],
    environment: "node",
  },
});
