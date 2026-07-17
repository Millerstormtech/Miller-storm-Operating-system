import { defineConfig } from "vitest/config";

// Scoped intentionally: the ONLY tested module is the training scoring rules,
// because they are pure (no DB, no React) and they decide who gets paid.
export default defineConfig({
  test: {
    include: ["src/lib/training/**/*.test.ts"],
    environment: "node",
  },
});
